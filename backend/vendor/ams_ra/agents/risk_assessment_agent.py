"""
AMS — Risk Assessment Agent v2 (KB-First)
KB is dominant. LLM only supplements where KB has no match.
No industry match → warn CA → LLM-only clearly labeled.
"""

from __future__ import annotations
import json
import structlog

from agents.base_agent import BaseAgent
from utils.knowledge_base import (
    kb_exists, match_industry,
    build_rcm_from_kb, get_kb_stats,
)
from utils.materiality import (
    calculate_materiality, identify_mcotabd,
    extract_financials_from_text,
)
from utils.document_parser import parse_document, format_for_llm

logger = structlog.get_logger()


class RiskAssessmentAgent(BaseAgent):

    agent_name = "risk-assessment-agent-v2"
    agent_version = "2.0"

    L1_PROMPT = "l1-universal.md"
    L2_PROMPT = "l2-audit-domain.md"
    SUPPLEMENT_PROMPT = "agents/ra-supplement.md"

    def run(self, context: dict) -> dict:
        """
        Context must contain:
          - engagement_id
          - client_name
          - financial_year
          - legal_status
          - industry
          - products
          - document_paths: list of uploaded financial document paths
          - confirmed_mcotabds: list confirmed by CA (added in Step 4-5)
          - ca_materiality_override: optional float
        """
        self._start_run(context)

        try:
            # ── Step 1: Check KB is loaded ────────────────────
            if not kb_exists():
                return self._fail(
                    context,
                    "Knowledge base not loaded. Ask admin to upload "
                    "Knowledge_base.xlsx in Settings."
                )

            # ── Step 2: Parse financial documents ─────────────
            document_paths = context.get("document_paths", [])
            if not document_paths:
                return self._fail(
                    context, "No financial documents uploaded."
                )

            parsed_docs = [parse_document(p) for p in document_paths]
            document_text, successful, failed = format_for_llm(parsed_docs)

            if not successful:
                return self._fail(
                    context, "All documents failed to parse."
                )

            context["documents_read"] = successful
            context["documents_failed"] = failed

            # ── Step 3: Use materiality already set by UI (Steps 3–4) ──────
            # The CA has already confirmed turnover, total assets, PBT and
            # approved the materiality figure in the Streamlit steps.
            # Do NOT re-extract from text — that path returns 0 for Excel
            # files and would overwrite the correct figures.
            existing_mat = context.get("materiality", {})
            if existing_mat.get("effective_figure"):
                # Already computed and CA-approved — use as-is
                materiality = calculate_materiality(0, 0, 0)
                materiality.ca_approved_figure = existing_mat["effective_figure"]
                logger.info(
                    "agent.materiality.from_context",
                    effective_figure=existing_mat["effective_figure"],
                )
            else:
                # Fallback: extract from text (Word docs path)
                financials = extract_financials_from_text(document_text)
                ca_override = context.get("ca_materiality_override")
                materiality = calculate_materiality(
                    turnover=financials.get("turnover", 0),
                    total_assets=financials.get("total_assets", 0),
                    pbt=financials.get("pbt", 0),
                )
                if ca_override:
                    materiality.ca_approved_figure = ca_override
                context["materiality"] = {
                    "turnover_figure": materiality.turnover_figure,
                    "assets_figure": materiality.assets_figure,
                    "pbt_figure": materiality.pbt_figure,
                    "suggested_figure": materiality.suggested_figure,
                    "suggested_basis": materiality.suggested_basis,
                    "ca_approved_figure": materiality.ca_approved_figure,
                    "effective_figure": materiality.effective_figure,
                }

            # ── Step 5: Use confirmed MCOTABDs from CA ─────────
            confirmed = context.get("confirmed_mcotabds")
            if not confirmed:
                # Return at this point — CA must confirm before proceeding
                context["status"] = "awaiting_mcotabd_confirmation"
                return self._end_run(context, status="success")

            # ── Step 6: Match industry to KB ───────────────────
            user_industry = context.get("industry", "")
            matched_industry, exact_match = match_industry(user_industry)

            if not matched_industry:
                # No KB match — warn CA — LLM-only mode
                context["kb_match"] = {
                    "matched": False,
                    "user_industry": user_industry,
                    "warning": (
                        f"No knowledge base data found for industry: "
                        f"'{user_industry}'. All risks will be generated "
                        f"by LLM only and are not derived from prior "
                        f"audit experience."
                    ),
                }
                llm_rows = self._llm_supplement_all(
                    context, confirmed, user_industry
                )
                context["rcm_rows"] = llm_rows
                context["unmatched_mcotabds"] = confirmed
                context["status"] = "complete_llm_only"
                return self._end_run(context, status="success")

            context["kb_match"] = {
                "matched": True,
                "user_industry": user_industry,
                "matched_industry": matched_industry,
                "exact_match": exact_match,
            }

            # ── Step 7: KB lookup ──────────────────────────────
            kb_rows, unmatched = build_rcm_from_kb(
                confirmed_mcotabds=confirmed,
                matched_industry=matched_industry,
            )

            # ── Step 8: LLM supplement for unmatched ──────────
            llm_rows = []
            if unmatched:
                llm_rows = self._llm_supplement(
                    context, unmatched, user_industry
                )

            all_rows = kb_rows + llm_rows

            context["rcm_rows"] = all_rows
            context["unmatched_mcotabds"] = unmatched
            context["kb_row_count"] = len(kb_rows)
            context["llm_row_count"] = len(llm_rows)
            context["status"] = "complete"

            logger.info(
                "agent.complete",
                kb_rows=len(kb_rows),
                llm_rows=len(llm_rows),
                unmatched=len(unmatched),
            )

            return self._end_run(context, status="success")

        except Exception as e:
            logger.exception("agent.unexpected.error", error=str(e))
            return self._fail(context, f"Unexpected error: {str(e)}")

    # ─────────────────────────────────────────────
    # LLM supplement — only for unmatched MCOTABDs
    # ─────────────────────────────────────────────

    def _llm_supplement(
        self,
        context: dict,
        unmatched: list[str],
        industry: str,
    ) -> list[dict]:
        """
        LLM generates risks only for MCOTABDs with no KB match.
        Uses all four auditor inputs: legal_status, industry,
        products, and auditor_risk_notes for entity-specific output.
        """
        if not unmatched:
            return []

        system_prompt = self.build_system_prompt(
            self.L1_PROMPT, self.L2_PROMPT
        )

        # Auditor risk notes — default message if not provided
        auditor_risk_notes = context.get("auditor_risk_notes", "").strip()
        if not auditor_risk_notes:
            auditor_risk_notes = (
                "No specific risk considerations provided by auditor. "
                "Use industry and entity context to generate relevant risks."
            )

        supplement_template = self.load_prompt(self.SUPPLEMENT_PROMPT)
        user_prompt = (
            supplement_template
            .replace("{unmatched_mcotabds}", ", ".join(unmatched))
            .replace("{industry}", industry)
            .replace("{client_name}", context.get("client_name", ""))
            .replace("{financial_year}", context.get("financial_year", ""))
            .replace("{legal_status}", context.get("legal_status", "Not specified"))
            .replace("{products}", context.get("products", "Not specified"))
            .replace("{auditor_risk_notes}", auditor_risk_notes)
        )

        logger.info(
            "llm.supplement.start",
            unmatched=unmatched,
            has_auditor_notes=bool(context.get("auditor_risk_notes")),
        )

        try:
            raw = self.llm.complete_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=4096,
            )
            if isinstance(raw, list):
                for row in raw:
                    row["source"] = "llm_generated"
                return raw
            return []
        except Exception as e:
            logger.error("llm.supplement.failed", error=str(e))
            return []

    def _llm_supplement_all(
        self,
        context: dict,
        mcotabds: list[str],
        industry: str,
    ) -> list[dict]:
        """Full LLM generation when no KB industry match exists."""
        return self._llm_supplement(context, mcotabds, industry)
