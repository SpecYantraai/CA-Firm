from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.core.security import hash_password, generate_temp_password
from app.core.deps import get_current_user, require_roles
from app.models.models import User, EngagementUser, Engagement
from app.schemas.schemas import UserCreate, UserOut, EngagementUserAssign, EngagementUserOut
from app.services.events import emit_event
from app.services.initials import derive_initials

router = APIRouter(prefix="/users", tags=["users"])

@router.get("", response_model=list[UserOut])
def list_users(
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    return [UserOut.model_validate(u) for u in db.query(User).all()]

@router.post("", response_model=dict)
def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db)
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail={"error": "Email already registered", "code": "DUPLICATE"})

    temp_pw = generate_temp_password()
    user = User(
        full_name=payload.full_name,
        initials=(payload.initials or derive_initials(payload.full_name)).strip().upper(),
        email=payload.email,
        role=payload.role,
        hashed_password=hash_password(temp_pw),
        must_change_password=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-assign Partners to all engagements
    if payload.role == "Partner":
        engagements = db.query(Engagement).all()
        for eng in engagements:
            eu = EngagementUser(
                engagement_id=eng.engagement_id,
                user_id=user.user_id,
                role="Reviewer",
                assigned_by=current_user.user_id
            )
            db.add(eu)
        db.commit()

    emit_event(db, "user.created", current_user.user_id, current_user.full_name,
               payload={"new_user": user.email, "role": user.role})
    db.commit()

    return {
        "data": UserOut.model_validate(user),
        "message": f"User created. Temporary password: {temp_pw}"
    }

@router.patch("/{user_id}/deactivate")
def deactivate_user(
    user_id: str,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "User not found", "code": "NOT_FOUND"})
    user.is_active = False
    user.deactivated_at = datetime.utcnow()
    # Remove from engagements (attribution preserved in WPs)
    db.query(EngagementUser).filter(EngagementUser.user_id == user_id).delete()
    db.commit()
    emit_event(db, "user.deactivated", current_user.user_id, current_user.full_name,
               payload={"deactivated_user": user.email})
    db.commit()
    return {"data": None, "message": "User deactivated. All WP attributions preserved."}

@router.post("/{engagement_id}/assign")
def assign_user_to_engagement(
    engagement_id: str,
    payload: EngagementUserAssign,
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    if payload.role not in ("Preparer", "Reviewer", "EQCR"):
        raise HTTPException(status_code=400, detail={"error": "Engagement role must be Preparer, Reviewer or EQCR", "code": "INVALID_ROLE"})
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail={"error": "Engagement not found", "code": "NOT_FOUND"})
    if eng.status == "Archived":
        raise HTTPException(status_code=400, detail={"error": "Engagement is archived", "code": "ENGAGEMENT_ARCHIVED"})
    user = db.query(User).filter(User.user_id == payload.user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "User not found", "code": "NOT_FOUND"})

    existing = db.query(EngagementUser).filter(
        EngagementUser.engagement_id == engagement_id,
        EngagementUser.user_id == payload.user_id
    ).first()
    if existing:
        existing.role = payload.role
        emit_event(db, "user.assignment_updated", current_user.user_id, current_user.full_name,
                   engagement_id=engagement_id, payload={"user_id": payload.user_id, "role": payload.role})
        db.commit()
        return {"data": None, "message": "Assignment role updated"}

    eu = EngagementUser(
        engagement_id=engagement_id,
        user_id=payload.user_id,
        role=payload.role,
        assigned_by=current_user.user_id
    )
    db.add(eu)
    emit_event(db, "user.assigned", current_user.user_id, current_user.full_name,
               engagement_id=engagement_id, payload={"user_id": payload.user_id, "role": payload.role})
    db.commit()
    return {"data": None, "message": "User assigned to engagement"}

@router.get("/{engagement_id}/assignments", response_model=list[EngagementUserOut])
def list_engagement_assignments(
    engagement_id: str,
    current_user: User = Depends(require_roles("Audit Manager", "Partner", "Admin")),
    db: Session = Depends(get_db)
):
    rows = db.query(EngagementUser, User).join(User, EngagementUser.user_id == User.user_id).filter(
        EngagementUser.engagement_id == engagement_id
    ).order_by(User.full_name).all()
    return [
        EngagementUserOut(
            id=eu.id,
            engagement_id=eu.engagement_id,
            user_id=user.user_id,
            full_name=user.full_name,
            email=user.email,
            initials=user.initials,
            system_role=user.role,
            engagement_role=eu.role or "Preparer",
            assigned_at=eu.assigned_at,
        )
        for eu, user in rows
    ]
