"""
AMS — Threshold Engine
Calculates Performance Materiality (PM), TVT, and CTM from an approved materiality figure.

Per ICAI / SA 320 / SA 450:
- Performance Materiality (PM): buffer below overall materiality; typically 60–90%
- Transaction Verification Threshold (TVT): PM ÷ expected transactions in account
- Clearly Trivial Misstatement (CTM): errors below this are not aggregated; typically ≤5% of M
- Materiality is rounded to nearest 1,000

CA can override PM% and CTM% — agent only suggests, CA decides.
"""

from __future__ import annotations
from dataclasses import dataclass
import math
import structlog

logger = structlog.get_logger()

# Agent defaults (CA can change)
DEFAULT_PM_PCT = 75.0        # % of overall materiality
DEFAULT_CTM_PCT = 5.0        # % of overall materiality
MIN_PM_PCT = 60.0
MAX_PM_PCT = 90.0


def round_to_nearest_thousand(value: float) -> float:
    """Round to nearest 1,000. e.g. 13,47,832 → 13,48,000"""
    return round(value / 1000) * 1000


@dataclass
class ThresholdResult:
    # Inputs
    raw_materiality: float          # Before rounding
    rounded_materiality: float      # Rounded to nearest 1,000
    pm_pct: float                   # % applied (agent suggestion or CA override)
    ctm_pct: float                  # % applied for CTM

    # Outputs
    performance_materiality: float  # PM = rounded_materiality × pm_pct / 100
    ctm: float                      # CTM = rounded_materiality × ctm_pct / 100

    # TVT — per account (populated separately via calculate_tvt)
    tvt_per_account: dict[str, float] | None = None

    # Justifications
    pm_justification: str = ""
    materiality_justification: str = ""

    @property
    def pm_display(self) -> str:
        return f"₹{self.performance_materiality:,.0f}"

    @property
    def ctm_display(self) -> str:
        return f"₹{self.ctm:,.0f}"

    @property
    def materiality_display(self) -> str:
        return f"₹{self.rounded_materiality:,.0f}"


def calculate_thresholds(
    raw_materiality: float,
    pm_pct: float | None = None,
    ctm_pct: float | None = None,
    pm_justification: str = "",
    materiality_justification: str = "",
) -> ThresholdResult:
    """
    Calculate PM and CTM from materiality.

    Args:
        raw_materiality: CA-approved materiality figure (unrounded)
        pm_pct: CA-chosen PM % (default: 75%)
        ctm_pct: CA-chosen CTM % (default: 5%)
        pm_justification: text reason for PM%
        materiality_justification: text reason for benchmark/% choice

    Returns ThresholdResult with all computed values.
    """
    if pm_pct is None:
        pm_pct = DEFAULT_PM_PCT
    if ctm_pct is None:
        ctm_pct = DEFAULT_CTM_PCT

    # Clamp PM% to valid range
    pm_pct = max(MIN_PM_PCT, min(MAX_PM_PCT, pm_pct))

    rounded_mat = round_to_nearest_thousand(raw_materiality)
    pm = round(rounded_mat * pm_pct / 100, 0)
    ctm = round(rounded_mat * ctm_pct / 100, 0)

    result = ThresholdResult(
        raw_materiality=raw_materiality,
        rounded_materiality=rounded_mat,
        pm_pct=pm_pct,
        ctm_pct=ctm_pct,
        performance_materiality=pm,
        ctm=ctm,
        pm_justification=pm_justification,
        materiality_justification=materiality_justification,
    )

    logger.info(
        "thresholds.calculated",
        raw_mat=raw_materiality,
        rounded_mat=rounded_mat,
        pm=pm,
        pm_pct=pm_pct,
        ctm=ctm,
    )

    return result


def calculate_tvt(
    performance_materiality: float,
    expected_transactions: int,
) -> float:
    """
    Calculate Transaction Verification Threshold for one account.

    TVT = PM ÷ expected transaction count in that account.

    e.g. PM = ₹12,00,000 ÷ 12 transactions = ₹1,00,000 per transaction.
    """
    if expected_transactions <= 0:
        return performance_materiality  # Fall back to PM if no transaction count

    tvt = round(performance_materiality / expected_transactions, 0)

    logger.info(
        "thresholds.tvt",
        pm=performance_materiality,
        transactions=expected_transactions,
        tvt=tvt,
    )

    return tvt
