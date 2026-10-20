from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from typing import Literal
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import User
from app.services import agent_model_settings as model_settings
from app.services.events import emit_event
from app.services.risk_agent import call_agent

router = APIRouter(prefix="/settings/ai-agents", tags=["AI agent configuration"])


class AgentModelSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True
    provider: Literal["nvidia", "openai", "anthropic", "openai-compatible"]
    model: str = Field(min_length=1, max_length=255)
    base_url: str = Field(min_length=1, max_length=2000)
    timeout_seconds: int = Field(default=60, ge=10, le=300)
    api_key: SecretStr | None = None
    clear_api_key: bool = False

    @field_validator("model")
    @classmethod
    def trim_model(cls, value):
        if not value.strip():
            raise ValueError("Enter a model name.")
        return value.strip()

    @field_validator("base_url")
    @classmethod
    def validate_endpoint(cls, value):
        parsed = urlsplit(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Enter an HTTP(S) API base URL without credentials, query parameters, or fragments.")
        try:
            parsed.port
        except ValueError as exc:
            raise ValueError("The API URL has an invalid port.") from exc
        path = parsed.path.rstrip("/")
        for suffix in ("/chat/completions", "/v1/messages"):
            if path.endswith(suffix):
                path = path[:-len(suffix)]
        return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))

    @model_validator(mode="after")
    def validate_key_change(self):
        if self.api_key and len(self.api_key.get_secret_value()) > 16000:
            raise ValueError("API key is too long.")
        if self.clear_api_key and self.api_key and self.api_key.get_secret_value().strip():
            raise ValueError("Choose either a replacement key or removal of the saved key.")
        return self


@router.get("")
def read_settings(user: User = Depends(require_roles("Admin")), db: Session = Depends(get_db)):
    return model_settings.public_settings(db)


@router.put("")
def update_settings(payload: AgentModelSettings, user: User = Depends(require_roles("Admin")), db: Session = Depends(get_db)):
    result = model_settings.save_settings(db, payload)
    emit_event(db, "agent.model_settings.updated", user.user_id, user.full_name,
               payload={"enabled": payload.enabled, "provider": payload.provider, "model": payload.model,
                        "api_key_changed": bool(payload.api_key or payload.clear_api_key)})
    db.commit()
    return result


@router.post("/test")
def test_connection(payload: AgentModelSettings, user: User = Depends(require_roles("Admin")), db: Session = Depends(get_db)):
    data = model_settings.prepare_settings(db, payload)
    data["enabled"] = True
    try:
        return call_agent("test_connection", model_configuration=model_settings.runtime_settings(data))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
