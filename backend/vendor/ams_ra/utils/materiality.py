"""
AMS — Materiality Calculation Engine
3-basis calculation per ICAI practice.
Conservative approach — picks lowest of the three.
CA can choose any benchmark and set a custom % — not locked to defaults.
"""

from __future__ import annotations
from dataclasses import dataclass
import structlog

logger = structlog.get_logger()

FLOOR_INR = 500_000  # ₹5 lakhs absolute floor

# Default percentages (CA can override)
DEFAULT_TURNOVER_PCT = 0.5
DEFAULT_ASSETS_PCT   = 1.0
DEFAULT_PBT_PCT      = 5.0

# Valid benchmarks CA can choose from
BENCHMARK_OPTIONS = [
    "0.5% of Turnover",
    "1% of Total Assets",
    "5% of Profit Before Tax",
    "Custom",
]


@dataclass
class MaterialityResult:
    turnover_basis: float
    turnover_figure: float
    assets_basis: float
    assets_figure: float
    pbt_basis: float
    pbt_figure: float
    suggested_figure: float
    suggested_basis: str
    ca_approved_figure: float | None = None
    # CA customisation fields
    ca_chosen_benchmark: str | None = None    # Which benchmark CA selected
    ca_chosen_pct: float | None = None        # Custom % CA entered
    ca_justification: str = ""                # CA's reason for the choice

    @property
    def effective_figure(self) -> float:
        return self.ca_approved_figure or self.suggested_figure


@dataclass
class MCOTABDItem:
    account: str
    value: float
    included: bool
    reason: str
    elevated_risk_flag: bool = False
    flag_reason: str = ""


# ─────────────────────────────────────────────
# Materiality calculation
# ─────────────────────────────────────────────

ELEVATED_RISK_ACCOUNTS = {
    'related party', 'rp', 'director', 'loan to director',
    'statutory payable', 'statutory payables', 'tax payable',
    'provisions', 'contingent', 'equity', 'share capital',
}

ALWAYS_INCLUDE_KEYWORDS = {
    'related party', 'rp', 'director loan', 'statutory',
    'provision', 'contingent liability',
}


def calculate_materiality_flexible(
    turnover: float,
    total_assets: float,
    pbt: float,
    ca_benchmark: str | None = None,
    ca_pct: float | None = None,
    ca_justification: str = "",
) -> MaterialityResult:
    """
    Calculate materiality with CA-controlled benchmark and percentage.

    If ca_benchmark is provided and ca_pct is provided:
    - Use exactly that benchmark × that %
    - Ignore the system suggestion

    Otherwise:
    - Calculate all three bases, suggest the lowest (conservative)
    - CA can still override the final figure

    Args:
        turnover: Turnover / Revenue from operations
        total_assets: Total assets from BS
        pbt: Profit before tax (can be negative)
        ca_benchmark: "Turnover" | "Total Assets" | "Profit Before Tax" | None
        ca_pct: Custom % to apply (e.g. 0.75 for 0.75%)
        ca_justification: CA's reason for the choice
    """
    # Always calculate all three for display
    t_pct  = ca_pct if (ca_benchmark == "Turnover" and ca_pct) else DEFAULT_TURNOVER_PCT
    a_pct  = ca_pct if (ca_benchmark == "Total Assets" and ca_pct) else DEFAULT_ASSETS_PCT
    pb_pct = ca_pct if (ca_benchmark == "Profit Before Tax" and ca_pct) else DEFAULT_PBT_PCT

    turnover_figure = round(turnover * t_pct / 100, 0)
    assets_figure   = round(total_assets * a_pct / 100, 0)

    if pbt > 0:
        pbt_figure = round(pbt * pb_pct / 100, 0)
    else:
        pbt_figure = float('inf')

    # Determine suggested basis and figure
    if ca_benchmark and ca_pct:
        # CA has chosen explicitly
        benchmark_map = {
            "Turnover": (turnover_figure, f"{ca_pct}% of Turnover"),
            "Total Assets": (assets_figure, f"{ca_pct}% of Total Assets"),
            "Profit Before Tax": (pbt_figure if pbt > 0 else 0, f"{ca_pct}% of Profit Before Tax"),
        }
        fig, basis = benchmark_map.get(ca_benchmark, (0, ca_benchmark))
        suggested_figure = max(fig, FLOOR_INR)
        suggested_basis  = basis
    else:
        # System suggestion — lowest of three (conservative)
        candidates = {"0.5% of Turnover": turnover_figure, "1% of Total Assets": assets_figure}
        if pbt > 0:
            candidates["5% of Profit Before Tax"] = pbt_figure
        suggested_basis  = min(candidates, key=candidates.get)
        suggested_figure = max(candidates[suggested_basis], FLOOR_INR)

    result = MaterialityResult(
        turnover_basis=t_pct,
        turnover_figure=turnover_figure,
        assets_basis=a_pct,
        assets_figure=assets_figure,
        pbt_basis=pb_pct,
        pbt_figure=pbt_figure if pbt > 0 else 0,
        suggested_figure=suggested_figure,
        suggested_basis=suggested_basis,
        ca_chosen_benchmark=ca_benchmark,
        ca_chosen_pct=ca_pct,
        ca_justification=ca_justification,
    )

    logger.info(
        "materiality.calculated_flexible",
        turnover_figure=turnover_figure,
        assets_figure=assets_figure,
        pbt_figure=pbt_figure if pbt > 0 else "N/A (loss)",
        ca_benchmark=ca_benchmark,
        ca_pct=ca_pct,
        suggested=suggested_figure,
        basis=suggested_basis,
    )

    return result


def calculate_materiality(
    turnover: float,
    total_assets: float,
    pbt: float,
) -> MaterialityResult:
    """
    Calculate materiality using 3 bases.
    Pick lowest as suggested figure (conservative — ICAI practice).
    """
    turnover_figure = round(turnover * 0.005, 0)   # 0.5% of turnover
    assets_figure = round(total_assets * 0.01, 0)  # 1% of total assets

    # PBT basis — only meaningful if PBT is positive
    if pbt > 0:
        pbt_figure = round(pbt * 0.05, 0)           # 5% of PBT
    else:
        pbt_figure = float('inf')  # exclude if loss

    # Conservative — pick lowest, subject to floor
    candidates = {
        '0.5% of Turnover': turnover_figure,
        '1% of Total Assets': assets_figure,
    }
    if pbt > 0:
        candidates['5% of Profit Before Tax'] = pbt_figure

    suggested_basis = min(candidates, key=candidates.get)
    suggested_figure = max(candidates[suggested_basis], FLOOR_INR)

    result = MaterialityResult(
        turnover_basis=0.5,
        turnover_figure=turnover_figure,
        assets_basis=1.0,
        assets_figure=assets_figure,
        pbt_basis=5.0,
        pbt_figure=pbt_figure if pbt > 0 else 0,
        suggested_figure=suggested_figure,
        suggested_basis=suggested_basis,
    )

    logger.info(
        "materiality.calculated",
        turnover_figure=turnover_figure,
        assets_figure=assets_figure,
        pbt_figure=pbt_figure if pbt > 0 else "N/A (loss)",
        suggested=suggested_figure,
        basis=suggested_basis,
    )

    return result


# ─────────────────────────────────────────────
# MCOTABD identification
# ─────────────────────────────────────────────

def identify_mcotabd(
    accounts: dict[str, float],
    materiality: MaterialityResult,
) -> list[MCOTABDItem]:
    """
    Identify MCOTABD from extracted account balances.
    Returns list with included flag and reason.
    """
    threshold = materiality.effective_figure
    items = []

    for account, value in accounts.items():
        account_lower = account.lower()

        # Check if always include regardless of threshold
        always_include = any(
            kw in account_lower for kw in ALWAYS_INCLUDE_KEYWORDS
        )

        # Check if elevated risk even if below threshold
        elevated = any(
            kw in account_lower for kw in ELEVATED_RISK_ACCOUNTS
        )

        if value >= threshold:
            items.append(MCOTABDItem(
                account=account,
                value=value,
                included=True,
                reason=f"Above materiality threshold of ₹{threshold:,.0f}",
                elevated_risk_flag=elevated,
                flag_reason="Elevated risk account" if elevated else "",
            ))
        elif always_include:
            items.append(MCOTABDItem(
                account=account,
                value=value,
                included=True,
                reason="Included regardless of value — always-include account",
                elevated_risk_flag=True,
                flag_reason="Always included — related party / statutory / provision",
            ))
        elif elevated:
            items.append(MCOTABDItem(
                account=account,
                value=value,
                included=False,
                reason=f"Below threshold ₹{threshold:,.0f} — flagged for CA review",
                elevated_risk_flag=True,
                flag_reason="Elevated risk despite below materiality",
            ))
        else:
            items.append(MCOTABDItem(
                account=account,
                value=value,
                included=False,
                reason=f"Below materiality threshold of ₹{threshold:,.0f}",
            ))

    # Sort — included first, then by value descending
    items.sort(key=lambda x: (-int(x.included), -x.value))

    logger.info(
        "mcotabd.identified",
        total=len(items),
        included=sum(1 for i in items if i.included),
        flagged=sum(1 for i in items if i.elevated_risk_flag),
    )

    return items


def extract_financials_from_text(text: str) -> dict:
    """
    Best-effort extraction of key financial figures from parsed text.
    Returns dict with turnover, total_assets, pbt, and account balances.
    """
    import re

    lines = text.split('\n')
    accounts = {}
    turnover = 0.0
    total_assets = 0.0
    pbt = 0.0

    revenue_keywords = ['revenue', 'turnover', 'sales', 'income from operations']
    asset_keywords = ['total assets', 'fixed assets', 'inventory',
                      'trade debtors', 'receivables', 'cash', 'bank',
                      'loans', 'advances', 'deposits', 'investments',
                      'prepaid', 'capital work']
    liability_keywords = ['trade payables', 'payables', 'creditors',
                          'borrowings', 'debt', 'statutory', 'provisions',
                          'equity', 'capital', 'reserves']
    expense_keywords = ['purchases', 'cost of goods', 'expenses',
                        'depreciation', 'payroll', 'salary', 'rent',
                        'advertisement', 'selling', 'administrative']
    pbt_keywords = ['profit before tax', 'pbt', 'profit before taxation',
                    'net profit before']

    for line in lines:
        line_lower = line.lower()
        # Extract number from line
        numbers = re.findall(r'[\d,]+\.?\d*', line.replace(' ', ''))
        if not numbers:
            continue
        try:
            value = float(numbers[-1].replace(',', ''))
        except Exception:
            continue

        if value < 1000:
            continue

        matched_account = None
        for kw in revenue_keywords:
            if kw in line_lower:
                if value > turnover:
                    turnover = value
                matched_account = 'Revenue'
                break

        if not matched_account:
            for kw in pbt_keywords:
                if kw in line_lower:
                    pbt = value
                    matched_account = 'Profit Before Tax'
                    break

        if not matched_account:
            for kw in asset_keywords + liability_keywords + expense_keywords:
                if kw in line_lower:
                    # Clean account name
                    account_name = line.split('|')[0].strip()
                    account_name = re.sub(r'\d', '', account_name).strip()
                    account_name = account_name[:40].strip()
                    if account_name:
                        matched_account = account_name
                        accounts[matched_account] = max(
                            accounts.get(matched_account, 0), value
                        )
                    break

    # Estimate total assets if not found directly
    if not total_assets and accounts:
        total_assets = sum(
            v for k, v in accounts.items()
            if any(kw in k.lower() for kw in
                   ['asset', 'fixed', 'inventory', 'receivable',
                    'cash', 'loan', 'advance', 'deposit', 'investment'])
        ) or max(accounts.values(), default=0)

    logger.info(
        "financials.extracted",
        turnover=turnover,
        total_assets=total_assets,
        pbt=pbt,
        accounts_found=len(accounts),
    )

    return {
        'turnover': turnover,
        'total_assets': total_assets,
        'pbt': pbt,
        'accounts': accounts,
    }
