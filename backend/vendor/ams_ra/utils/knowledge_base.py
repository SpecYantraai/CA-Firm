"""
AMS — Knowledge Base Utility
Loads the permanent knowledge base uploaded by admin.
Searches by industry + MCOTABD.
KB is dominant — LLM only supplements where KB has no match.
"""

from __future__ import annotations
import os
from pathlib import Path
from collections import defaultdict
import structlog

logger = structlog.get_logger()

KB_PATH = Path(__file__).parent.parent / "data" / "knowledge_base.xlsx"


# ─────────────────────────────────────────────
# KB Status
# ─────────────────────────────────────────────

def kb_exists() -> bool:
    return KB_PATH.exists() and KB_PATH.stat().st_size > 0


def save_kb(file_bytes: bytes) -> dict:
    """Save uploaded KB file to permanent location."""
    try:
        KB_PATH.parent.mkdir(parents=True, exist_ok=True)
        KB_PATH.write_bytes(file_bytes)
        stats = get_kb_stats()
        logger.info("kb.saved", path=str(KB_PATH), **stats)
        return {"success": True, **stats}
    except Exception as e:
        logger.error("kb.save.failed", error=str(e))
        return {"success": False, "error": str(e)}


def get_kb_stats() -> dict:
    """Return summary stats about the loaded KB."""
    if not kb_exists():
        return {"loaded": False}
    try:
        rows, industries, mcotabds, entities = _load_raw()
        return {
            "loaded": True,
            "total_rows": len(rows),
            "industries": sorted(industries),
            "mcotabds": sorted(mcotabds),
            "entities": sorted(entities),
            "file_size_kb": round(KB_PATH.stat().st_size / 1024, 1),
        }
    except Exception as e:
        return {"loaded": False, "error": str(e)}


# ─────────────────────────────────────────────
# Raw loader
# ─────────────────────────────────────────────

def _load_raw() -> tuple[list, set, set, set]:
    """Load KB rows, return (rows, industries, mcotabds, entities)."""
    import openpyxl
    wb = openpyxl.load_workbook(KB_PATH, data_only=True)
    ws = wb['Data']

    rows = []
    industries = set()
    mcotabds = set()
    entities = set()

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i < 4:
            continue
        if not any(c is not None for c in row):
            continue

        entity = str(row[1] or '').strip()
        industry = str(row[3] or '').strip()
        mcotabd = str(row[6] or '').strip()
        assertion = str(row[7] or '').strip()
        risk_code = str(row[8] or '').strip()
        risk = str(row[9] or '').strip()
        risk_type = str(row[10] or '').strip()
        ca_code = str(row[11] or '').strip()
        ca = str(row[12] or '').strip()
        sp_code = str(row[14] or '').strip()
        sp = str(row[15] or '').strip()

        if not mcotabd:
            continue

        rows.append({
            'entity': entity,
            'industry': industry,
            'mcotabd': mcotabd,
            'assertion': assertion,
            'risk_code': risk_code,
            'risk': risk,
            'risk_type': risk_type,
            'ca_code': ca_code,
            'ca': ca,
            'sp_code': sp_code,
            'sp': sp,
        })

        if industry:
            industries.add(industry)
        if mcotabd:
            mcotabds.add(mcotabd)
        if entity:
            entities.add(entity)

    return rows, industries, mcotabds, entities


# ─────────────────────────────────────────────
# Industry matching
# ─────────────────────────────────────────────

def match_industry(user_industry: str) -> tuple[str | None, bool]:
    """
    Try to match user's industry input to KB industries.
    Returns (matched_industry, exact_match).
    Returns (None, False) if no match.
    """
    if not kb_exists():
        return None, False

    rows, industries, _, _ = _load_raw()

    user_lower = user_industry.lower()

    # Exact match first
    for ind in industries:
        if user_lower == ind.lower():
            return ind, True

    # Keyword match
    keyword_map = {
        'manufacturing': ['manufacturing'],
        'trading': ['trading', 'wholesale', 'retail'],
        'service': ['service'],
        'fmcg': ['manufacturing', 'trading'],
        'hospitality': [],
        'banking': [],
        'insurance': [],
        'logistics': [],
        'construction': [],
    }

    for keyword, kb_keywords in keyword_map.items():
        if keyword in user_lower and kb_keywords:
            for ind in industries:
                if any(kw in ind.lower() for kw in kb_keywords):
                    logger.info("kb.industry.partial_match",
                                user=user_industry, matched=ind)
                    return ind, False

    logger.warning("kb.industry.no_match", user=user_industry,
                   available=list(industries))
    return None, False


# ─────────────────────────────────────────────
# MCOTABD lookup
# ─────────────────────────────────────────────

def get_mcotabds_for_industry(industry: str) -> list[str]:
    """Return all MCOTABDs available for a given industry."""
    if not kb_exists():
        return []
    rows, _, _, _ = _load_raw()
    mcotabds = set()
    for row in rows:
        if industry.lower() in row['industry'].lower():
            mcotabds.add(row['mcotabd'])
    return sorted(mcotabds)


def search_kb(
    mcotabd: str,
    matched_industry: str,
) -> list[dict]:
    """
    Search KB for matching MCOTABD in given industry.
    Returns list of risk/CA/SP rows.
    Empty list = no KB match = LLM must supplement.
    """
    if not kb_exists():
        return []

    rows, _, _, _ = _load_raw()

    results = []
    for row in rows:
        industry_match = matched_industry.lower() in row['industry'].lower()
        mcotabd_match = row['mcotabd'].lower() == mcotabd.lower()
        if industry_match and mcotabd_match:
            results.append(row)

    logger.info("kb.search",
                mcotabd=mcotabd,
                industry=matched_industry,
                results=len(results))
    return results


def build_rcm_from_kb(
    confirmed_mcotabds: list[str],
    matched_industry: str,
) -> tuple[list[dict], list[str]]:
    """
    Build RCM rows from KB for all confirmed MCOTABDs.
    Returns:
        (kb_rows, unmatched_mcotabds)
        unmatched_mcotabds = MCOTABDs with no KB data → LLM must cover
    """
    all_rows = []
    unmatched = []

    for mcotabd in confirmed_mcotabds:
        kb_results = search_kb(mcotabd, matched_industry)
        if kb_results:
            for row in kb_results:
                row['source'] = 'knowledge_base'
                row['mcotabd_confirmed'] = mcotabd
            all_rows.extend(kb_results)
        else:
            unmatched.append(mcotabd)
            logger.warning("kb.no_match", mcotabd=mcotabd,
                           industry=matched_industry)

    return all_rows, unmatched
