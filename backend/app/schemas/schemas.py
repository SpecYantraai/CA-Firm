from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# ── User ─────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    full_name: str
    email: str
    role: str
    initials: Optional[str] = None

class UserOut(BaseModel):
    user_id: str
    full_name: str
    initials: Optional[str] = None
    email: str
    role: str
    is_active: bool
    must_change_password: bool
    created_at: Optional[datetime] = None
    deactivated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    token: str
    user: UserOut

class EngagementUserAssign(BaseModel):
    user_id: str
    role: str = "Preparer"

class EngagementUserOut(BaseModel):
    id: str
    engagement_id: str
    user_id: str
    full_name: str
    email: str
    initials: Optional[str] = None
    system_role: str
    engagement_role: str
    assigned_at: Optional[datetime] = None

# ── Engagement ────────────────────────────────────────────────────────────────
class EngagementCreate(BaseModel):
    client_name: str
    financial_year: str
    engagement_type: str = "statutory-audit-corporate"
    is_eqcr_designated: bool = False
    is_small_entity: bool = False

class EngagementOut(BaseModel):
    engagement_id: str
    client_name: str
    financial_year: str
    engagement_type: str
    status: str
    is_eqcr_designated: bool
    is_small_entity: bool
    workflow_override: bool
    created_by: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    prior_year_engagement_id: Optional[str] = None
    class Config:
        from_attributes = True

class SectionOut(BaseModel):
    section_id: str
    engagement_id: str
    section_code: str
    section_name: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class EngagementDetail(EngagementOut):
    sections: List[SectionOut] = []

class RollForwardRequest(BaseModel):
    new_financial_year: str
    copy_prior_wps: bool = False

# ── Working Paper Links ────────────────────────────────────────────────────────
class WPLinkCreate(BaseModel):
    target_wp_number: str

class WPLinkOut(BaseModel):
    link_id: str
    source_wp_id: str
    target_wp_id: str
    target_wp_number: str
    target_filename: str
    created_at: datetime
    class Config:
        from_attributes = True

# ── Working Paper ─────────────────────────────────────────────────────────────
class WPOut(BaseModel):
    wp_id: str
    engagement_id: str
    section_id: str
    folder_id: str
    wp_number: str
    filename: str
    file_format: Optional[str] = None
    file_size_bytes: Optional[int] = None
    review_status: str
    prepared_by_name: Optional[str] = None
    prepared_by_initials: Optional[str] = None
    prepared_at: Optional[datetime] = None
    final_reviewer_name: Optional[str] = None
    reviewer1_initials: Optional[str] = None
    reviewer2_initials: Optional[str] = None
    final_reviewed_at: Optional[datetime] = None
    current_version: int
    is_deleted: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    open_notes_count: int = 0
    class Config:
        from_attributes = True

class WPUpdate(BaseModel):
    filename: Optional[str] = None
    wp_number: Optional[str] = None
    prepared_by_initials: Optional[str] = None
    reviewer1_initials: Optional[str] = None
    reviewer2_initials: Optional[str] = None
    prepared_at: Optional[datetime] = None
    final_reviewed_at: Optional[datetime] = None

# ── Folder ────────────────────────────────────────────────────────────────────
class FolderCreate(BaseModel):
    parent_folder_id: Optional[str] = None
    section_id: str
    folder_name: str
    wp_number: Optional[str] = None

class FolderRename(BaseModel):
    folder_name: Optional[str] = None
    wp_number: Optional[str] = None

class FolderOut(BaseModel):
    folder_id: str
    engagement_id: str
    section_id: str
    parent_folder_id: Optional[str] = None
    folder_name: str
    depth: int
    full_path: Optional[str] = None
    wp_number: Optional[str] = None
    created_at: Optional[datetime] = None
    children: List[FolderOut] = []
    working_papers: List[WPOut] = []
    class Config:
        from_attributes = True

# ── File Version ──────────────────────────────────────────────────────────────
class FileVersionOut(BaseModel):
    version_id: str
    wp_id: str
    version_number: int
    filename: str
    file_size_bytes: Optional[int] = None
    uploaded_by_name: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    comment: Optional[str] = None
    class Config:
        from_attributes = True

# ── Review Note ───────────────────────────────────────────────────────────────
class NoteCreate(BaseModel):
    note_text: str

class NoteResponseCreate(BaseModel):
    response_text: str

class NoteOut(BaseModel):
    note_id: str
    wp_id: str
    engagement_id: str
    note_text: str
    status: str
    raised_by_name: Optional[str] = None
    raised_by_role: Optional[str] = None
    raised_at: Optional[datetime] = None
    closed_by_name: Optional[str] = None
    closed_at: Optional[datetime] = None
    response_text: Optional[str] = None
    responded_by_name: Optional[str] = None
    responded_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ── Sign Off ──────────────────────────────────────────────────────────────────
class SignOffCreate(BaseModel):
    signoff_type: str
    initials: Optional[str] = None
    signed_at: Optional[datetime] = None

class SignOffOut(BaseModel):
    signoff_id: str
    wp_id: str
    signoff_type: str
    user_name: Optional[str] = None
    initials: Optional[str] = None
    role: Optional[str] = None
    signed_at: Optional[datetime] = None
    recorded_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ── Search ────────────────────────────────────────────────────────────────────
class SearchResult(BaseModel):
    engagements: List[EngagementOut] = []
    working_papers: List[WPOut] = []

# ── Closure ──────────────────────────────────────────────────────────────────
class ClosureChecklistItem(BaseModel):
    item_id: str
    description: str
    status: str
    detail: Optional[str] = None

class ClosureChecklist(BaseModel):
    engagement_id: str
    can_archive: bool
    items: List[ClosureChecklistItem]
    open_notes_count: int

# ── Generic ──────────────────────────────────────────────────────────────────
class SuccessResponse(BaseModel):
    data: Any = None
    message: str = "Success"

class ErrorResponse(BaseModel):
    error: str
    code: str
