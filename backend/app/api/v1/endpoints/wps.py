from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import os, shutil, uuid, pathlib
import urllib.request

from app.core.database import get_db
from app.core.deps import (
    get_current_user, require_roles, get_user_engagement_role,
    ensure_engagement_editable, ensure_section_editable, can_prepare, can_review
)
from app.core.security import create_access_token, decode_token
from app.core.config import settings, ALLOWED_EXTENSIONS
from app.models.models import (
    WorkingPaper, FileVersion, ReviewNote, SignOff, Folder, Section,
    Engagement, User, WorkingPaperLink
)
from app.schemas.schemas import (
    WPOut, WPUpdate, FileVersionOut, NoteCreate, NoteResponseCreate,
    NoteOut, SignOffCreate, SignOffOut, WPLinkCreate, WPLinkOut
)
from app.services.numbering import assign_wp_number, check_wp_number_conflict
from app.services.events import emit_event
from app.services.initials import display_initials

router = APIRouter(tags=["working-papers"])
INDEX_OVERRIDE_ROLES = ("Audit Manager", "Partner", "Admin")
REVIEW_SIGNOFF_ROLES = ("Audit Manager", "Partner", "EQCR Reviewer", "Admin")
EDITOR_EXTENSIONS = {"doc", "docx", "xls", "xlsx", "pdf"}
INLINE_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}


def get_wp_or_404(wp_id: str, db: Session) -> WorkingPaper:
    wp = db.query(WorkingPaper).filter(WorkingPaper.wp_id == wp_id, WorkingPaper.is_deleted == False).first()
    if not wp:
        raise HTTPException(status_code=404, detail={"error": "Working paper not found", "code": "NOT_FOUND"})
    return wp


def get_wp_section(db: Session, wp: WorkingPaper) -> Section:
    section = db.query(Section).filter(Section.section_id == wp.section_id).first()
    if not section:
        raise HTTPException(status_code=400, detail={"error": "Working paper section not found", "code": "SECTION_NOT_FOUND"})
    return section


def wp_to_out(wp: WorkingPaper) -> WPOut:
    open_notes = sum(1 for n in wp.review_notes if n.status != "Closed")
    return WPOut(
        wp_id=wp.wp_id, engagement_id=wp.engagement_id,
        section_id=wp.section_id, folder_id=wp.folder_id,
        wp_number=wp.wp_number, filename=wp.filename,
        file_format=wp.file_format, file_size_bytes=wp.file_size_bytes,
        review_status=wp.review_status,
        prepared_by_name=wp.prepared_by_name,
        prepared_by_initials=display_initials(wp.prepared_by_initials, wp.prepared_by_name),
        prepared_at=wp.prepared_at,
        final_reviewer_name=wp.final_reviewer_name,
        reviewer1_initials=wp.reviewer1_initials,
        reviewer2_initials=wp.reviewer2_initials,
        final_reviewed_at=wp.final_reviewed_at,
        current_version=wp.current_version, is_deleted=wp.is_deleted,
        created_at=wp.created_at, updated_at=wp.updated_at,
        open_notes_count=open_notes
    )


def store_file(file: UploadFile, engagement_id: str, folder_path: str) -> tuple[str, int]:
    """Store file on-premise. Returns (storage_path, size_bytes)."""
    base = pathlib.Path(settings.FILE_STORAGE_PATH) / engagement_id
    base.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{file.filename}"
    dest = base / safe_name
    content = file.file.read()
    with open(dest, "wb") as f:
        f.write(content)
    return str(dest), len(content)


def document_type_for_ext(ext: str) -> str:
    if ext in {"doc", "docx"}:
        return "word"
    if ext in {"xls", "xlsx"}:
        return "cell"
    return "pdf"


def make_editor_token(wp: WorkingPaper, user: User) -> str:
    return create_access_token(
        {"sub": user.user_id, "wp_id": wp.wp_id, "scope": "wp_editor"},
        expires_delta=timedelta(hours=2),
    )


def get_wp_from_editor_token(token: str, db: Session) -> tuple[WorkingPaper, User | None]:
    payload = decode_token(token)
    if not payload or payload.get("scope") != "wp_editor" or not payload.get("wp_id"):
        raise HTTPException(status_code=401, detail={"error": "Invalid editor token", "code": "AUTH_REQUIRED"})
    wp = get_wp_or_404(payload["wp_id"], db)
    user = db.query(User).filter(User.user_id == payload.get("sub")).first() if payload.get("sub") else None
    return wp, user


@router.get("/engagements/{engagement_id}/wps", response_model=dict)
def list_wps(
    engagement_id: str,
    section_id: Optional[str] = Query(None),
    folder_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(WorkingPaper).filter(
        WorkingPaper.engagement_id == engagement_id,
        WorkingPaper.is_deleted == False
    )
    if section_id:
        q = q.filter(WorkingPaper.section_id == section_id)
    if folder_id:
        q = q.filter(WorkingPaper.folder_id == folder_id)
    if status:
        q = q.filter(WorkingPaper.review_status == status)
    return {"data": [wp_to_out(wp) for wp in q.all()]}


@router.post("/engagements/{engagement_id}/wps", status_code=201)
async def upload_wp(
    engagement_id: str,
    file: UploadFile = File(...),
    folder_id: str = Form(...),
    wp_number: Optional[str] = Form(None),
    prepared_by_initials: Optional[str] = Form(None),
    reviewer1_initials: Optional[str] = Form(None),
    reviewer2_initials: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    engagement_role = get_user_engagement_role(db, engagement_id, current_user)
    if not can_prepare(engagement_role):
        raise HTTPException(status_code=403, detail={"error": "EQCR Reviewers cannot upload WPs", "code": "INSUFFICIENT_ROLE"})

    ensure_engagement_editable(db, engagement_id)

    # Extension check
    ext = pathlib.Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail={"error": f"Unsupported format: {ext}", "code": "UNSUPPORTED_FORMAT"})

    # Size check (peek)
    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(status_code=400, detail={"error": "File exceeds 100 MB limit", "code": "FILE_TOO_LARGE"})
    await file.seek(0)

    folder = db.query(Folder).filter(Folder.folder_id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail={"error": "Folder not found", "code": "NOT_FOUND"})
    if folder.engagement_id != engagement_id:
        raise HTTPException(status_code=400, detail={"error": "Folder does not belong to this engagement", "code": "ENGAGEMENT_MISMATCH"})

    section = db.query(Section).filter(Section.section_id == folder.section_id).first()
    if not section or section.engagement_id != engagement_id:
        raise HTTPException(status_code=400, detail={"error": "Folder section does not belong to this engagement", "code": "ENGAGEMENT_MISMATCH"})
    ensure_section_editable(db, engagement_id, section.section_code)

    # Assign WP number
    if wp_number:
        if current_user.role not in INDEX_OVERRIDE_ROLES:
            raise HTTPException(status_code=403, detail={"error": "Only Manager, Partner or Admin can override WP indexes", "code": "INSUFFICIENT_ROLE"})
        if check_wp_number_conflict(db, engagement_id, wp_number):
            raise HTTPException(status_code=409, detail={"error": f"WP number {wp_number} already exists", "code": "DUPLICATE"})
        assigned_num = wp_number.strip()
    else:
        assigned_num = assign_wp_number(
            db=db,
            engagement_id=engagement_id,
            section_id=folder.section_id,
            section_code=section.section_code,
            parent_folder_id=folder.folder_id,
            parent_wp_number=folder.wp_number,
            depth=folder.depth + 1,
        )

    # Store file
    storage_path, size = store_file(file, engagement_id, folder.full_path or "")

    wp = WorkingPaper(
        engagement_id=engagement_id,
        section_id=folder.section_id,
        folder_id=folder_id,
        wp_number=assigned_num,
        filename=file.filename,
        file_format=ext.lstrip("."),
        file_size_bytes=size,
        file_storage_path=storage_path,
        review_status="Draft",
        prepared_by=current_user.user_id,
        prepared_by_name=current_user.full_name,
        prepared_by_initials=display_initials(prepared_by_initials, current_user.initials or current_user.full_name),
        reviewer1_initials=(reviewer1_initials or "").strip() or None,
        reviewer2_initials=(reviewer2_initials or "").strip() or None,
        prepared_at=datetime.utcnow(),
        current_version=1,
    )
    db.add(wp)
    db.flush()

    # Version record
    ver = FileVersion(
        wp_id=wp.wp_id,
        version_number=1,
        filename=file.filename,
        file_size_bytes=size,
        file_storage_path=storage_path,
        uploaded_by=current_user.user_id,
        uploaded_by_name=current_user.full_name,
    )
    db.add(ver)
    emit_event(db, "wp.uploaded", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id, payload={"wp_id": wp.wp_id, "wp_number": assigned_num, "filename": file.filename})
    db.commit()
    db.refresh(wp)
    return {"data": wp_to_out(wp), "message": f"Uploaded as WP {assigned_num}"}


@router.get("/wps/{wp_id}/download")
def download_wp(
    wp_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    if not os.path.exists(wp.file_storage_path):
        raise HTTPException(status_code=404, detail={"error": "File not found on server", "code": "NOT_FOUND"})
    return FileResponse(wp.file_storage_path, filename=wp.filename)


@router.get("/wps/{wp_id}/preview")
def preview_wp(
    wp_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    if not os.path.exists(wp.file_storage_path):
        raise HTTPException(status_code=404, detail={"error": "File not found on server", "code": "NOT_FOUND"})
    ext = (wp.file_format or pathlib.Path(wp.filename).suffix.lstrip(".")).lower()
    media_type = INLINE_MEDIA_TYPES.get(ext)
    if not media_type:
        raise HTTPException(status_code=415, detail={"error": "Inline preview is available for PDF and images. Use document editor for Office files.", "code": "PREVIEW_UNSUPPORTED"})
    return FileResponse(wp.file_storage_path, media_type=media_type)


@router.get("/wps/{wp_id}/editor-config")
def get_editor_config(
    wp_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    eng = db.query(Engagement).filter(Engagement.engagement_id == wp.engagement_id).first()
    if eng and eng.status == "Archived":
        return {
            "enabled": False,
            "message": "This engagement is archived. Documents can be previewed or downloaded, but cannot be edited."
        }
    if not can_prepare(get_user_engagement_role(db, wp.engagement_id, current_user)):
        return {
            "enabled": False,
            "message": "Your engagement role has read-only access to working paper files."
        }
    section = get_wp_section(db, wp)
    if section and section.section_code and section.section_code not in ("1000", "3000", "MISC"):
        try:
            ensure_section_editable(db, wp.engagement_id, section.section_code)
        except HTTPException:
            return {
                "enabled": False,
                "message": "This section is locked by the sequential workflow."
            }
    ext = (wp.file_format or pathlib.Path(wp.filename).suffix.lstrip(".")).lower()
    if ext not in EDITOR_EXTENSIONS:
        raise HTTPException(status_code=415, detail={"error": "This file type cannot be edited in the document editor", "code": "EDITOR_UNSUPPORTED"})
    if not settings.DOCUMENT_EDITOR_URL:
        return {
            "enabled": False,
            "message": "Set DOCUMENT_EDITOR_URL to your on-prem ONLYOFFICE Document Server URL to edit this file in the browser."
        }

    token = make_editor_token(wp, current_user)
    public_base = settings.PUBLIC_BACKEND_URL.rstrip("/")
    api_base = f"{public_base}/api/v1"
    edited_at = int((wp.updated_at or wp.created_at or datetime.utcnow()).timestamp())
    config = {
        "document": {
            "fileType": ext,
            "key": f"{wp.wp_id}-{wp.current_version}-{edited_at}",
            "title": wp.filename,
            "url": f"{api_base}/wps/{wp.wp_id}/editor/download?token={token}",
            "permissions": {
                "edit": True,
                "download": True,
                "print": True,
            },
        },
        "documentType": document_type_for_ext(ext),
        "editorConfig": {
            "mode": "edit",
            "callbackUrl": f"{api_base}/wps/{wp.wp_id}/editor/callback?token={token}",
            "user": {
                "id": current_user.user_id,
                "name": current_user.full_name,
            },
            "customization": {
                "autosave": True,
                "forcesave": True,
            },
        },
    }
    return {
        "enabled": True,
        "editorUrl": settings.DOCUMENT_EDITOR_URL.rstrip("/"),
        "config": config,
    }


@router.get("/wps/{wp_id}/editor/download")
def editor_download(
    wp_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    wp, _user = get_wp_from_editor_token(token, db)
    if wp.wp_id != wp_id:
        raise HTTPException(status_code=401, detail={"error": "Token does not match working paper", "code": "AUTH_REQUIRED"})
    if not os.path.exists(wp.file_storage_path):
        raise HTTPException(status_code=404, detail={"error": "File not found on server", "code": "NOT_FOUND"})
    return FileResponse(wp.file_storage_path, filename=wp.filename)


@router.post("/wps/{wp_id}/editor/callback")
async def editor_callback(
    wp_id: str,
    request: Request,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    wp, user = get_wp_from_editor_token(token, db)
    if wp.wp_id != wp_id:
        return JSONResponse({"error": 1})
    eng = db.query(Engagement).filter(Engagement.engagement_id == wp.engagement_id).first()
    if eng and eng.status == "Archived":
        return JSONResponse({"error": 1})
    if user and not can_prepare(get_user_engagement_role(db, wp.engagement_id, user)):
        return JSONResponse({"error": 1})

    body = await request.json()
    status = body.get("status")
    if status not in (2, 6):
        return {"error": 0}

    file_url = body.get("url")
    if not file_url:
        return JSONResponse({"error": 1})

    try:
        with urllib.request.urlopen(file_url, timeout=60) as response:
            content = response.read()
    except Exception:
        return JSONResponse({"error": 1})

    base = pathlib.Path(settings.FILE_STORAGE_PATH) / wp.engagement_id
    base.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{wp.filename}"
    dest = base / safe_name
    with open(dest, "wb") as f:
        f.write(content)

    wp.current_version += 1
    wp.file_size_bytes = len(content)
    wp.file_storage_path = str(dest)
    wp.updated_at = datetime.utcnow()
    wp.review_status = "Draft"

    db.add(FileVersion(
        wp_id=wp.wp_id,
        version_number=wp.current_version,
        filename=wp.filename,
        file_size_bytes=len(content),
        file_storage_path=str(dest),
        uploaded_by=user.user_id if user else None,
        uploaded_by_name=user.full_name if user else "Document editor",
        comment="Saved from in-app document editor",
    ))
    emit_event(db, "wp.edited", user.user_id if user else None, user.full_name if user else "Document editor",
               engagement_id=wp.engagement_id, payload={"wp_id": wp.wp_id, "version": wp.current_version})
    db.commit()
    return {"error": 0}


@router.post("/wps/{wp_id}/replace")
async def replace_wp(
    wp_id: str,
    file: UploadFile = File(...),
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    if not can_prepare(get_user_engagement_role(db, wp.engagement_id, current_user)):
        raise HTTPException(status_code=403, detail={"error": "EQCR Reviewers cannot replace WPs", "code": "INSUFFICIENT_ROLE"})

    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(status_code=400, detail={"error": "File exceeds 100 MB limit", "code": "FILE_TOO_LARGE"})
    await file.seek(0)

    storage_path, size = store_file(file, wp.engagement_id, "")
    new_version = wp.current_version + 1
    wp.current_version = new_version
    wp.filename = file.filename
    wp.file_size_bytes = size
    wp.file_storage_path = storage_path
    wp.review_status = "Draft"

    ver = FileVersion(
        wp_id=wp_id,
        version_number=new_version,
        filename=file.filename,
        file_size_bytes=size,
        file_storage_path=storage_path,
        uploaded_by=current_user.user_id,
        uploaded_by_name=current_user.full_name,
        comment=comment
    )
    db.add(ver)
    emit_event(db, "wp.replaced", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"wp_id": wp_id, "version": new_version})
    db.commit()
    return {"data": wp_to_out(wp), "message": f"Version {new_version} uploaded"}


@router.get("/wps/{wp_id}/versions")
def get_versions(
    wp_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    versions = db.query(FileVersion).filter(FileVersion.wp_id == wp_id).order_by(FileVersion.version_number.desc()).all()
    return {"data": [FileVersionOut.model_validate(v) for v in versions]}


@router.get("/wps/{wp_id}/versions/{version_number}/download")
def download_version(
    wp_id: str, version_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ver = db.query(FileVersion).filter(FileVersion.wp_id == wp_id, FileVersion.version_number == version_number).first()
    if not ver:
        raise HTTPException(status_code=404, detail={"error": "Version not found", "code": "NOT_FOUND"})
    return FileResponse(ver.file_storage_path, filename=ver.filename)


@router.patch("/wps/{wp_id}")
def update_wp(
    wp_id: str,
    payload: WPUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    if payload.wp_number and payload.wp_number != wp.wp_number:
        if current_user.role not in INDEX_OVERRIDE_ROLES:
            raise HTTPException(status_code=403, detail={"error": "Only Manager, Partner or Admin can override WP indexes", "code": "INSUFFICIENT_ROLE"})
        if check_wp_number_conflict(db, wp.engagement_id, payload.wp_number, wp.wp_id):
            raise HTTPException(status_code=409, detail={"error": f"WP number {payload.wp_number} already exists", "code": "DUPLICATE"})
        wp.wp_number = payload.wp_number.strip()
    if payload.filename:
        wp.filename = payload.filename
    if payload.prepared_by_initials is not None:
        wp.prepared_by_initials = payload.prepared_by_initials.strip() or None
    if payload.reviewer1_initials is not None:
        if current_user.role not in REVIEW_SIGNOFF_ROLES:
            raise HTTPException(status_code=403, detail={"error": "Only reviewers can edit reviewer signoffs", "code": "INSUFFICIENT_ROLE"})
        wp.reviewer1_initials = payload.reviewer1_initials.strip() or None
    if payload.reviewer2_initials is not None:
        if current_user.role not in REVIEW_SIGNOFF_ROLES:
            raise HTTPException(status_code=403, detail={"error": "Only reviewers can edit reviewer signoffs", "code": "INSUFFICIENT_ROLE"})
        wp.reviewer2_initials = payload.reviewer2_initials.strip() or None
    if payload.prepared_at:
        wp.prepared_at = payload.prepared_at
    if payload.final_reviewed_at:
        if current_user.role not in ("Audit Manager", "Partner", "Admin"):
            raise HTTPException(status_code=403, detail={"error": "Only Manager+ can edit Final Reviewer date", "code": "INSUFFICIENT_ROLE"})
        wp.final_reviewed_at = payload.final_reviewed_at
    db.commit()
    return {"data": wp_to_out(wp), "message": "Working paper updated"}


@router.delete("/wps/{wp_id}")
def soft_delete_wp(
    wp_id: str,
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    wp.is_deleted = True
    emit_event(db, "wp.deleted", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"wp_id": wp_id})
    db.commit()
    return {"data": None, "message": "Working paper soft-deleted. File retained for retention compliance."}


# ─── Review Workflow ──────────────────────────────────────────────────────────

@router.post("/wps/{wp_id}/submit")
def submit_for_review(
    wp_id: str,
    current_user: User = Depends(require_roles("Articled Assistant", "Audit Executive")),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    if wp.prepared_by and wp.prepared_by != current_user.user_id:
        raise HTTPException(status_code=403, detail={"error": "Only the WP preparer can submit it for review", "code": "INSUFFICIENT_ROLE"})
    wp.review_status = "Submitted"
    emit_event(db, "review.submitted", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"wp_id": wp_id})
    db.commit()
    return {"data": wp_to_out(wp), "message": "Submitted for review"}


@router.post("/wps/{wp_id}/finalise")
def finalise_wp(
    wp_id: str,
    current_user: User = Depends(require_roles("Partner", "Audit Manager")),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    if not can_review(get_user_engagement_role(db, wp.engagement_id, current_user)):
        raise HTTPException(status_code=403, detail={"error": "Only engagement reviewers can finalise WPs", "code": "INSUFFICIENT_ROLE"})
    open_notes = db.query(ReviewNote).filter(ReviewNote.wp_id == wp_id, ReviewNote.status != "Closed").count()
    if open_notes > 0:
        raise HTTPException(status_code=400, detail={"error": f"{open_notes} open note(s) must be closed first", "code": "OPEN_NOTES_EXIST"})
    wp.review_status = "Finalised"
    wp.final_reviewer_id = current_user.user_id
    wp.final_reviewer_name = current_user.full_name
    reviewer_initials = display_initials(current_user.initials, current_user.full_name)
    if not wp.reviewer1_initials:
        wp.reviewer1_initials = reviewer_initials
    elif not wp.reviewer2_initials and wp.reviewer1_initials != reviewer_initials:
        wp.reviewer2_initials = reviewer_initials
    if not wp.final_reviewed_at:
        wp.final_reviewed_at = datetime.utcnow()
    emit_event(db, "review.finalised", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"wp_id": wp_id})
    db.commit()
    return {"data": wp_to_out(wp), "message": f"Finalised by {current_user.full_name}"}


@router.get("/wps/{wp_id}/notes")
def get_notes(
    wp_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notes = db.query(ReviewNote).filter(ReviewNote.wp_id == wp_id).order_by(ReviewNote.raised_at.desc()).all()
    return {"data": [NoteOut.model_validate(n) for n in notes]}


@router.post("/wps/{wp_id}/notes", status_code=201)
def raise_note(
    wp_id: str,
    payload: NoteCreate,
    current_user: User = Depends(require_roles("Audit Executive", "Audit Manager", "Partner", "EQCR Reviewer")),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    if not can_review(get_user_engagement_role(db, wp.engagement_id, current_user)):
        raise HTTPException(status_code=403, detail={"error": "Only engagement reviewers can raise review notes", "code": "INSUFFICIENT_ROLE"})
    note = ReviewNote(
        wp_id=wp_id,
        engagement_id=wp.engagement_id,
        note_text=payload.note_text,
        status="Open",
        raised_by=current_user.user_id,
        raised_by_name=current_user.full_name,
        raised_by_role=current_user.role,
    )
    db.add(note)
    wp.review_status = "Review Notes Raised"
    emit_event(db, "note.raised", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"wp_id": wp_id, "note_id": note.note_id})
    db.commit()
    db.refresh(note)
    return {"data": NoteOut.model_validate(note), "message": "Review note raised"}


@router.patch("/notes/{note_id}/close")
def close_note(
    note_id: str,
    current_user: User = Depends(require_roles("Audit Executive", "Audit Manager", "Partner", "EQCR Reviewer")),
    db: Session = Depends(get_db)
):
    note = db.query(ReviewNote).filter(ReviewNote.note_id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail={"error": "Note not found", "code": "NOT_FOUND"})
    ensure_engagement_editable(db, note.engagement_id)
    if not can_review(get_user_engagement_role(db, note.engagement_id, current_user)):
        raise HTTPException(status_code=403, detail={"error": "Only engagement reviewers can close review notes", "code": "INSUFFICIENT_ROLE"})
    note.status = "Closed"
    note.closed_by = current_user.user_id
    note.closed_by_name = current_user.full_name
    note.closed_at = datetime.utcnow()
    emit_event(db, "note.closed", current_user.user_id, current_user.full_name,
               payload={"note_id": note_id})
    db.commit()
    return {"data": NoteOut.model_validate(note), "message": "Note closed"}


@router.patch("/notes/{note_id}/respond")
def respond_to_note(
    note_id: str,
    payload: NoteResponseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(ReviewNote).filter(ReviewNote.note_id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail={"error": "Note not found", "code": "NOT_FOUND"})
    wp = get_wp_or_404(note.wp_id, db)
    ensure_engagement_editable(db, note.engagement_id)
    ensure_section_editable(db, note.engagement_id, get_wp_section(db, wp).section_code)
    if wp.prepared_by and wp.prepared_by != current_user.user_id and current_user.role not in ("Audit Manager", "Partner", "Admin"):
        raise HTTPException(status_code=403, detail={"error": "Only the WP preparer can respond to this note", "code": "INSUFFICIENT_ROLE"})
    note.response_text = payload.response_text.strip()
    note.responded_by = current_user.user_id
    note.responded_by_name = current_user.full_name
    note.responded_at = datetime.utcnow()
    note.status = "Responded"
    wp.review_status = "Under Review"
    emit_event(db, "note.responded", current_user.user_id, current_user.full_name,
               engagement_id=note.engagement_id, payload={"wp_id": wp.wp_id, "note_id": note_id})
    db.commit()
    return {"data": NoteOut.model_validate(note), "message": "Response submitted for re-review"}


@router.get("/wps/{wp_id}/links")
def list_wp_links(
    wp_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    rows = db.query(WorkingPaperLink, WorkingPaper).join(
        WorkingPaper, WorkingPaperLink.target_wp_id == WorkingPaper.wp_id
    ).filter(
        WorkingPaperLink.source_wp_id == wp.wp_id,
        WorkingPaper.is_deleted == False,
    ).order_by(WorkingPaper.wp_number).all()
    return {
        "data": [
            WPLinkOut(
                link_id=link.link_id,
                source_wp_id=link.source_wp_id,
                target_wp_id=target.wp_id,
                target_wp_number=target.wp_number,
                target_filename=target.filename,
                created_at=link.created_at,
            )
            for link, target in rows
        ]
    }


@router.post("/wps/{wp_id}/links", status_code=201)
def create_wp_link(
    wp_id: str,
    payload: WPLinkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    target = db.query(WorkingPaper).filter(
        WorkingPaper.engagement_id == wp.engagement_id,
        WorkingPaper.wp_number == payload.target_wp_number.strip(),
        WorkingPaper.is_deleted == False,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail={"error": "Target WP index not found in this engagement", "code": "NOT_FOUND"})
    if target.wp_id == wp.wp_id:
        raise HTTPException(status_code=400, detail={"error": "A WP cannot link to itself", "code": "SELF_LINK"})
    existing = db.query(WorkingPaperLink).filter(
        WorkingPaperLink.source_wp_id == wp.wp_id,
        WorkingPaperLink.target_wp_id == target.wp_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail={"error": "This WP link already exists", "code": "DUPLICATE"})
    link = WorkingPaperLink(source_wp_id=wp.wp_id, target_wp_id=target.wp_id)
    db.add(link)
    db.flush()
    emit_event(db, "wp.linked", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"source_wp_id": wp.wp_id, "target_wp_id": target.wp_id})
    db.commit()
    db.refresh(link)
    return {
        "data": WPLinkOut(
            link_id=link.link_id,
            source_wp_id=link.source_wp_id,
            target_wp_id=target.wp_id,
            target_wp_number=target.wp_number,
            target_filename=target.filename,
            created_at=link.created_at,
        ),
        "message": "Working paper link created",
    }


@router.delete("/wps/{wp_id}/links/{link_id}")
def delete_wp_link(
    wp_id: str,
    link_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    link = db.query(WorkingPaperLink).filter(
        WorkingPaperLink.link_id == link_id,
        WorkingPaperLink.source_wp_id == wp.wp_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail={"error": "WP link not found", "code": "NOT_FOUND"})
    db.delete(link)
    emit_event(db, "wp.link_removed", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"source_wp_id": wp.wp_id, "link_id": link_id})
    db.commit()
    return {"data": None, "message": "Working paper link removed"}


@router.post("/wps/{wp_id}/signoff", status_code=201)
def sign_off(
    wp_id: str,
    payload: SignOffCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wp = get_wp_or_404(wp_id, db)
    ensure_engagement_editable(db, wp.engagement_id)
    ensure_section_editable(db, wp.engagement_id, get_wp_section(db, wp).section_code)
    engagement_role = get_user_engagement_role(db, wp.engagement_id, current_user)
    if payload.signoff_type in ("Final Reviewer", "Reviewer 1", "Reviewer 2") and not can_review(engagement_role):
        raise HTTPException(status_code=403, detail={"error": "Only reviewers can sign off as reviewers", "code": "INSUFFICIENT_ROLE"})
    if payload.signoff_type == "Prepared By" and not can_prepare(engagement_role):
        raise HTTPException(status_code=403, detail={"error": "Only preparers can sign off as preparer", "code": "INSUFFICIENT_ROLE"})

    signoff_initials = display_initials(payload.initials, current_user.initials or current_user.full_name)

    so = SignOff(
        wp_id=wp_id,
        signoff_type=payload.signoff_type,
        user_id=current_user.user_id,
        user_name=current_user.full_name,
        initials=signoff_initials,
        role=current_user.role,
        signed_at=payload.signed_at or datetime.utcnow(),
    )
    db.add(so)
    if payload.signoff_type == "Prepared By":
        wp.prepared_by_initials = signoff_initials
    if payload.signoff_type == "Reviewer 1":
        wp.reviewer1_initials = signoff_initials
    if payload.signoff_type in ("Final Reviewer", "Reviewer 2"):
        wp.final_reviewer_id = current_user.user_id
        wp.final_reviewer_name = current_user.full_name
        if payload.signoff_type == "Final Reviewer" and not wp.reviewer1_initials:
            wp.reviewer1_initials = signoff_initials
        else:
            wp.reviewer2_initials = signoff_initials
        if not wp.final_reviewed_at:
            wp.final_reviewed_at = payload.signed_at or datetime.utcnow()

    emit_event(db, "signoff.recorded", current_user.user_id, current_user.full_name,
               engagement_id=wp.engagement_id, payload={"wp_id": wp_id, "type": payload.signoff_type})
    db.commit()
    return {"data": SignOffOut.model_validate(so), "message": "Sign-off recorded"}
