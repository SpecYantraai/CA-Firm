"""Shared, server-side model configuration for agent workers."""
import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken
from app.core.config import settings
from app.models.models import AppSetting

SETTING_KEY = "ai_agent_model_settings"
PROVIDERS = {
    "nvidia": {"model": "nvidia/nemotron-3-ultra-550b-a55b", "base_url": "https://integrate.api.nvidia.com/v1"},
    "openai": {"model": "gpt-4o", "base_url": "https://api.openai.com/v1"},
    "anthropic": {"model": "claude-sonnet-4-6", "base_url": "https://api.anthropic.com"},
    "openai-compatible": {"model": "", "base_url": ""},
}


def cipher():
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
    return Fernet(key)


def stored_settings(db):
    row = db.get(AppSetting, SETTING_KEY)
    return json.loads(row.value) if row and row.value else None


def public_settings(db):
    stored = stored_settings(db)
    data = stored or {"enabled": False, "provider": "nvidia", **PROVIDERS["nvidia"], "timeout_seconds": 60}
    return {key: data.get(key) for key in ("enabled", "provider", "model", "base_url", "timeout_seconds")} | {
        "saved": stored is not None, "key_stored": bool(data.get("api_key_encrypted")),
        "api_key_cleared": bool(data.get("api_key_cleared")), "providers": PROVIDERS,
    }


def prepare_settings(db, payload):
    data = payload.model_dump(exclude={"api_key", "clear_api_key"})
    previous = stored_settings(db) or {}
    same_provider = previous.get("provider") == data["provider"]
    data["api_key_encrypted"] = previous.get("api_key_encrypted") if same_provider else None
    data["api_key_cleared"] = previous.get("api_key_cleared", False) if same_provider else False
    if payload.clear_api_key:
        data.update(api_key_encrypted=None, api_key_cleared=True)
    elif payload.api_key and payload.api_key.get_secret_value().strip():
        data["api_key_encrypted"] = cipher().encrypt(payload.api_key.get_secret_value().strip().encode("utf-8")).decode("ascii")
        data["api_key_cleared"] = False
    return data


def runtime_settings(data):
    if not data or not data.get("enabled"):
        return None
    key = None
    if data.get("api_key_encrypted"):
        try:
            key = cipher().decrypt(data["api_key_encrypted"].encode("ascii")).decode("utf-8")
        except InvalidToken as exc:
            raise RuntimeError("The saved API key could not be read. Re-enter it in AI Agent Configuration.") from exc
    elif data.get("api_key_cleared"):
        key = ""
    return {name: data[name] for name in ("provider", "model", "base_url", "timeout_seconds")} | {"api_key": key}


def load_runtime_settings():
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        return runtime_settings(stored_settings(db))


def save_settings(db, payload):
    data = prepare_settings(db, payload)
    row = db.get(AppSetting, SETTING_KEY)
    if not row:
        row = AppSetting(key=SETTING_KEY)
        db.add(row)
    row.value = json.dumps(data)
    db.flush()
    return public_settings(db)
