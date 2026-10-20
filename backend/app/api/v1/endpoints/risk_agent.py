from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Literal
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, FiniteFloat, ConfigDict
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles, ensure_engagement_editable, ensure_section_editable
from app.models.models import User, Section, Folder, WorkingPaper, FileVersion
from app.api.v1.endpoints.engagements import get_engagement_or_404
from app.services.events import emit_event
from app.services import risk_agent as bridge

router = APIRouter(tags=["risk-assessment-agent"])
PREFIX = "/engagements/{engagement_id}/risk-agent"
APPROVERS = {"Partner", "Audit Manager", "Admin"}


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)


class Details(Revision):
    legal_status: Literal["Private Limited Company", "Public Limited Company", "LLP", "Partnership Firm", "Proprietorship", "Other"]
    client_type: Literal["New client", "Repeat client"] = "New client"
    industry: str = Field(min_length=1, max_length=255)
    products: str = Field(default="", max_length=10000)
    auditor_risk_notes: str = Field(default="", max_length=20000)


class MaterialityInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    turnover: FiniteFloat = Field(ge=0)
    total_assets: FiniteFloat = Field(ge=0)
    pbt: FiniteFloat
    benchmark: Literal["System suggestion (lowest of three)", "Turnover", "Total Assets", "Profit Before Tax", "Custom figure"] = "System suggestion (lowest of three)"
    percentage: FiniteFloat | None = Field(default=None, ge=0.1, le=10)
    custom_figure: FiniteFloat | None = Field(default=None, ge=0)
    final_figure: FiniteFloat | None = Field(default=None, ge=0)
    justification: str = Field(default="", max_length=20000)


class IndustryPreview(BaseModel):
    industry: str = Field(min_length=1, max_length=255)


class MaterialitySave(MaterialityInputs):
    revision: int = Field(ge=0)


class Thresholds(Revision):
    pm_pct: FiniteFloat = Field(default=75, ge=60, le=90)
    ctm_pct: FiniteFloat = Field(default=5, ge=1, le=5)


class Scope(Revision):
    confirmed_mcotabds: list[str] = Field(min_length=1, max_length=300)
    tvt_transaction_counts: dict[str, int] = Field(default_factory=dict)


class ReviewRow(BaseModel):
    key: str
    assertion: str = Field(max_length=5000)
    risk: str = Field(max_length=20000)
    controls: list[str] = Field(max_length=200)
    procedures: list[str] = Field(max_length=200)


class Review(Revision):
    rows: list[ReviewRow] = Field(min_length=1, max_length=3000)


def invoke(operation, data=None, **kwargs):
    try:
        return bridge.call_agent(operation, data, **kwargs)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc


def editable(db, engagement_id, user, revision, allow_approved=False):
    engagement = get_engagement_or_404(db, engagement_id, user)
    ensure_engagement_editable(db, engagement_id)
    if user.role == "EQCR Reviewer":
        raise HTTPException(403, "EQCR reviewers can view this assessment but cannot change its inputs.")
    bridge.check_revision(db, engagement_id, revision)
    state = bridge.load_state(db, engagement)
    if state["stage"] == "approved" and not allow_approved:
        raise HTTPException(400, "Start a new assessment before changing an approved review.")
    return engagement, state


def commit_state(db, engagement, state, revision, user, event="agent.risk.draft_saved"):
    bridge.save_state(db, engagement.engagement_id, state, revision, user.user_id)
    emit_event(db, event, user.user_id, user.full_name, engagement_id=engagement.engagement_id,
               payload={"step": state["step"], "revision": revision + 1})
    db.commit()
    return bridge.public_session(db, engagement)


@router.get("/agents/risk-assessment/config")
def configuration(user: User = Depends(get_current_user)):
    try:
        return {"available": True, **bridge.call_agent("configuration")}
    except RuntimeError as exc:
        return {"available": False, "error": str(exc)}


@router.post("/agents/risk-assessment/knowledge-base")
def upload_knowledge_base(file: UploadFile = File(...), user: User = Depends(require_roles("Admin"))):
    if Path(file.filename or "").suffix.lower() != ".xlsx":
        raise HTTPException(400, "Upload an XLSX knowledge base.")
    target = bridge.storage_root() / f"kb-{uuid.uuid4()}.xlsx"
    write_upload(file, target)
    try:
        result = invoke("configuration", knowledge_base_path=target)
        stats = result["knowledge_base"]
        if not stats.get("loaded") or not stats.get("total_rows"):
            raise HTTPException(400, "Invalid knowledge base: a populated Data sheet in the original agent format is required.")
        target.replace(bridge.storage_root() / "knowledge_base.xlsx")
        return result
    finally:
        target.unlink(missing_ok=True)


def write_upload(file, path):
    size = 0
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("wb") as destination:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_file_size_bytes:
                    raise HTTPException(413, "The file exceeds the configured upload limit.")
                destination.write(chunk)
        if not size:
            raise HTTPException(400, "Empty files cannot be uploaded.")
        return size
    except Exception:
        path.unlink(missing_ok=True)
        raise


@router.get(PREFIX)
def assessment(engagement_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement = get_engagement_or_404(db, engagement_id, user)
    return bridge.public_session(db, engagement)


@router.post(PREFIX + "/details")
def save_details(engagement_id: str, payload: Details, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, payload.revision)
    bridge.invalidate_result(state)
    state["context"].update(payload.model_dump(exclude={"revision"}))
    state["context"].update(engagement_id=engagement_id, client_name=engagement.client_name, financial_year=engagement.financial_year)
    state["step"] = 2
    return commit_state(db, engagement, state, payload.revision, user)


@router.post(PREFIX + "/financials")
def upload_financials(engagement_id: str, revision: int = Form(..., ge=0), files: list[UploadFile] = File(...),
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, revision)
    if not state["context"].get("industry"):
        raise HTTPException(400, "Save the engagement details first.")
    if not 1 <= len(files) <= 20:
        raise HTTPException(400, "Upload between 1 and 20 files.")
    if any(Path(file.filename or "").suffix.lower() not in {".xlsx", ".xls", ".docx", ".doc"} for file in files):
        raise HTTPException(400, "The original agent accepts Excel and Word financial statements only.")
    documents = []
    for file in files:
        file_id = str(uuid.uuid4())
        name = Path((file.filename or "financials").replace("\\", "/")).name
        path = bridge.storage_root() / engagement_id / "documents" / file_id / name
        size = write_upload(file, path)
        documents.append({"file_id": file_id, "name": name, "size": size, "path": str(path)})
    parsed = invoke("parse", {"document_paths": [item["path"] for item in documents]})
    bridge.invalidate_result(state)
    state.update(documents=documents, financials=parsed["financials"], parsed_fs=parsed["parsed_fs"], candidates=[], step=3)
    for key in ("materiality", "thresholds", "confirmed_mcotabds", "tvt_transaction_counts"):
        state["context"].pop(key, None)
    state["context"].update(document_paths=[item["path"] for item in documents],
        documents_read=parsed["documents_read"], documents_failed=parsed["documents_failed"])
    return commit_state(db, engagement, state, revision, user, "agent.risk.financials_uploaded")


@router.post(PREFIX + "/preview-materiality")
def preview_materiality(engagement_id: str, payload: MaterialityInputs, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_engagement_or_404(db, engagement_id, user)
    return invoke("materiality", payload.model_dump())


@router.post(PREFIX + "/preview-industry")
def preview_industry(engagement_id: str, payload: IndustryPreview, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_engagement_or_404(db, engagement_id, user)
    return invoke("industry", payload.model_dump())


@router.post(PREFIX + "/materiality")
def save_materiality(engagement_id: str, payload: MaterialitySave, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, payload.revision)
    if not state["documents"]:
        raise HTTPException(400, "Upload financial statements first.")
    if not payload.justification.strip():
        raise HTTPException(400, "Materiality justification is required.")
    values = payload.model_dump(exclude={"revision"})
    result = invoke("materiality", values)
    bridge.invalidate_result(state)
    state["financials"].update({key: values[key] for key in ("turnover", "total_assets", "pbt")})
    state["materiality_inputs"] = values
    state["context"].update(materiality=result["materiality"], ca_materiality_override=result["materiality"]["effective_figure"],
        ca_materiality_justification=payload.justification, ca_benchmark_choice=payload.benchmark)
    for key in ("thresholds", "confirmed_mcotabds", "tvt_transaction_counts"):
        state["context"].pop(key, None)
    state.update(step=4, candidates=[])
    return commit_state(db, engagement, state, payload.revision, user)


@router.post(PREFIX + "/thresholds")
def save_thresholds(engagement_id: str, payload: Thresholds, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, payload.revision)
    mat = state["context"].get("materiality")
    if not mat:
        raise HTTPException(400, "Confirm materiality first.")
    result = invoke("thresholds", {"raw_materiality": mat.get("ca_approved_figure", mat["effective_figure"]),
                    "pm_pct": payload.pm_pct, "ctm_pct": payload.ctm_pct})
    bridge.invalidate_result(state)
    state["context"]["thresholds"] = {"rounded_materiality": result["rounded_materiality"], "pm": result["performance_materiality"],
        "pm_pct": result["pm_pct"], "ctm": result["ctm"], "ctm_pct": result["ctm_pct"]}
    mat["effective_figure"] = result["rounded_materiality"]
    state["context"]["ca_materiality_override"] = result["rounded_materiality"]
    state["context"].pop("confirmed_mcotabds", None)
    state["context"].pop("tvt_transaction_counts", None)
    state["candidates"] = invoke("scope", {"thresholds": state["context"]["thresholds"], "materiality": mat,
        "parsed_fs": state["parsed_fs"], "financials": state["financials"]})
    state["step"] = 5
    return commit_state(db, engagement, state, payload.revision, user)


@router.post(PREFIX + "/preview-thresholds")
def preview_thresholds(engagement_id: str, payload: Thresholds, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement = get_engagement_or_404(db, engagement_id, user)
    mat = bridge.load_state(db, engagement)["context"].get("materiality")
    if not mat:
        raise HTTPException(400, "Confirm materiality first.")
    return invoke("thresholds", {"raw_materiality": mat.get("ca_approved_figure", mat["effective_figure"]),
                  "pm_pct": payload.pm_pct, "ctm_pct": payload.ctm_pct})


@router.post(PREFIX + "/preview-tvt")
def preview_tvt(engagement_id: str, payload: Scope, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement = get_engagement_or_404(db, engagement_id, user)
    state = bridge.load_state(db, engagement)
    if not state["context"].get("thresholds") or any(count < 1 or count > 1_000_000_000 for count in payload.tvt_transaction_counts.values()):
        raise HTTPException(400, "Confirm thresholds and provide positive transaction counts.")
    return invoke("tvt", {"pm": state["context"]["thresholds"]["pm"], "counts": payload.tvt_transaction_counts})


@router.post(PREFIX + "/scope")
def save_scope(engagement_id: str, payload: Scope, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, payload.revision)
    if not state["context"].get("thresholds"):
        raise HTTPException(400, "Confirm thresholds first.")
    if any(not name.strip() or len(name) > 500 for name in payload.confirmed_mcotabds):
        raise HTTPException(400, "Each MCOTABD must have a name of at most 500 characters.")
    if any(count < 1 or count > 1_000_000_000 for count in payload.tvt_transaction_counts.values()):
        raise HTTPException(400, "Expected transaction counts must be positive integers.")
    bridge.invalidate_result(state)
    counts = {key: value for key, value in payload.tvt_transaction_counts.items() if key in payload.confirmed_mcotabds}
    state["context"].update(confirmed_mcotabds=list(dict.fromkeys(payload.confirmed_mcotabds)), tvt_transaction_counts=counts,
        tvt_per_account=invoke("tvt", {"pm": state["context"]["thresholds"]["pm"], "counts": counts}))
    state["step"] = 6
    return commit_state(db, engagement, state, payload.revision, user)


@router.post(PREFIX + "/run", status_code=202)
def run(engagement_id: str, payload: Revision, tasks: BackgroundTasks, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, payload.revision)
    if not state["context"].get("confirmed_mcotabds") or not state["documents"]:
        raise HTTPException(400, "Confirm the MCOTABDs and upload financial statements first.")
    config = invoke("configuration")
    if not config["knowledge_base"].get("loaded") or not config["key_configured"]:
        raise HTTPException(400, "The firm administrator must configure the knowledge base and LLM API key before running the risk engine.")
    bridge.invalidate_result(state)
    state.update(step=6, stage="running", run_started_at=datetime.now(timezone.utc).isoformat())
    response = commit_state(db, engagement, state, payload.revision, user, "agent.risk.started")
    tasks.add_task(bridge.execute_run, engagement_id, payload.revision + 1, user.user_id, user.full_name)
    return response


def apply_review(state, payload):
    if state["stage"] not in {"complete", "approved"}:
        raise HTTPException(400, "Complete the risk engine before gate review.")
    originals = {row["key"]: row for row in state["review_rows"]}
    if set(originals) != {row.key for row in payload.rows} or len(payload.rows) != len(originals):
        raise HTTPException(400, "Review must include every generated risk row.")
    state["review_rows"] = [{**originals[row.key], **row.model_dump()} for row in payload.rows]
    state["step"] = 7


@router.post(PREFIX + "/review")
def save_review(engagement_id: str, payload: Review, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, payload.revision)
    if state["stage"] == "approved":
        raise HTTPException(400, "Start a new assessment before changing an approved review.")
    apply_review(state, payload)
    return commit_state(db, engagement, state, payload.revision, user)


@router.post(PREFIX + "/approve")
def approve(engagement_id: str, payload: Review, user: User = Depends(require_roles(*APPROVERS)), db: Session = Depends(get_db)):
    engagement, state = editable(db, engagement_id, user, payload.revision)
    ensure_section_editable(db, engagement_id, "2000")
    if state["stage"] == "approved":
        raise HTTPException(409, "This assessment is already approved.")
    apply_review(state, payload)
    final_rows = [{"mcotabd": row["mcotabd"], "assertion": row["assertion"], "risk": row["risk"],
        "ca": " | ".join(filter(str.strip, row["controls"])), "controls": list(filter(str.strip, row["controls"])),
        "sp": " | ".join(filter(str.strip, row["procedures"])), "procedures": list(filter(str.strip, row["procedures"])),
        "source": row["source"]} for row in state["review_rows"]]
    state["context"]["rcm_rows"] = final_rows
    section = db.query(Section).filter_by(engagement_id=engagement_id, section_code="2000").first()
    if not section:
        raise HTTPException(400, "Section 2000 is missing from this engagement.")
    folder = db.query(Folder).filter_by(engagement_id=engagement_id, section_id=section.section_id,
                                       folder_name="Risk assessment agent", is_deleted=False).first()
    if not folder:
        folder = Folder(folder_id=str(uuid.uuid4()), engagement_id=engagement_id, section_id=section.section_id,
            folder_name="Risk assessment agent", wp_number="2000.RA", depth=1, full_path="2000/Risk assessment agent", created_by=user.user_id)
        db.add(folder)
        db.flush()
    wp_id = str(uuid.uuid4())
    count = db.query(WorkingPaper).filter_by(folder_id=folder.folder_id).count() + 1
    name = f"Risk assessment - {engagement.financial_year} - {count}.json"
    approval = {"approved_by": user.full_name, "approved_by_id": user.user_id,
                "approved_at": datetime.now(timezone.utc).isoformat(), "wp_id": wp_id, "filename": name}
    state.update(stage="approved", approval=approval)
    snapshot = deepcopy(state["context"])
    snapshot.pop("document_paths", None)
    snapshot.update(approval=approval, financials=state["financials"])
    content = json.dumps(snapshot, ensure_ascii=False, indent=2).encode("utf-8")
    path = bridge.storage_root() / engagement_id / "approved" / f"{wp_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    wp = WorkingPaper(wp_id=wp_id, engagement_id=engagement_id, section_id=section.section_id, folder_id=folder.folder_id,
        wp_number=f"2000.RA.{count}", filename=name, file_format="json", file_size_bytes=len(content), file_storage_path=str(path),
        review_status="Draft", prepared_by=user.user_id, prepared_by_name=user.full_name,
        prepared_by_initials=user.initials, prepared_at=datetime.now(timezone.utc), current_version=1)
    db.add(wp)
    db.flush()
    db.add(FileVersion(wp_id=wp_id, version_number=1, filename=name, file_size_bytes=len(content),
        file_storage_path=str(path), uploaded_by=user.user_id, uploaded_by_name=user.full_name, comment="CA gate-approved risk assessment"))
    return commit_state(db, engagement, state, payload.revision, user, "agent.risk.approved")


@router.get(PREFIX + "/export")
def export(engagement_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement = get_engagement_or_404(db, engagement_id, user)
    state = bridge.load_state(db, engagement)
    if state["stage"] != "approved":
        raise HTTPException(400, "Approve the gate review before downloading the final RCM.")
    return JSONResponse(state["context"].get("rcm_rows", []), headers={"Content-Disposition": 'attachment; filename="risk-control-matrix.json"'})


@router.post(PREFIX + "/reset")
def reset(engagement_id: str, payload: Revision, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engagement, _ = editable(db, engagement_id, user, payload.revision, allow_approved=True)
    return commit_state(db, engagement, bridge.initial_state(engagement), payload.revision, user, "agent.risk.reset")
