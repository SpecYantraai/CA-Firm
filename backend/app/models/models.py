from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey, Enum, BigInteger, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

def gen_uuid(): return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    user_id = Column(String(36), primary_key=True, default=gen_uuid)
    full_name = Column(String(255), nullable=False)
    initials = Column(String(20), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    deactivated_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)

class LoginLog(Base):
    __tablename__ = "login_logs"
    log_id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=True)
    email_attempted = Column(String(255))
    ip_address = Column(String(64))
    success = Column(Boolean, default=False)
    timestamp = Column(DateTime, server_default=func.now())

class Engagement(Base):
    __tablename__ = "engagements"
    engagement_id = Column(String(36), primary_key=True, default=gen_uuid)
    client_name = Column(String(255), nullable=False, index=True)
    financial_year = Column(String(20), nullable=False)
    engagement_type = Column(String(100), default="statutory-audit-corporate")
    status = Column(String(20), default="Active")
    is_eqcr_designated = Column(Boolean, default=False)
    is_small_entity = Column(Boolean, default=False)
    workflow_override = Column(Boolean, default=False)
    eqcr_reviewer_id = Column(String(36), nullable=True)
    prior_year_engagement_id = Column(String(36), nullable=True)
    created_by = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    archived_at = Column(DateTime, nullable=True)
    archived_by = Column(String(36), nullable=True)
    reopened_at = Column(DateTime, nullable=True)
    reopened_by = Column(String(36), nullable=True)

class EngagementUser(Base):
    __tablename__ = "engagement_users"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    engagement_id = Column(String(36), ForeignKey("engagements.engagement_id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    role = Column(String(50), default="Preparer")
    assigned_at = Column(DateTime, server_default=func.now())
    assigned_by = Column(String(36), nullable=True)

class Section(Base):
    __tablename__ = "sections"
    section_id = Column(String(36), primary_key=True, default=gen_uuid)
    engagement_id = Column(String(36), ForeignKey("engagements.engagement_id"), nullable=False)
    section_code = Column(String(10), nullable=False)
    section_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class Folder(Base):
    __tablename__ = "folders"
    folder_id = Column(String(36), primary_key=True, default=gen_uuid)
    engagement_id = Column(String(36), ForeignKey("engagements.engagement_id"), nullable=False)
    section_id = Column(String(36), ForeignKey("sections.section_id"), nullable=False)
    parent_folder_id = Column(String(36), ForeignKey("folders.folder_id"), nullable=True)
    folder_name = Column(String(255), nullable=False)
    depth = Column(Integer, default=1)
    full_path = Column(String(2000))
    wp_number = Column(String(50))
    created_by = Column(String(36), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    is_deleted = Column(Boolean, default=False)

class WorkingPaper(Base):
    __tablename__ = "working_papers"
    wp_id = Column(String(36), primary_key=True, default=gen_uuid)
    engagement_id = Column(String(36), ForeignKey("engagements.engagement_id"), nullable=False)
    section_id = Column(String(36), ForeignKey("sections.section_id"), nullable=False)
    folder_id = Column(String(36), ForeignKey("folders.folder_id"), nullable=False)
    wp_number = Column(String(50), nullable=False, index=True)
    filename = Column(String(500), nullable=False)
    file_format = Column(String(20))
    file_size_bytes = Column(BigInteger)
    file_storage_path = Column(String(1000))
    review_status = Column(String(30), default="Draft")
    prepared_by = Column(String(36), nullable=True)
    prepared_by_name = Column(String(255))
    prepared_by_initials = Column(String(20), nullable=True)
    prepared_at = Column(DateTime, nullable=True)
    final_reviewer_id = Column(String(36), nullable=True)
    final_reviewer_name = Column(String(255), nullable=True)
    reviewer1_initials = Column(String(20), nullable=True)
    reviewer2_initials = Column(String(20), nullable=True)
    final_reviewed_at = Column(DateTime, nullable=True)
    current_version = Column(Integer, default=1)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    review_notes = relationship("ReviewNote", backref="working_paper", lazy="select")
    sign_offs = relationship("SignOff", backref="working_paper", lazy="select")

class FileVersion(Base):
    __tablename__ = "file_versions"
    version_id = Column(String(36), primary_key=True, default=gen_uuid)
    wp_id = Column(String(36), ForeignKey("working_papers.wp_id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    filename = Column(String(500))
    file_size_bytes = Column(BigInteger)
    file_storage_path = Column(String(1000))
    uploaded_by = Column(String(36), nullable=True)
    uploaded_by_name = Column(String(255))
    uploaded_at = Column(DateTime, server_default=func.now())
    comment = Column(Text, nullable=True)

class ReviewNote(Base):
    __tablename__ = "review_notes"
    note_id = Column(String(36), primary_key=True, default=gen_uuid)
    wp_id = Column(String(36), ForeignKey("working_papers.wp_id"), nullable=False)
    engagement_id = Column(String(36), ForeignKey("engagements.engagement_id"), nullable=False)
    note_text = Column(Text, nullable=False)
    status = Column(String(10), default="Open")
    raised_by = Column(String(36), nullable=True)
    raised_by_name = Column(String(255))
    raised_by_role = Column(String(50))
    raised_at = Column(DateTime, server_default=func.now())
    closed_by = Column(String(36), nullable=True)
    closed_by_name = Column(String(255), nullable=True)
    closed_at = Column(DateTime, nullable=True)
    response_text = Column(Text, nullable=True)
    responded_by = Column(String(36), nullable=True)
    responded_by_name = Column(String(255), nullable=True)
    responded_at = Column(DateTime, nullable=True)

class SignOff(Base):
    __tablename__ = "sign_offs"
    signoff_id = Column(String(36), primary_key=True, default=gen_uuid)
    wp_id = Column(String(36), ForeignKey("working_papers.wp_id"), nullable=False)
    signoff_type = Column(String(20), nullable=False)
    user_id = Column(String(36), nullable=True)
    user_name = Column(String(255))
    initials = Column(String(20), nullable=True)
    role = Column(String(50))
    signed_at = Column(DateTime, nullable=True)
    recorded_at = Column(DateTime, server_default=func.now())

class EventLog(Base):
    __tablename__ = "event_logs"
    event_id = Column(String(36), primary_key=True, default=gen_uuid)
    event_type = Column(String(100), nullable=False, index=True)
    timestamp = Column(DateTime, server_default=func.now(), index=True)
    actor_id = Column(String(36), nullable=True)
    actor_name = Column(String(255))
    engagement_id = Column(String(36), nullable=True)
    payload = Column(JSON, nullable=True)

class WorkingPaperLink(Base):
    __tablename__ = "working_paper_links"
    link_id = Column(String(36), primary_key=True, default=gen_uuid)
    source_wp_id = Column(String(36), ForeignKey("working_papers.wp_id"), nullable=False)
    target_wp_id = Column(String(36), ForeignKey("working_papers.wp_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
