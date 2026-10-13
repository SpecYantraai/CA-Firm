from __future__ import annotations

from datetime import datetime
from pathlib import Path
import json
import re
import zipfile

from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.models import Engagement, FinalAuditArchive, WorkingPaper, EventLog
from app.services.quality_checks import run_quality_checks


def build_final_archive(db: Session, engagement: Engagement, actor_id: str, actor_name: str) -> FinalAuditArchive:
    quality = run_quality_checks(db, engagement.engagement_id)
    wps = db.query(WorkingPaper).filter(
        WorkingPaper.engagement_id == engagement.engagement_id,
        WorkingPaper.is_deleted == False
    ).order_by(WorkingPaper.wp_number).all()

    archive_dir = Path(settings.FILE_STORAGE_PATH) / engagement.engagement_id / "final-archives"
    archive_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    archive_name = f"{_safe_name(engagement.client_name)}-{engagement.financial_year}-final-audit-file-{timestamp}.zip"
    archive_path = archive_dir / archive_name

    manifest = {
        "engagement_id": engagement.engagement_id,
        "client_name": engagement.client_name,
        "financial_year": engagement.financial_year,
        "engagement_type": engagement.engagement_type,
        "assembled_at": datetime.utcnow().isoformat() + "Z",
        "assembled_by": actor_name,
        "quality_score": quality.score,
        "quality_issue_count": quality.total_issues,
        "working_papers": [],
        "quality_findings": [item.model_dump(mode="json") for item in quality.checks],
    }

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for wp in wps:
            file_path = Path(wp.file_storage_path or "")
            entry = {
                "wp_id": wp.wp_id,
                "wp_number": wp.wp_number,
                "filename": wp.filename,
                "review_status": wp.review_status,
                "current_version": wp.current_version,
                "prepared_by": wp.prepared_by_name,
                "prepared_by_initials": wp.prepared_by_initials,
                "reviewer1_initials": wp.reviewer1_initials,
                "reviewer2_initials": wp.reviewer2_initials,
                "final_reviewer_name": wp.final_reviewer_name,
                "final_reviewed_at": wp.final_reviewed_at.isoformat() if wp.final_reviewed_at else None,
            }
            manifest["working_papers"].append(entry)
            if file_path.exists():
                zf.write(file_path, f"working-papers/{_safe_name(wp.wp_number)}-{_safe_name(wp.filename)}")
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    archive = FinalAuditArchive(
        engagement_id=engagement.engagement_id,
        archive_name=archive_name,
        file_storage_path=str(archive_path),
        file_size_bytes=archive_path.stat().st_size,
        quality_score=quality.score,
        issue_count=quality.total_issues,
        assembled_by=actor_id,
        assembled_by_name=actor_name,
        manifest_json=manifest,
    )
    db.add(archive)
    db.flush()
    return archive


def post_assembly_changes(db: Session, archive: FinalAuditArchive) -> int:
    return db.query(EventLog).filter(
        EventLog.engagement_id == archive.engagement_id,
        EventLog.timestamp > archive.assembled_at,
        EventLog.event_type.in_((
            "wp.uploaded", "wp.replaced", "wp.edited", "wp.deleted", "wp.renamed",
            "note.raised", "note.closed", "signoff.recorded", "review.submitted", "review.finalised",
            "esignature.created", "esignature.signed", "esignature.cancelled",
        ))
    ).count()


def _safe_name(value: str | None) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value or "file").strip("-")
    return cleaned[:140] or "file"
