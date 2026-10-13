from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, hash_password, generate_temp_password
from app.core.deps import get_current_user
from app.models.models import User, LoginLog
from app.schemas.schemas import LoginRequest, TokenResponse, UserOut, ChangePasswordRequest, PasswordResetRequest

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()

    log = LoginLog(
        email_attempted=payload.email,
        ip_address=ip,
        success=False,
        user_id=user.user_id if user else None
    )

    if not user or not verify_password(payload.password, user.hashed_password):
        db.add(log)
        db.commit()
        raise HTTPException(status_code=401, detail={"error": "Invalid credentials", "code": "AUTH_REQUIRED"})

    log.success = True
    user.last_login_at = datetime.utcnow()
    db.add(log)
    db.commit()

    token = create_access_token({"sub": user.user_id, "role": user.role})
    return {"token": token, "user": UserOut.model_validate(user)}

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    return {"data": None, "message": "Session invalidated"}

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail={"error": "Current password incorrect", "code": "VALIDATION_ERROR"})
    current_user.hashed_password = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"data": None, "message": "Password changed successfully"}

@router.post("/request-password-reset")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "Active user not found", "code": "NOT_FOUND"})

    temp_pw = generate_temp_password()
    user.hashed_password = hash_password(temp_pw)
    user.must_change_password = True
    db.commit()
    return {
        "data": {"email": user.email},
        "message": f"Temporary password: {temp_pw}"
    }
