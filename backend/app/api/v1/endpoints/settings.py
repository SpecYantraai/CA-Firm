from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import User
from app.schemas.schemas import EditorSettingsOut, EditorSettingsUpdate
from app.services.app_settings import EDITOR_PROVIDERS, get_editor_settings, save_editor_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/editor", response_model=EditorSettingsOut)
def get_editor_provider_settings(
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
):
    return EditorSettingsOut(**get_editor_settings(db))


@router.patch("/editor", response_model=dict)
def update_editor_provider_settings(
    payload: EditorSettingsUpdate,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
):
    if payload.provider not in EDITOR_PROVIDERS:
        raise HTTPException(status_code=400, detail={"error": "Unsupported editor provider", "code": "VALIDATION_ERROR"})

    data = save_editor_settings(db, payload.model_dump())
    return {
        "data": EditorSettingsOut(**data),
        "message": "Document editor settings updated",
    }


@router.get("/editor/providers")
def list_editor_providers(current_user: User = Depends(require_roles("Admin"))):
    return {
        "data": [
            {
                "value": "onlyoffice-community",
                "label": "ONLYOFFICE Docs Community",
                "license": "Free self-hosted",
                "status": "ready",
                "description": "Best free option for in-app DOCX/XLSX editing with the current integration.",
            },
            {
                "value": "collabora-code",
                "label": "Collabora Online CODE",
                "license": "Free open-source/self-hosted",
                "status": "ready",
                "description": "LibreOffice-based online editor. Requires a reachable Collabora server.",
            },
            {
                "value": "onlyoffice-enterprise",
                "label": "ONLYOFFICE Docs Enterprise",
                "license": "Paid self-hosted",
                "status": "ready",
                "description": "Same integration as Community, with commercial support and enterprise limits.",
            },
            {
                "value": "microsoft365",
                "label": "Microsoft 365 Office for the web",
                "license": "Paid",
                "status": "planned",
                "description": "Visible for product planning. Needs Microsoft tenant, licensing, and Graph/WOPI setup.",
            },
            {
                "value": "none",
                "label": "No in-app editor",
                "license": "Download only",
                "status": "ready",
                "description": "Users can preview PDFs/images and download Office files.",
            },
        ]
    }
