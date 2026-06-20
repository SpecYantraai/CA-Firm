from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.models import Folder, WorkingPaper, Section, User, Engagement
from app.schemas.schemas import FolderCreate, FolderRename, FolderOut, WPOut
from app.services.numbering import assign_wp_number
from app.services.numbering import check_wp_number_conflict
from app.services.initials import display_initials
from app.core.config import SECTION_NAMES

router = APIRouter(tags=["folders"])

MAX_DEPTH = 9
INDEX_OVERRIDE_ROLES = ("Audit Manager", "Partner", "Admin")

def build_folder_tree(folders: list, wps: list, parent_id=None) -> list:
    children = [f for f in folders if f.parent_folder_id == parent_id and not f.is_deleted]
    result = []
    for f in children:
        open_count = sum(1 for wp in wps if wp.folder_id == f.folder_id and not wp.is_deleted
                         for note in wp.review_notes if note.status == "Open")
        fo = FolderOut(
            folder_id=f.folder_id,
            engagement_id=f.engagement_id,
            section_id=f.section_id,
            parent_folder_id=f.parent_folder_id,
            folder_name=f.folder_name,
            depth=f.depth,
            full_path=f.full_path,
            wp_number=f.wp_number,
            created_at=f.created_at,
            children=build_folder_tree(folders, wps, f.folder_id),
            working_papers=[WPOut(
                wp_id=wp.wp_id,
                engagement_id=wp.engagement_id,
                section_id=wp.section_id,
                folder_id=wp.folder_id,
                wp_number=wp.wp_number,
                filename=wp.filename,
                file_format=wp.file_format,
                file_size_bytes=wp.file_size_bytes,
                review_status=wp.review_status,
                prepared_by_name=wp.prepared_by_name,
                prepared_by_initials=display_initials(wp.prepared_by_initials, wp.prepared_by_name),
                prepared_at=wp.prepared_at,
                final_reviewer_name=wp.final_reviewer_name,
                reviewer1_initials=wp.reviewer1_initials,
                reviewer2_initials=wp.reviewer2_initials,
                final_reviewed_at=wp.final_reviewed_at,
                current_version=wp.current_version,
                is_deleted=wp.is_deleted,
                created_at=wp.created_at,
                updated_at=wp.updated_at,
                open_notes_count=sum(1 for n in wp.review_notes if n.status == "Open")
            ) for wp in wps if wp.folder_id == f.folder_id and not wp.is_deleted]
        )
        result.append(fo)
    return result

@router.get("/engagements/{engagement_id}/folders", response_model=dict)
def get_folder_tree(
    engagement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    folders = db.query(Folder).filter(Folder.engagement_id == engagement_id).all()
    wps = db.query(WorkingPaper).filter(
        WorkingPaper.engagement_id == engagement_id,
        WorkingPaper.is_deleted == False
    ).all()
    sections = db.query(Section).filter(Section.engagement_id == engagement_id).order_by(Section.section_code).all()

    tree = {}
    from app.core.deps import is_section_locked
    for sec in sections:
        sec_folders = [f for f in folders if f.section_id == sec.section_id]
        tree[sec.section_code] = {
            "section_id": sec.section_id,
            "section_code": sec.section_code,
            "section_name": sec.section_name,
            "locked": is_section_locked(db, engagement_id, sec.section_code),
            "folders": build_folder_tree(sec_folders, wps, None)
        }
    return {"data": tree}

@router.post("/engagements/{engagement_id}/folders", status_code=201)
def create_folder(
    engagement_id: str,
    payload: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if eng.status == "Archived":
        raise HTTPException(status_code=400, detail={"error": "Engagement is archived", "code": "ENGAGEMENT_ARCHIVED"})

    from app.core.deps import get_user_engagement_role, is_section_locked
    eng_role = get_user_engagement_role(db, engagement_id, current_user)
    if eng_role == "EQCR":
        raise HTTPException(status_code=403, detail={"error": "EQCR Reviewers cannot create folders", "code": "INSUFFICIENT_ROLE"})

    section = db.query(Section).filter(Section.section_id == payload.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail={"error": "Section not found", "code": "NOT_FOUND"})
    if section.engagement_id != engagement_id:
        raise HTTPException(status_code=400, detail={"error": "Section does not belong to this engagement", "code": "ENGAGEMENT_MISMATCH"})

    if is_section_locked(db, engagement_id, section.section_code):
        raise HTTPException(status_code=400, detail={"error": f"Section {section.section_code} is locked due to sequential workflow requirements", "code": "SECTION_LOCKED"})

    depth = 1
    parent_wp_number = None

    if payload.parent_folder_id:
        parent = db.query(Folder).filter(Folder.folder_id == payload.parent_folder_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail={"error": "Parent folder not found", "code": "NOT_FOUND"})
        if parent.engagement_id != engagement_id or parent.section_id != payload.section_id:
            raise HTTPException(status_code=400, detail={"error": "Parent folder does not belong to this engagement section", "code": "ENGAGEMENT_MISMATCH"})
        depth = parent.depth + 1
        parent_wp_number = parent.wp_number

    if depth > MAX_DEPTH:
        raise HTTPException(status_code=400, detail={"error": f"Maximum nesting depth of {MAX_DEPTH} exceeded", "code": "VALIDATION_ERROR"})

    if payload.wp_number:
        if current_user.role not in INDEX_OVERRIDE_ROLES:
            raise HTTPException(status_code=403, detail={"error": "Only Manager, Partner or Admin can override folder indexes", "code": "INSUFFICIENT_ROLE"})
        wp_number = payload.wp_number.strip()
        if check_wp_number_conflict(db, engagement_id, wp_number):
            raise HTTPException(status_code=409, detail={"error": f"Index {wp_number} already exists", "code": "DUPLICATE"})
    else:
        wp_number = assign_wp_number(
            db=db,
            engagement_id=engagement_id,
            section_id=payload.section_id,
            section_code=section.section_code,
            parent_folder_id=payload.parent_folder_id,
            parent_wp_number=parent_wp_number,
            depth=depth,
        )

    # Build full path
    path_parts = [section.section_name]
    if payload.parent_folder_id:
        parent = db.query(Folder).filter(Folder.folder_id == payload.parent_folder_id).first()
        if parent and parent.full_path:
            path_parts = parent.full_path.split(" / ") + [payload.folder_name]
        else:
            path_parts.append(payload.folder_name)
    else:
        path_parts.append(payload.folder_name)

    folder = Folder(
        engagement_id=engagement_id,
        section_id=payload.section_id,
        parent_folder_id=payload.parent_folder_id,
        folder_name=payload.folder_name,
        depth=depth,
        wp_number=wp_number,
        full_path=" / ".join(path_parts),
        created_by=current_user.user_id
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"data": FolderOut.model_validate(folder), "message": "Folder created"}

@router.patch("/folders/{folder_id}")
def rename_folder(
    folder_id: str,
    payload: FolderRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    folder = db.query(Folder).filter(Folder.folder_id == folder_id, Folder.is_deleted == False).first()
    if not folder:
        raise HTTPException(status_code=404, detail={"error": "Folder not found", "code": "NOT_FOUND"})

    eng = db.query(Engagement).filter(Engagement.engagement_id == folder.engagement_id).first()
    if not eng or eng.status == "Archived":
        raise HTTPException(status_code=400, detail={"error": "Engagement is archived", "code": "ENGAGEMENT_ARCHIVED"})

    from app.core.deps import get_user_engagement_role, is_section_locked
    eng_role = get_user_engagement_role(db, folder.engagement_id, current_user)
    if eng_role == "EQCR":
        raise HTTPException(status_code=403, detail={"error": "EQCR Reviewers cannot rename folders", "code": "INSUFFICIENT_ROLE"})

    sec = db.query(Section).filter(Section.section_id == folder.section_id).first()
    if sec and is_section_locked(db, folder.engagement_id, sec.section_code):
        raise HTTPException(status_code=400, detail={"error": "Section is locked", "code": "SECTION_LOCKED"})

    if payload.folder_name:
        folder.folder_name = payload.folder_name
    if payload.wp_number and payload.wp_number != folder.wp_number:
        if current_user.role not in INDEX_OVERRIDE_ROLES:
            raise HTTPException(status_code=403, detail={"error": "Only Manager, Partner or Admin can override folder indexes", "code": "INSUFFICIENT_ROLE"})
        if check_wp_number_conflict(db, folder.engagement_id, payload.wp_number):
            raise HTTPException(status_code=409, detail={"error": f"Index {payload.wp_number} already exists", "code": "DUPLICATE"})
        folder.wp_number = payload.wp_number.strip()
    db.commit()
    return {"data": None, "message": "Folder renamed"}

@router.delete("/folders/{folder_id}")
def delete_folder(
    folder_id: str,
    current_user: User = Depends(require_roles("Audit Executive", "Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    folder = db.query(Folder).filter(Folder.folder_id == folder_id, Folder.is_deleted == False).first()
    if not folder:
        raise HTTPException(status_code=404, detail={"error": "Folder not found", "code": "NOT_FOUND"})

    eng = db.query(Engagement).filter(Engagement.engagement_id == folder.engagement_id).first()
    if not eng or eng.status == "Archived":
        raise HTTPException(status_code=400, detail={"error": "Engagement is archived", "code": "ENGAGEMENT_ARCHIVED"})

    from app.core.deps import get_user_engagement_role, is_section_locked
    eng_role = get_user_engagement_role(db, folder.engagement_id, current_user)
    if eng_role == "EQCR":
        raise HTTPException(status_code=403, detail={"error": "EQCR Reviewers cannot delete folders", "code": "INSUFFICIENT_ROLE"})

    sec = db.query(Section).filter(Section.section_id == folder.section_id).first()
    if sec and is_section_locked(db, folder.engagement_id, sec.section_code):
        raise HTTPException(status_code=400, detail={"error": "Section is locked", "code": "SECTION_LOCKED"})

    wp_count = db.query(WorkingPaper).filter(
        WorkingPaper.folder_id == folder_id,
        WorkingPaper.is_deleted == False
    ).count()
    if wp_count > 0:
        raise HTTPException(status_code=400, detail={"error": f"Cannot delete folder — {wp_count} working paper(s) inside. Empty it first.", "code": "VALIDATION_ERROR"})
    folder.is_deleted = True
    db.commit()
    return {"data": None, "message": "Folder deleted"}
