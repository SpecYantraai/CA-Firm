"""
AMS — BaseAgent
Every agent extends this. Accept context, enrich it, return it.
Never write to AMS without CA gate approval.
"""

from __future__ import annotations
import uuid
import time
from abc import ABC, abstractmethod
from pathlib import Path
from datetime import datetime, timezone
import structlog

logger = structlog.get_logger()

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class BaseAgent(ABC):

    agent_name: str = "base"
    agent_version: str = "1.0"

    def __init__(self, llm_client):
        self.llm = llm_client
        self._run_id = str(uuid.uuid4())
        self._started_at: datetime | None = None
        self._log = logger.bind(agent=self.agent_name, run_id=self._run_id)

    @abstractmethod
    def run(self, context: dict) -> dict:
        """Accept context. Enrich it. Return it. Never store state locally."""

    def load_prompt(self, prompt_path: str) -> str:
        full_path = PROMPTS_DIR / prompt_path
        if not full_path.exists():
            raise FileNotFoundError(f"Prompt not found: {full_path}")
        content = full_path.read_text(encoding="utf-8")
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                return parts[2].strip()
        return content.strip()

    def get_prompt_version(self, prompt_path: str) -> str:
        full_path = PROMPTS_DIR / prompt_path
        if not full_path.exists():
            return "unknown"
        content = full_path.read_text(encoding="utf-8")
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                for line in parts[1].split("\n"):
                    if line.startswith("version:"):
                        return line.split(":", 1)[1].strip()
        return "1.0"

    def build_system_prompt(self, *prompt_paths: str) -> str:
        layers = [self.load_prompt(p) for p in prompt_paths]
        return "\n\n---\n\n".join(layers)

    def _start_run(self, context: dict) -> None:
        self._started_at = datetime.now(timezone.utc)
        self._log.info("agent.run.start",
                       engagement_id=context.get("engagement_id"))

    def _end_run(self, context: dict, status: str,
                 error: str | None = None) -> dict:
        completed_at = datetime.now(timezone.utc)
        elapsed = round(
            (completed_at - self._started_at).total_seconds(), 2
        )
        run_log_entry = {
            "run_id": self._run_id,
            "engagement_id": context.get("engagement_id"),
            "agent": self.agent_name,
            "agent_version": self.agent_version,
            "started_at": self._started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "elapsed_seconds": elapsed,
            "status": status,
            "error": error,
        }
        if "run_log" not in context:
            context["run_log"] = []
        context["run_log"].append(run_log_entry)

        level = "info" if status == "success" else "error"
        getattr(self._log, level)(
            "agent.run.end", status=status,
            elapsed_seconds=elapsed, error=error,
        )
        return context

    def _fail(self, context: dict, error: str) -> dict:
        if "errors" not in context:
            context["errors"] = []
        context["errors"].append({
            "agent": self.agent_name,
            "run_id": self._run_id,
            "error": error,
        })
        return self._end_run(context, status="failed", error=error)
