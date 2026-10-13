from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
import os
import secrets
import pathlib
import uuid
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles, can_access_engagement
from app.models.models import (
    Engagement, Section, Folder, WorkingPaper, EngagementUser, User, ReviewNote,
    FileVersion, FinalAuditArchive, ESignatureRequest, ClientRequest, ClientRequestComment
)
from app.schemas.schemas import (
    EngagementCreate, EngagementOut, EngagementDetail, RollForwardRequest,
    QualityCheckSummary, FinalAssemblyCreate, FinalAssemblyStatus,
    FinalAuditArchiveOut, ESignatureCreate, ESignatureSign, ESignatureOut,
    ClientRequestCreate, ClientRequestUpdate, ClientRequestOut,
    ClientRequestCommentCreate, ClientRequestCommentOut
)
from app.services.events import emit_event
from app.services.audit_file_templates import create_standard_audit_file
from app.services.quality_checks import run_quality_checks
from app.services.final_assembly import build_final_archive, post_assembly_changes
from app.core.config import SECTION_CODES, SECTION_NAMES, ENGAGEMENT_TYPES
from app.core.config import settings

router = APIRouter(prefix="/engagements", tags=["engagements"])

def auto_create_sections(db: Session, engagement_id: str):
    for code in SECTION_CODES:
        sec = Section(
            engagement_id=engagement_id,
            section_code=code,
            section_name=SECTION_NAMES[code]
        )
        db.add(sec)

def normalise_engagement_type(value: str) -> str:
    legacy = {
        "statutory-audit": "statutory-audit-corporate",
        "internal-audit": "other-assurance-related",
    }
    return legacy.get(value, value)

def client_request_to_out(db: Session, req: ClientRequest) -> ClientRequestOut:
    result = ClientRequestOut.model_validate(req)
    result.comments_count = db.query(ClientRequestComment).filter(
        ClientRequestComment.request_id == req.request_id
    ).count()
    return result

def get_engagement_or_404(db: Session, engagement_id: str, current_user: User) -> Engagement:
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if not can_access_engagement(eng, current_user, db):
        raise HTTPException(status_code=403, detail={"error": "Access denied", "code": "INSUFFICIENT_ROLE"})
    return eng

@router.get("", response_model=list[EngagementOut])
def list_engagements(
    status: Optional[str] = Query(None),
    financial_year: Optional[str] = Query(None),
    client_name: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Engagement)

    # Role-based scoping
    if current_user.role in ("Articled Assistant", "Audit Executive"):
        assigned_ids = [eu.engagement_id for eu in
                        db.query(EngagementUser).filter(EngagementUser.user_id == current_user.user_id).all()]
        q = q.filter(Engagement.engagement_id.in_(assigned_ids))

    if status:
        q = q.filter(Engagement.status == status)
    if financial_year:
        q = q.filter(Engagement.financial_year == financial_year)
    if client_name:
        q = q.filter(Engagement.client_name.ilike(f"%{client_name}%"))

    return [EngagementOut.model_validate(e) for e in q.order_by(Engagement.created_at.desc()).all()]

@router.post("", response_model=dict, status_code=201)
def create_engagement(
    payload: EngagementCreate,
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    engagement_type = normalise_engagement_type(payload.engagement_type)
    if engagement_type not in ENGAGEMENT_TYPES:
        raise HTTPException(status_code=400, detail={"error": "Unsupported engagement type", "code": "INVALID_ENGAGEMENT_TYPE"})

    dup = db.query(Engagement).filter(
        Engagement.client_name == payload.client_name,
        Engagement.financial_year == payload.financial_year
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail={"error": "Duplicate engagement", "code": "DUPLICATE"})

    eng = Engagement(
        client_name=payload.client_name,
        financial_year=payload.financial_year,
        engagement_type=engagement_type,
        is_eqcr_designated=payload.is_eqcr_designated,
        is_small_entity=payload.is_small_entity,
        created_by=current_user.user_id,
        status="Active"
    )
    db.add(eng)
    db.flush()
    auto_create_sections(db, eng.engagement_id)
    db.flush()
    create_standard_audit_file(db, eng.engagement_id, current_user.user_id, seed_templates=False)

    # Auto-assign all Partners
    partners = db.query(User).filter(User.role == "Partner", User.is_active == True).all()
    for p in partners:
        eu = EngagementUser(engagement_id=eng.engagement_id, user_id=p.user_id, role="Reviewer", assigned_by=current_user.user_id)
        db.add(eu)

    # Assign creator if not already Partner
    if current_user.role not in ("Partner",):
        creator_role = "Reviewer" if current_user.role in ("Audit Manager", "Admin") else "Preparer"
        eu = EngagementUser(engagement_id=eng.engagement_id, user_id=current_user.user_id, role=creator_role, assigned_by=current_user.user_id)
        db.add(eu)

    emit_event(db, "engagement.created", current_user.user_id, current_user.full_name,
               engagement_id=eng.engagement_id, payload={"client_name": eng.client_name, "fy": eng.financial_year})
    db.commit()
    db.refresh(eng)
    return {"data": EngagementOut.model_validate(eng), "message": "Engagement created with standard audit file structure"}

@router.get("/{engagement_id}", response_model=EngagementDetail)
def get_engagement(
    engagement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if not can_access_engagement(eng, current_user, db):
        raise HTTPException(status_code=403, detail={"error": "Access denied", "code": "INSUFFICIENT_ROLE"})
    from app.schemas.schemas import SectionOut
    result = EngagementDetail.model_validate(eng)
    sections = db.query(Section).filter(
        Section.engagement_id == engagement_id
    ).order_by(Section.section_code).all()
    result.sections = [SectionOut.model_validate(s) for s in sections]
    return result

@router.get("/{engagement_id}/quality-checks", response_model=QualityCheckSummary)
def get_quality_checks(
    engagement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if not can_access_engagement(eng, current_user, db):
        raise HTTPException(status_code=403, detail={"error": "Access denied", "code": "INSUFFICIENT_ROLE"})
    return run_quality_checks(db, engagement_id)

@router.get("/{engagement_id}/client-requests", response_model=list[ClientRequestOut])
def list_client_requests(
    engagement_id: str,
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_engagement_or_404(db, engagement_id, current_user)
    q = db.query(ClientRequest).filter(ClientRequest.engagement_id == engagement_id)
    if status:
        q = q.filter(ClientRequest.status == status)
    return [
        client_request_to_out(db, req)
        for req in q.order_by(ClientRequest.due_date.asc(), ClientRequest.created_at.desc()).all()
    ]

@router.post("/{engagement_id}/client-requests", response_model=dict, status_code=201)
def create_client_request(
    engagement_id: str,
    payload: ClientRequestCreate,
    current_user: User = Depends(require_roles("Audit Executive", "Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    eng = get_engagement_or_404(db, engagement_id, current_user)
    if eng.status in ("Archived", "Finalised"):
        raise HTTPException(status_code=400, detail={"error": "Engagement is locked", "code": "ENGAGEMENT_LOCKED"})
    owner = db.query(User).filter(User.user_id == payload.owner_user_id).first() if payload.owner_user_id else current_user
    req = ClientRequest(
        engagement_id=engagement_id,
        title=payload.title,
        description=payload.description,
        request_type=payload.request_type,
        priority=payload.priority,
        due_date=payload.due_date,
        owner_user_id=owner.user_id if owner else None,
        owner_name=owner.full_name if owner else None,
        client_contact_name=payload.client_contact_name,
        client_contact_email=payload.client_contact_email,
        created_by=current_user.user_id,
        created_by_name=current_user.full_name,
    )
    db.add(req)
    db.flush()
    emit_event(db, "client_request.created", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id, payload={"request_id": req.request_id, "title": req.title})
    db.commit()
    db.refresh(req)
    return {"data": client_request_to_out(db, req), "message": "Client request created"}

@router.patch("/client-requests/{request_id}", response_model=dict)
def update_client_request(
    request_id: str,
    payload: ClientRequestUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(ClientRequest).filter(ClientRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "Client request not found", "code": "NOT_FOUND"})
    eng = get_engagement_or_404(db, req.engagement_id, current_user)
    if eng.status in ("Archived", "Finalised"):
        raise HTTPException(status_code=400, detail={"error": "Engagement is locked", "code": "ENGAGEMENT_LOCKED"})

    for field in ("title", "description", "request_type", "priority", "due_date", "client_contact_name", "client_contact_email", "status"):
        value = getattr(payload, field)
        if value is not None:
            setattr(req, field, value)
    if payload.owner_user_id is not None:
        owner = db.query(User).filter(User.user_id == payload.owner_user_id).first()
        req.owner_user_id = owner.user_id if owner else None
        req.owner_name = owner.full_name if owner else None
    emit_event(db, "client_request.updated", current_user.user_id, current_user.full_name,
               engagement_id=req.engagement_id, payload={"request_id": req.request_id, "status": req.status})
    db.commit()
    db.refresh(req)
    return {"data": client_request_to_out(db, req), "message": "Client request updated"}

@router.get("/client-requests/{request_id}/comments", response_model=list[ClientRequestCommentOut])
def list_client_request_comments(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(ClientRequest).filter(ClientRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "Client request not found", "code": "NOT_FOUND"})
    get_engagement_or_404(db, req.engagement_id, current_user)
    rows = db.query(ClientRequestComment).filter(
        ClientRequestComment.request_id == request_id
    ).order_by(ClientRequestComment.created_at.asc()).all()
    return [ClientRequestCommentOut.model_validate(row) for row in rows]

@router.post("/client-requests/{request_id}/comments", response_model=dict, status_code=201)
def add_client_request_comment(
    request_id: str,
    payload: ClientRequestCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(ClientRequest).filter(ClientRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "Client request not found", "code": "NOT_FOUND"})
    get_engagement_or_404(db, req.engagement_id, current_user)
    comment = ClientRequestComment(
        request_id=request_id,
        engagement_id=req.engagement_id,
        comment_text=payload.comment_text,
        author_id=current_user.user_id,
        author_name=current_user.full_name,
        author_role=current_user.role,
    )
    db.add(comment)
    db.flush()
    emit_event(db, "client_request.comment", current_user.user_id, current_user.full_name,
               engagement_id=req.engagement_id, payload={"request_id": req.request_id})
    db.commit()
    db.refresh(comment)
    return {"data": ClientRequestCommentOut.model_validate(comment), "message": "Comment added"}

@router.post("/client-requests/{request_id}/upload", response_model=dict)
async def upload_client_request_file(
    request_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(ClientRequest).filter(ClientRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "Client request not found", "code": "NOT_FOUND"})
    eng = get_engagement_or_404(db, req.engagement_id, current_user)
    if eng.status in ("Archived", "Finalised"):
        raise HTTPException(status_code=400, detail={"error": "Engagement is locked", "code": "ENGAGEMENT_LOCKED"})
    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(status_code=400, detail={"error": "File exceeds 100 MB limit", "code": "FILE_TOO_LARGE"})
    base = pathlib.Path(settings.FILE_STORAGE_PATH) / req.engagement_id / "client-requests"
    base.mkdir(parents=True, exist_ok=True)
    safe_filename = pathlib.Path(file.filename or "client-document").name
    dest = base / f"{uuid.uuid4()}_{safe_filename}"
    with open(dest, "wb") as f:
        f.write(content)
    req.uploaded_file_name = safe_filename
    req.uploaded_file_path = str(dest)
    req.uploaded_file_size = len(content)
    req.uploaded_by_name = current_user.full_name
    req.uploaded_at = datetime.utcnow()
    req.status = "Received"
    emit_event(db, "client_request.uploaded", current_user.user_id, current_user.full_name,
               engagement_id=req.engagement_id, payload={"request_id": req.request_id, "filename": safe_filename})
    db.commit()
    db.refresh(req)
    return {"data": client_request_to_out(db, req), "message": "Client document uploaded"}

@router.get("/client-requests/{request_id}/download")
def download_client_request_file(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(ClientRequest).filter(ClientRequest.request_id == request_id).first()
    if not req or not req.uploaded_file_path:
        raise HTTPException(status_code=404, detail={"error": "Uploaded file not found", "code": "NOT_FOUND"})
    get_engagement_or_404(db, req.engagement_id, current_user)
    if not os.path.exists(req.uploaded_file_path):
        raise HTTPException(status_code=404, detail={"error": "Uploaded file not found", "code": "NOT_FOUND"})
    return FileResponse(req.uploaded_file_path, filename=req.uploaded_file_name)

@router.post("/client-requests/{request_id}/remind", response_model=dict)
def remind_client_request(
    request_id: str,
    current_user: User = Depends(require_roles("Audit Executive", "Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    req = db.query(ClientRequest).filter(ClientRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "Client request not found", "code": "NOT_FOUND"})
    get_engagement_or_404(db, req.engagement_id, current_user)
    emit_event(db, "client_request.reminder", current_user.user_id, current_user.full_name,
               engagement_id=req.engagement_id, payload={"request_id": req.request_id, "email": req.client_contact_email})
    db.commit()
    return {"data": None, "message": "Reminder recorded"}

def archive_to_out(db: Session, archive: FinalAuditArchive) -> FinalAuditArchiveOut:
    result = FinalAuditArchiveOut.model_validate(archive)
    result.post_assembly_changes = post_assembly_changes(db, archive)
    return result

@router.get("/{engagement_id}/final-assembly", response_model=FinalAssemblyStatus)
def get_final_assembly_status(
    engagement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if not can_access_engagement(eng, current_user, db):
        raise HTTPException(status_code=403, detail={"error": "Access denied", "code": "INSUFFICIENT_ROLE"})
    archives = db.query(FinalAuditArchive).filter(
        FinalAuditArchive.engagement_id == engagement_id
    ).order_by(FinalAuditArchive.assembled_at.desc()).all()
    archive_out = [archive_to_out(db, archive) for archive in archives]
    return FinalAssemblyStatus(
        engagement_id=engagement_id,
        is_locked=eng.status in ("Finalised", "Archived"),
        latest_archive=archive_out[0] if archive_out else None,
        archives=archive_out,
    )

@router.post("/{engagement_id}/final-assembly", response_model=dict)
def create_final_assembly(
    engagement_id: str,
    payload: FinalAssemblyCreate,
    current_user: User = Depends(require_roles("Partner", "Admin")),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if eng.status == "Archived":
        raise HTTPException(status_code=400, detail={"error": "Archived engagement cannot be assembled again", "code": "ENGAGEMENT_ARCHIVED"})

    quality = run_quality_checks(db, engagement_id)
    if quality.critical > 0 and not payload.force:
        raise HTTPException(status_code=400, detail={
            "error": f"{quality.critical} critical quality issue(s) must be cleared or force assembly must be used",
            "code": "QUALITY_ISSUES_EXIST"
        })

    archive = build_final_archive(db, eng, current_user.user_id, current_user.full_name)
    eng.status = "Finalised"
    eng.archived_at = datetime.utcnow()
    eng.archived_by = current_user.user_id
    emit_event(db, "final_file.assembled", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id, payload={"archive_id": archive.archive_id, "quality_score": archive.quality_score})
    db.commit()
    db.refresh(archive)
    return {"data": archive_to_out(db, archive), "message": "Final audit file assembled and engagement locked"}

@router.get("/{engagement_id}/final-assembly/{archive_id}/download")
def download_final_archive(
    engagement_id: str,
    archive_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng or not can_access_engagement(eng, current_user, db):
        raise HTTPException(status_code=404, detail={"error": "Archive not found", "code": "NOT_FOUND"})
    archive = db.query(FinalAuditArchive).filter(
        FinalAuditArchive.archive_id == archive_id,
        FinalAuditArchive.engagement_id == engagement_id
    ).first()
    if not archive or not os.path.exists(archive.file_storage_path):
        raise HTTPException(status_code=404, detail={"error": "Archive file not found", "code": "NOT_FOUND"})
    return FileResponse(archive.file_storage_path, filename=archive.archive_name)

@router.get("/{engagement_id}/e-signatures", response_model=list[ESignatureOut])
def list_e_signatures(
    engagement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if not can_access_engagement(eng, current_user, db):
        raise HTTPException(status_code=403, detail={"error": "Access denied", "code": "INSUFFICIENT_ROLE"})
    rows = db.query(ESignatureRequest).filter(
        ESignatureRequest.engagement_id == engagement_id
    ).order_by(ESignatureRequest.requested_at.desc()).all()
    return [ESignatureOut.model_validate(row) for row in rows]

@router.post("/{engagement_id}/e-signatures", response_model=dict, status_code=201)
def create_e_signature_request(
    engagement_id: str,
    payload: ESignatureCreate,
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if eng.status in ("Archived", "Finalised"):
        raise HTTPException(status_code=400, detail={"error": "Engagement is locked", "code": "ENGAGEMENT_LOCKED"})
    if payload.wp_id:
        wp = db.query(WorkingPaper).filter(
            WorkingPaper.wp_id == payload.wp_id,
            WorkingPaper.engagement_id == engagement_id,
            WorkingPaper.is_deleted == False
        ).first()
        if not wp:
            raise HTTPException(status_code=404, detail={"error": "Working paper not found", "code": "NOT_FOUND"})
    req = ESignatureRequest(
        engagement_id=engagement_id,
        wp_id=payload.wp_id,
        document_type=payload.document_type,
        signer_name=payload.signer_name,
        signer_email=payload.signer_email,
        token=secrets.token_urlsafe(32),
        requested_by=current_user.user_id,
        requested_by_name=current_user.full_name,
    )
    db.add(req)
    emit_event(db, "esignature.created", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id, payload={"request_id": req.request_id, "document_type": req.document_type})
    db.commit()
    db.refresh(req)
    return {"data": ESignatureOut.model_validate(req), "message": "E-signature request created"}

@router.post("/e-signatures/{request_id}/sign", response_model=dict)
def sign_e_signature_request(
    request_id: str,
    payload: ESignatureSign,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(ESignatureRequest).filter(ESignatureRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "E-signature request not found", "code": "NOT_FOUND"})
    eng = db.query(Engagement).filter(Engagement.engagement_id == req.engagement_id).first()
    if not eng or not can_access_engagement(eng, current_user, db):
        raise HTTPException(status_code=403, detail={"error": "Access denied", "code": "INSUFFICIENT_ROLE"})
    if req.status != "Pending":
        raise HTTPException(status_code=400, detail={"error": "Request is not pending", "code": "VALIDATION_ERROR"})
    req.status = "Signed"
    req.signed_at = datetime.utcnow()
    req.signed_by_name = payload.signer_name.strip() or current_user.full_name
    req.signature_text = payload.signature_text.strip()
    req.ip_address = request.client.host if request.client else None
    emit_event(db, "esignature.signed", current_user.user_id, current_user.full_name,
               engagement_id=req.engagement_id, payload={"request_id": req.request_id, "document_type": req.document_type})
    db.commit()
    db.refresh(req)
    return {"data": ESignatureOut.model_validate(req), "message": "Document signed"}

@router.patch("/e-signatures/{request_id}/cancel", response_model=dict)
def cancel_e_signature_request(
    request_id: str,
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    req = db.query(ESignatureRequest).filter(ESignatureRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "E-signature request not found", "code": "NOT_FOUND"})
    if req.status != "Pending":
        raise HTTPException(status_code=400, detail={"error": "Only pending requests can be cancelled", "code": "VALIDATION_ERROR"})
    req.status = "Cancelled"
    req.cancelled_at = datetime.utcnow()
    req.cancelled_by = current_user.user_id
    emit_event(db, "esignature.cancelled", current_user.user_id, current_user.full_name,
               engagement_id=req.engagement_id, payload={"request_id": req.request_id})
    db.commit()
    db.refresh(req)
    return {"data": ESignatureOut.model_validate(req), "message": "E-signature request cancelled"}

@router.patch("/{engagement_id}/archive")
def archive_engagement(
    engagement_id: str,
    current_user: User = Depends(require_roles("Partner")),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Not found", "code": "NOT_FOUND"})

    # Check closure checklist
    open_notes = db.query(ReviewNote).filter(
        ReviewNote.engagement_id == engagement_id,
        ReviewNote.status != "Closed"
    ).count()
    if open_notes > 0:
        raise HTTPException(status_code=400, detail={"error": f"{open_notes} open review note(s) must be closed first", "code": "OPEN_NOTES_EXIST"})

    eng.status = "Archived"
    eng.archived_at = datetime.utcnow()
    eng.archived_by = current_user.user_id
    emit_event(db, "engagement.archived", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id)
    db.commit()
    return {"data": EngagementOut.model_validate(eng), "message": "Engagement archived"}

@router.patch("/{engagement_id}/reopen")
def reopen_engagement(
    engagement_id: str,
    current_user: User = Depends(require_roles("Partner")),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Not found", "code": "NOT_FOUND"})
    eng.status = "Active"
    eng.reopened_at = datetime.utcnow()
    eng.reopened_by = current_user.user_id
    emit_event(db, "engagement.reopened", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id)
    db.commit()
    return {"data": EngagementOut.model_validate(eng), "message": f"Engagement reopened by {current_user.full_name}"}

@router.post("/{engagement_id}/rollforward", status_code=201)
def roll_forward(
    engagement_id: str,
    payload: RollForwardRequest,
    current_user: User = Depends(require_roles("Partner", "Admin")),
    db: Session = Depends(get_db)
):
    prior = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not prior:
        raise HTTPException(status_code=404, detail={"error": "Prior engagement not found", "code": "NOT_FOUND"})

    dup = db.query(Engagement).filter(
        Engagement.client_name == prior.client_name,
        Engagement.financial_year == payload.new_financial_year
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail={"error": "Engagement already exists for that FY", "code": "DUPLICATE"})

    new_eng = Engagement(
        client_name=prior.client_name,
        financial_year=payload.new_financial_year,
        engagement_type=normalise_engagement_type(prior.engagement_type),
        is_eqcr_designated=prior.is_eqcr_designated,
        is_small_entity=prior.is_small_entity,
        prior_year_engagement_id=engagement_id,
        created_by=current_user.user_id
    )
    db.add(new_eng)
    db.flush()
    auto_create_sections(db, new_eng.engagement_id)
    db.flush()

    # Copy folder structure (and option to carry forward templates) from prior year
    _copy_folders_and_wps(db, engagement_id, new_eng.engagement_id, payload.copy_prior_wps, current_user.user_id)

    for assignment in db.query(EngagementUser).filter(EngagementUser.engagement_id == engagement_id).all():
        db.add(EngagementUser(
            engagement_id=new_eng.engagement_id,
            user_id=assignment.user_id,
            role=assignment.role or "Preparer",
            assigned_by=current_user.user_id,
        ))

    emit_event(db, "engagement.rollforward", current_user.user_id, current_user.full_name,
               engagement_id=new_eng.engagement_id, payload={"from": engagement_id, "new_fy": payload.new_financial_year})
    db.commit()
    db.refresh(new_eng)
    return {"data": EngagementOut.model_validate(new_eng), "message": "Roll-forward complete."}

@router.patch("/{engagement_id}/toggle-workflow-override")
def toggle_workflow_override(
    engagement_id: str,
    current_user: User = Depends(require_roles("Partner", "Admin")),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if eng.status == "Archived":
        raise HTTPException(status_code=400, detail={"error": "Engagement is archived", "code": "ENGAGEMENT_ARCHIVED"})

    eng.workflow_override = not eng.workflow_override
    db.commit()
    db.refresh(eng)
    status_str = "enabled" if eng.workflow_override else "disabled"
    emit_event(db, "engagement.workflow_override", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id, payload={"override": eng.workflow_override})
    db.commit()
    return {"data": EngagementOut.model_validate(eng), "message": f"Workflow override {status_str}."}

def _copy_folders_and_wps(db: Session, from_engagement_id: str, to_engagement_id: str, copy_wps: bool, creator_id: str):
    """Recursively copy folder structure and planning templates (if copy_wps is True)."""
    # Map old section IDs to new
    old_sections = db.query(Section).filter(Section.engagement_id == from_engagement_id).all()
    new_sections = db.query(Section).filter(Section.engagement_id == to_engagement_id).all()
    section_map = {}
    for os_ in old_sections:
        for ns in new_sections:
            if os_.section_code == ns.section_code:
                section_map[os_.section_id] = ns.section_id

    # Copy top-level folders first then recurse
    old_folders = db.query(Folder).filter(
        Folder.engagement_id == from_engagement_id,
        Folder.parent_folder_id == None,
        Folder.is_deleted == False
    ).all()

    folder_map = {}
    for f in old_folders:
        new_section_id = section_map.get(f.section_id, f.section_id)
        
        existing = db.query(Folder).filter(
            Folder.engagement_id == to_engagement_id,
            Folder.section_id == new_section_id,
            Folder.parent_folder_id == None,
            Folder.folder_name == f.folder_name,
            Folder.is_deleted == False
        ).first()

        if existing:
            nf = existing
        else:
            nf = Folder(
                engagement_id=to_engagement_id,
                section_id=new_section_id,
                parent_folder_id=None,
                folder_name=f.folder_name,
                depth=f.depth,
                wp_number=f.wp_number,
                full_path=f.full_path
            )
            db.add(nf)
            db.flush()
        
        folder_map[f.folder_id] = nf.folder_id

        if copy_wps:
            _copy_wps_for_folder(db, from_engagement_id, to_engagement_id, f.folder_id, nf.folder_id, new_section_id, creator_id)

    # Copy sub-folders
    all_old = db.query(Folder).filter(
        Folder.engagement_id == from_engagement_id,
        Folder.parent_folder_id != None,
        Folder.is_deleted == False
    ).order_by(Folder.depth).all()
    for f in all_old:
        new_parent = folder_map.get(f.parent_folder_id)
        new_section_id = section_map.get(f.section_id, f.section_id)
        
        existing = db.query(Folder).filter(
            Folder.engagement_id == to_engagement_id,
            Folder.section_id == new_section_id,
            Folder.parent_folder_id == new_parent,
            Folder.folder_name == f.folder_name,
            Folder.is_deleted == False
        ).first()

        if existing:
            nf = existing
        else:
            nf = Folder(
                engagement_id=to_engagement_id,
                section_id=new_section_id,
                parent_folder_id=new_parent,
                folder_name=f.folder_name,
                depth=f.depth,
                wp_number=f.wp_number,
                full_path=f.full_path
            )
            db.add(nf)
            db.flush()
            
        folder_map[f.folder_id] = nf.folder_id

        if copy_wps:
            _copy_wps_for_folder(db, from_engagement_id, to_engagement_id, f.folder_id, nf.folder_id, new_section_id, creator_id)

def _copy_wps_for_folder(db: Session, from_eng_id: str, to_eng_id: str, old_folder_id: str, new_folder_id: str, new_section_id: str, creator_id: str):
    import uuid
    import shutil
    from pathlib import Path
    from app.core.config import settings
    
    sec = db.query(Section).filter(Section.section_id == new_section_id).first()
    if not sec or sec.section_code not in ("1000", "2000"):
        return

    wps = db.query(WorkingPaper).filter(
        WorkingPaper.folder_id == old_folder_id,
        WorkingPaper.is_deleted == False
    ).all()
    
    for wp in wps:
        exists = db.query(WorkingPaper).filter(
            WorkingPaper.folder_id == new_folder_id,
            WorkingPaper.filename == wp.filename,
            WorkingPaper.is_deleted == False
        ).first()
        if exists:
            continue
            
        src_path = Path(wp.file_storage_path)
        new_storage_path = wp.file_storage_path
        if src_path.exists():
            dest_dir = Path(settings.FILE_STORAGE_PATH) / to_eng_id / "templates"
            dest_dir.mkdir(parents=True, exist_ok=True)
            safe_name = f"{uuid.uuid4()}_{wp.filename}"
            dest_path = dest_dir / safe_name
            shutil.copy2(src_path, dest_path)
            new_storage_path = str(dest_path)
            
        nwp = WorkingPaper(
            engagement_id=to_eng_id,
            section_id=new_section_id,
            folder_id=new_folder_id,
            wp_number=wp.wp_number,
            filename=wp.filename,
            file_format=wp.file_format,
            file_size_bytes=wp.file_size_bytes,
            file_storage_path=new_storage_path,
            review_status="Draft",
            prepared_by=creator_id,
            prepared_by_name="System",
            prepared_by_initials="SYS",
            prepared_at=datetime.utcnow(),
            current_version=1
        )
        db.add(nwp)
        db.flush()
        
        db.add(FileVersion(
            wp_id=nwp.wp_id,
            version_number=1,
            filename=nwp.filename,
            file_size_bytes=nwp.file_size_bytes,
            file_storage_path=new_storage_path,
            uploaded_by=creator_id,
            uploaded_by_name="System",
            comment="Carried forward from previous year"
        ))
        db.flush()
