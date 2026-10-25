"""Authenticated, versioned editing for uploaded DOCX and XLSX working papers."""
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import can_access_engagement, get_current_user
from app.models.models import Engagement, User, WorkingPaper
from app.services.app_settings import get_editor_settings
from app.services.native_office import OfficeError, word_view, workbook_view, write_word, write_workbook
from app.api.v1.endpoints.wps import get_wp_or_404, save_editor_content, user_can_edit_wp, wp_to_out

router = APIRouter(tags=["native-editor"])


class OfficeSave(BaseModel):
    version: int = Field(ge=1)
    document: dict[str, Any] | None = None
    edits: dict[str, dict[str, str]] | None = None


def authorized_wp(wp_id, user, db, write=False):
    if write:
        wp = db.query(WorkingPaper).filter(WorkingPaper.wp_id == wp_id, WorkingPaper.is_deleted == False).populate_existing().with_for_update().first()
        if wp is None:
            raise HTTPException(404, detail={"error": "Working paper not found"})
    else:
        wp = get_wp_or_404(wp_id, db)
    engagement = db.get(Engagement, wp.engagement_id)
    if not engagement or not can_access_engagement(engagement, user, db):
        raise HTTPException(403, detail={"error": "You do not have access to this engagement."})
    ext = (wp.file_format or Path(wp.filename).suffix.lstrip(".")).lower()
    if ext not in {"docx", "xlsx"}:
        raise HTTPException(415, detail={"error": "The built-in editor supports DOCX and XLSX files."})
    if get_editor_settings(db)["provider"] != "builtin":
        raise HTTPException(403, detail={"error": "The built-in editor is disabled in Admin Settings."})
    if write and not user_can_edit_wp(db, wp, user):
        raise HTTPException(403, detail={"error": "This working paper is read-only because of role, archive, or workflow lock rules."})
    return wp, ext


def content(wp):
    path = Path(wp.file_storage_path)
    if not path.is_file():
        raise HTTPException(404, detail={"error": "File not found on server."})
    if path.stat().st_size > settings.max_file_size_bytes:
        raise HTTPException(413, detail={"error": "File exceeds the configured size limit."})
    return path.read_bytes()


@router.get("/wps/{wp_id}/native-editor")
def open_document(wp_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wp, ext = authorized_wp(wp_id, user, db)
    try:
        data = content(wp)
        view = {"document": word_view(data)} if ext == "docx" else {"workbook": workbook_view(data)}
        return {"version": wp.current_version, "format": ext, "editable": user_can_edit_wp(db, wp, user), **view}
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc) if isinstance(exc, OfficeError) else "This file could not be opened. It may be corrupt, encrypted, or unsupported."
        raise HTTPException(422, detail={"error": message}) from exc


@router.put("/wps/{wp_id}/native-editor")
def save_document(wp_id: str, payload: OfficeSave, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wp, ext = authorized_wp(wp_id, user, db, write=True)
    if wp.current_version != payload.version:
        raise HTTPException(409, detail={"error": "A newer version exists. Reload the document before saving.", "code": "VERSION_CONFLICT"})
    if len(json.dumps(payload.model_dump()).encode("utf-8")) > min(settings.max_file_size_bytes, 10_000_000):
        raise HTTPException(413, detail={"error": "The edit payload is too large."})
    try:
        before = content(wp)
        if ext == "docx":
            if payload.document is None or payload.edits is not None:
                raise OfficeError("DOCX saves require document content only.")
            after = write_word(before, payload.document)
        else:
            if payload.edits is None or payload.document is not None:
                raise OfficeError("XLSX saves require cell edits only.")
            if not any(payload.edits.values()):
                return {"data": wp_to_out(wp), "message": "No changes to save."}
            after = write_workbook(before, payload.edits)
        if len(after) > settings.max_file_size_bytes:
            raise OfficeError("The edited file exceeds the configured size limit.")
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc) if isinstance(exc, OfficeError) else "The document could not be saved. No changes were written."
        raise HTTPException(422, detail={"error": message}) from exc
    if after == before:
        return {"data": wp_to_out(wp), "message": "No changes to save."}
    save_editor_content(db, wp, after, user, "Saved from built-in Office editor")
    saved_path = Path(wp.file_storage_path)
    try:
        db.commit()
    except Exception:
        db.rollback()
        saved_path.unlink(missing_ok=True)
        raise
    db.refresh(wp)
    return {"data": wp_to_out(wp), "message": "New document version saved."}
