"""
Event Bus — AMS Event Bus Foundation (FR-066 to FR-069)
Async, non-blocking event emission. Never blocks user actions.
"""
import asyncio
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app.models.models import EventLog


EVENT_TYPES = {
    "engagement.created",
    "engagement.archived",
    "engagement.reopened",
    "engagement.rollforward",
    "wp.uploaded",
    "wp.replaced",
    "wp.edited",
    "wp.deleted",
    "wp.renamed",
    "review.submitted",
    "review.approved",
    "review.finalised",
    "note.raised",
    "note.closed",
    "user.created",
    "user.deactivated",
    "user.assigned",
    "signoff.recorded",
    "engagement.workflow_override",
}


def emit_event(
    db: Session,
    event_type: str,
    actor_id: Optional[str],
    actor_name: Optional[str],
    engagement_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Emit a structured event to the event log.
    Fire-and-forget — called after user action completes.
    In Stage 2 agent services will subscribe to this log.
    """
    try:
        event = EventLog(
            event_type=event_type,
            actor_id=actor_id,
            actor_name=actor_name,
            engagement_id=engagement_id,
            payload=payload or {},
        )
        db.add(event)
        db.flush()  # Write to DB without blocking commit
    except Exception as e:
        # Never let event logging block a user action
        print(f"[EventBus] Failed to emit {event_type}: {e}")
