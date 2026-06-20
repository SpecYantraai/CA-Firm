from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.models import Engagement, WorkingPaper, ReviewNote, SignOff, Section, EngagementUser, User
from app.schemas.schemas import SearchResult, EngagementOut, WPOut, ClosureChecklist, ClosureChecklistItem
from app.core.config import CLOSURE_CHECKLIST
from app.services.initials import display_initials

router = APIRouter(tags=["search-closure"])

def wp_to_out(wp):
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
        open_notes_count=sum(1 for n in wp.review_notes if n.status != "Closed")
    )

@router.get("/search", response_model=dict)
def search(
    q: Optional[str] = Query(None),
    engagement_id: Optional[str] = Query(None),
    section_code: Optional[str] = Query(None),
    uploader_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    wp_number: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Scope engagements by role
    eng_q = db.query(Engagement)
    if current_user.role in ("Articled Assistant", "Audit Executive"):
        assigned_ids = [eu.engagement_id for eu in
                        db.query(EngagementUser).filter(EngagementUser.user_id == current_user.user_id).all()]
        eng_q = eng_q.filter(Engagement.engagement_id.in_(assigned_ids))
    if q:
        eng_q = eng_q.filter(Engagement.client_name.ilike(f"%{q}%"))

    engagements = eng_q.limit(40).all()

    # WP search
    wp_q = db.query(WorkingPaper).filter(WorkingPaper.is_deleted == False)
    if current_user.role in ("Articled Assistant", "Audit Executive"):
        assigned_ids = [eu.engagement_id for eu in
                        db.query(EngagementUser).filter(EngagementUser.user_id == current_user.user_id).all()]
        wp_q = wp_q.filter(WorkingPaper.engagement_id.in_(assigned_ids))
    if q:
        wp_q = wp_q.filter(
            WorkingPaper.filename.ilike(f"%{q}%") |
            WorkingPaper.wp_number.ilike(f"%{q}%") |
            WorkingPaper.prepared_by_name.ilike(f"%{q}%")
        )
    if wp_number:
        wp_q = wp_q.filter(WorkingPaper.wp_number.ilike(f"%{wp_number}%"))
    if engagement_id:
        wp_q = wp_q.filter(WorkingPaper.engagement_id == engagement_id)
    if uploader_id:
        wp_q = wp_q.filter(WorkingPaper.prepared_by == uploader_id)

    wps = wp_q.limit(200).all()

    return {
        "data": {
            "engagements": [EngagementOut.model_validate(e) for e in engagements],
            "working_papers": [wp_to_out(wp) for wp in wps]
        }
    }


@router.get("/engagements/{engagement_id}/closure-checklist")
def get_closure_checklist(
    engagement_id: str,
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    sections = {s.section_code: s for s in
                db.query(Section).filter(Section.engagement_id == engagement_id).all()}
    all_wps = db.query(WorkingPaper).filter(
        WorkingPaper.engagement_id == engagement_id,
        WorkingPaper.is_deleted == False
    ).all()
    open_notes_count = db.query(ReviewNote).filter(
        ReviewNote.engagement_id == engagement_id,
        ReviewNote.status != "Closed"
    ).count()

    items = []
    can_archive = True

    for cl in CLOSURE_CHECKLIST:
        status = "Pass"
        detail = None
        check = cl["check_type"]
        sec_code = cl["section_code"]

        if check == "no_open_notes":
            if open_notes_count > 0:
                status = "Fail"
                detail = f"{open_notes_count} open review note(s) remain"
        elif check == "document_exists":
            if sec_code and sec_code in sections:
                sec_id = sections[sec_code].section_id
                count = sum(1 for wp in all_wps if wp.section_id == sec_id)
                if count == 0:
                    status = "Fail"
                    detail = f"No documents in section {sec_code}"
        elif check == "wps_exist":
            if sec_code and sec_code in sections:
                sec_id = sections[sec_code].section_id
                count = sum(1 for wp in all_wps if wp.section_id == sec_id)
                if count == 0:
                    status = "Fail"
                    detail = "No working papers in section 4000"
        elif check == "prepared_by_complete":
            if sec_code and sec_code in sections:
                sec_id = sections[sec_code].section_id
                missing = [wp for wp in all_wps if wp.section_id == sec_id and not wp.prepared_by_name]
                if missing:
                    status = "Fail"
                    detail = f"{len(missing)} WP(s) missing Prepared By attribution"
        elif check == "review_complete":
            if sec_code and sec_code in sections:
                sec_id = sections[sec_code].section_id
                incomplete = [wp for wp in all_wps
                              if wp.section_id == sec_id and wp.review_status in ("Draft", "Submitted")]
                if incomplete:
                    status = "Fail"
                    detail = f"{len(incomplete)} WP(s) still in Draft or Submitted status"
        elif check == "partner_signoff":
            section_ids = [s.section_id for s in sections.values()]
            for sec_id in section_ids:
                sec_wps = [wp for wp in all_wps if wp.section_id == sec_id]
                has_partner_so = any(
                    any(so.role == "Partner" for so in wp.sign_offs)
                    for wp in sec_wps
                ) if sec_wps else False
                if sec_wps and not has_partner_so:
                    status = "Fail"
                    sec_code_for_msg = next((c for c, s in sections.items() if s.section_id == sec_id), "?")
                    detail = f"Section {sec_code_for_msg} missing Partner sign-off"
                    break

        if status == "Fail":
            can_archive = False

        items.append(ClosureChecklistItem(
            item_id=cl["item_id"],
            description=cl["description"],
            status=status,
            detail=detail
        ))

    return {
        "data": ClosureChecklist(
            engagement_id=engagement_id,
            can_archive=can_archive,
            items=items,
            open_notes_count=open_notes_count
        )
    }


@router.get("/engagements/{engagement_id}/events")
def get_events(
    engagement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.models import EventLog
    events = db.query(EventLog).filter(
        EventLog.engagement_id == engagement_id
    ).order_by(EventLog.timestamp.desc()).limit(100).all()
    return {"data": [
        {"event_id": e.event_id, "event_type": e.event_type,
         "actor_name": e.actor_name, "timestamp": e.timestamp, "payload": e.payload}
        for e in events
    ]}
