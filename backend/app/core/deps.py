from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import User

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail={"error": "Invalid or expired token", "code": "AUTH_REQUIRED"})
    user_id = payload.get("sub")
    user = db.query(User).filter(User.user_id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail={"error": "User not found or inactive", "code": "AUTH_REQUIRED"})
    return user

def require_roles(*roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail={"error": f"Role {current_user.role} cannot perform this action", "code": "INSUFFICIENT_ROLE"}
            )
        return current_user
    return checker

def can_access_engagement(engagement, user: User, db: Session) -> bool:
    """Check if a user can access an engagement."""
    if user.role in ("Partner", "Audit Manager", "EQCR Reviewer", "Admin"):
        return True
    from app.models.models import EngagementUser
    assignment = db.query(EngagementUser).filter(
        EngagementUser.engagement_id == engagement.engagement_id,
        EngagementUser.user_id == user.user_id
    ).first()
    return assignment is not None

def is_section_locked(db: Session, engagement_id: str, section_code: str) -> bool:
    from app.models.models import Engagement, Folder, WorkingPaper, Section
    from app.core.config import get_folders_for_engagement
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        return True
    if eng.status == "Archived":
        return True
    if eng.workflow_override:
        return False
    if section_code in ("1000", "3000", "MISC"):
        return False
        
    if section_code == "2000":
        config_folders = get_folders_for_engagement(eng.engagement_type, eng.is_small_entity)
        precond_indices = [idx for idx, _ in config_folders.get("1000", [])]
        if not precond_indices:
            return False
        for idx in precond_indices:
            folder = db.query(Folder).filter(
                Folder.engagement_id == engagement_id,
                Folder.wp_number == idx,
                Folder.is_deleted == False
            ).first()
            if not folder:
                return True
            has_wp = db.query(WorkingPaper).filter(
                WorkingPaper.folder_id == folder.folder_id,
                WorkingPaper.is_deleted == False
            ).first()
            if not has_wp:
                return True
        return False

    if section_code in ("4000", "5000"):
        config_folders = get_folders_for_engagement(eng.engagement_type, eng.is_small_entity)
        planning_indices = [idx for idx, _ in config_folders.get("2000", [])]
        if not planning_indices:
            return False
        for idx in planning_indices:
            folder = db.query(Folder).filter(
                Folder.engagement_id == engagement_id,
                Folder.wp_number == idx,
                Folder.is_deleted == False
            ).first()
            if not folder:
                return True
            has_wp = db.query(WorkingPaper).filter(
                WorkingPaper.folder_id == folder.folder_id,
                WorkingPaper.is_deleted == False
            ).first()
            if not has_wp:
                return True
        return False

    return False

def get_user_engagement_role(db: Session, engagement_id: str, user: User) -> str:
    if user.role in ("Partner", "Admin"):
        return "Reviewer"
    from app.models.models import EngagementUser
    eu = db.query(EngagementUser).filter(
        EngagementUser.engagement_id == engagement_id,
        EngagementUser.user_id == user.user_id
    ).first()
    if eu and eu.role:
        return eu.role
    if user.role == "Audit Manager":
        return "Reviewer"
    elif user.role == "EQCR Reviewer":
        return "EQCR"
    return "Preparer"

def ensure_engagement_editable(db: Session, engagement_id: str):
    from app.models.models import Engagement
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if eng.status == "Archived":
        raise HTTPException(status_code=400, detail={"error": "Engagement is archived", "code": "ENGAGEMENT_ARCHIVED"})
    return eng

def ensure_section_editable(db: Session, engagement_id: str, section_code: str):
    ensure_engagement_editable(db, engagement_id)
    if is_section_locked(db, engagement_id, section_code):
        raise HTTPException(
            status_code=400,
            detail={"error": f"Section {section_code} is locked by the sequential workflow", "code": "SECTION_LOCKED"},
        )

def can_prepare(engagement_role: str) -> bool:
    return engagement_role in ("Preparer", "Reviewer")

def can_review(engagement_role: str) -> bool:
    return engagement_role in ("Reviewer", "EQCR")

