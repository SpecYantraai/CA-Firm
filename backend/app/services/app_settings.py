import json
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.models import AppSetting

EDITOR_SETTING_KEY = "editor_settings"

EDITOR_PROVIDERS = {
    "builtin": "Built-in DOCX and Excel Editor",
    "onlyoffice-community": "ONLYOFFICE Docs Community",
    "onlyoffice-enterprise": "ONLYOFFICE Docs Enterprise",
    "collabora-code": "Collabora Online CODE",
    "microsoft365": "Microsoft 365 Office for the web",
    "none": "No in-app editor",
}


def default_editor_settings() -> dict:
    return {
        "provider": "onlyoffice-community" if settings.DOCUMENT_EDITOR_URL else "builtin",
        "onlyoffice_url": settings.DOCUMENT_EDITOR_URL or "",
        "collabora_url": "",
        "microsoft365_enabled": False,
    }


def get_editor_settings(db: Session) -> dict:
    data = default_editor_settings()
    row = db.query(AppSetting).filter(AppSetting.key == EDITOR_SETTING_KEY).first()
    if row and row.value:
        try:
            saved = json.loads(row.value)
            if isinstance(saved, dict):
                data.update(saved)
        except json.JSONDecodeError:
            pass
    data["provider"] = data.get("provider") if data.get("provider") in EDITOR_PROVIDERS else "none"
    return data


def save_editor_settings(db: Session, payload: dict) -> dict:
    data = default_editor_settings()
    data.update(payload)
    data["provider"] = data.get("provider") if data.get("provider") in EDITOR_PROVIDERS else "none"
    data["onlyoffice_url"] = (data.get("onlyoffice_url") or "").strip().rstrip("/")
    data["collabora_url"] = (data.get("collabora_url") or "").strip().rstrip("/")

    row = db.query(AppSetting).filter(AppSetting.key == EDITOR_SETTING_KEY).first()
    if not row:
        row = AppSetting(key=EDITOR_SETTING_KEY)
        db.add(row)
    row.value = json.dumps(data)
    db.commit()
    return data
