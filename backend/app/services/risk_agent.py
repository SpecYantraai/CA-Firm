"""AMS persistence and process transport; no risk calculation logic lives here."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.models.models import RiskAssessmentSession

BACKEND = Path(__file__).resolve().parents[2]
VENDOR = BACKEND / "vendor" / "ams_ra"


def storage_root():
    root = Path(settings.FILE_STORAGE_PATH).resolve() / "risk-agent"
    root.mkdir(parents=True, exist_ok=True)
    return root


def call_agent(operation, data=None, knowledge_base_path=None, model_configuration=None):
    if operation in {"configuration", "run", "test_connection"} and model_configuration is None:
        from app.services.agent_model_settings import load_runtime_settings
        model_configuration = load_runtime_settings()
    runtime_kb = storage_root() / "knowledge_base.xlsx"
    request = {"operation": operation, "data": data or {},
               "model_configuration": model_configuration,
               "knowledge_base_path": str(knowledge_base_path or (runtime_kb if runtime_kb.exists() else VENDOR / "data" / "knowledge_base.xlsx"))}
    try:
        result = subprocess.run(
            [sys.executable, str(BACKEND / "agent_bridge" / "worker.py")],
            input=json.dumps(request), capture_output=True, text=True, encoding="utf-8",
            cwd=str(VENDOR), timeout=600 if operation == "run" else 120,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode:
            raise RuntimeError("The agent process could not start. Install backend requirements-agent.txt in the backend Python environment.")
        response = json.loads(result.stdout)
        if not response["ok"]:
            raise RuntimeError(response["error"])
        return response["data"]
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("The agent timed out. Your saved inputs are retained; you can retry.") from exc


def initial_state(engagement):
    return {"step": 1, "stage": "draft", "context": {"engagement_id": engagement.engagement_id,
            "client_name": engagement.client_name, "financial_year": engagement.financial_year},
            "documents": [], "financials": {}, "parsed_fs": None, "candidates": [],
            "review_rows": [], "error": None}


def get_session(db, engagement_id):
    return db.get(RiskAssessmentSession, engagement_id)


def load_state(db, engagement):
    session = get_session(db, engagement.engagement_id)
    return deepcopy(session.state) if session else initial_state(engagement)


def public_session(db, engagement):
    session = get_session(db, engagement.engagement_id)
    state = deepcopy(session.state) if session else initial_state(engagement)
    if interrupted_run(state):
        state.update(stage="failed", error="The previous risk engine run was interrupted. Your inputs are saved; re-run the engine.")
    state["context"].pop("document_paths", None)
    for document in state["documents"]:
        document.pop("path", None)
    return {"revision": session.revision if session else 0, "state": state,
            "updated_at": session.updated_at.isoformat() if session and session.updated_at else None}


def check_revision(db, engagement_id, expected):
    session = get_session(db, engagement_id)
    if (session.revision if session else 0) != expected:
        raise HTTPException(409, "This assessment was updated by another user. Reload before saving.")
    if session and session.state.get("stage") == "running" and not interrupted_run(session.state):
        raise HTTPException(409, "The risk engine is running. Wait for it to finish.")


def interrupted_run(state):
    if state.get("stage") != "running":
        return False
    try:
        started = datetime.fromisoformat(state["run_started_at"])
        return (datetime.now(timezone.utc) - started).total_seconds() > 660
    except (KeyError, ValueError, TypeError):
        return True


def save_state(db, engagement_id, state, expected, actor_id):
    if expected == 0:
        db.add(RiskAssessmentSession(engagement_id=engagement_id, revision=1, state=state, updated_by=actor_id))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "This assessment was updated by another user. Reload before saving.")
    else:
        count = db.query(RiskAssessmentSession).filter(
            RiskAssessmentSession.engagement_id == engagement_id,
            RiskAssessmentSession.revision == expected,
        ).update({"state": state, "revision": expected + 1, "updated_by": actor_id}, synchronize_session=False)
        if not count:
            db.rollback()
            raise HTTPException(409, "This assessment was updated by another user. Reload before saving.")


def invalidate_result(state):
    state.update(stage="draft", review_rows=[], error=None)
    for key in ("rcm_rows", "errors", "status", "kb_match", "kb_row_count", "llm_row_count", "unmatched_mcotabds"):
        state["context"].pop(key, None)
    state.pop("approval", None)


def group_risks(rows):
    grouped = {}
    for row in rows:
        mcotabd = row.get("mcotabd") or row.get("mcotabd_confirmed", "")
        key = f"{mcotabd}||{row.get('assertion', '')}||{row.get('risk', '')}"
        if key not in grouped:
            grouped[key] = {"key": key, "mcotabd": mcotabd,
                "assertion": row.get("assertion", ""), "risk": row.get("risk", ""),
                "controls": [], "procedures": [], "source": row.get("source", ""),
                "driven_by_auditor_notes": row.get("driven_by_auditor_notes", False)}
        for source, target in (("ca", "controls"), ("sp", "procedures")):
            value = row.get(source, "")
            if value and value not in grouped[key][target]:
                grouped[key][target].append(value)
    return list(grouped.values())


def execute_run(engagement_id, revision, actor_id, actor_name):
    from app.core.database import SessionLocal
    from app.services.events import emit_event
    with SessionLocal() as db:
        session = get_session(db, engagement_id)
        if not session or session.revision != revision:
            return
        state = deepcopy(session.state)
        try:
            result = call_agent("run", state["context"])
            state["context"] = result
            if result.get("errors"):
                raise RuntimeError(result["errors"][-1]["error"])
            state.update(stage="complete", error=None, review_rows=group_risks(result.get("rcm_rows", [])))
        except Exception as exc:
            state.update(stage="failed", error=str(exc))
        try:
            save_state(db, engagement_id, state, revision, actor_id)
        except HTTPException:
            return
        emit_event(db, "agent.risk.completed" if state["stage"] == "complete" else "agent.risk.failed",
                   actor_id, actor_name, engagement_id=engagement_id,
                   payload={"stage": state["stage"]})
        db.commit()
