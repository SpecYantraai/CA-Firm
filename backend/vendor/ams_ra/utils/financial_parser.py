"""
AMS — Financial Statement Parser
Reads Balance Sheet and P&L directly from Excel cells.

Rules (confirmed from actual BS_PL__Notes_25-26.xlsx):

BS sheet:
- Col B = label, Col C = note ref, Col D = current year value
- Section headers: col D empty AND col C empty → skip (e.g. "EQUITY AND LIABILITIES")
- Parent rows with note ref but no col D value (e.g. "Trade payables", "PPE"):
    → accumulate subsequent sub-item rows (which DO have col D values)
    → sum sub-items and report under parent label
- TOTAL rows (label == "TOTAL" or "TOTAL ASSETS") → skip (used only for total_assets extraction)

P&L sheet:
- Read ALL line items that have a value in col D
- Note refs in col C are present but the notes sheet has NO numeric values
    → do NOT follow notes; read the line item directly from col D
- Turnover = "Revenue from operations" (row 7, note 6.18, col D)
- PBT = "Profit/(loss) before tax" (row 20, col D)
- Skip: "Total Income", "Total Expenses", "Earnings per equity share" section

Column layout (1-based): A=1, B=2, C=3, D=4, E=5
Header row: 4 in both sheets.
Current year: col D only. Col E = prior year — never use.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import re
import structlog
import openpyxl

logger = structlog.get_logger()

COL_PARTICULARS = 2   # B
COL_NOTE_REF   = 3    # C
COL_CURR_YEAR  = 4    # D
HEADER_ROW = 4

BS_SHEET   = "BS"  # resolved at runtime
PL_SHEET   = "P&L"  # resolved at runtime


@dataclass
class LineItem:
    label: str
    value: float        # Absolute value
    raw_value: float    # Signed (for PBT)
    note_ref: str
    source: str         # "BS" | "P&L"
    sheet_name: str
    row_num: int


@dataclass
class FinancialStatements:
    bs_items: list[LineItem] = field(default_factory=list)
    pl_items: list[LineItem] = field(default_factory=list)
    turnover: float = 0.0
    total_assets: float = 0.0
    pbt: float = 0.0
    errors: list[str] = field(default_factory=list)


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_num(ws, row: int, col: int):
    val = ws.cell(row=row, column=col).value
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        try:
            return float(val.replace(",", "").strip())
        except ValueError:
            return None
    return None


def _get_text(ws, row: int, col: int) -> str:
    val = ws.cell(row=row, column=col).value
    return str(val).strip() if val is not None else ""


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())




# ── Sheet name resolver ───────────────────────────────────────────────────────

_BS_ALIASES = {"bs", "balance sheet", "balancesheet", "b/s", "bs sheet"}
_PL_ALIASES = {"p&l", "p&l statement", "profit and loss", "profit & loss",
               "income statement", "pl", "p/l", "p&l_statement"}

def _resolve_sheet(wb, aliases: set) -> str | None:
    """Return the actual sheet name matching one of the aliases (case-insensitive)."""
    for name in wb.sheetnames:
        if name.lower().strip() in aliases:
            return name
    return None

# ── BS parser ────────────────────────────────────────────────────────────────

# Labels that mean this is a TOTAL row — skip for line items, only use for total_assets
_TOTAL_LABELS = {"total", "total assets", "grand total"}

# Labels that are section headers even if they have a note ref
_SECTION_HEADER_LABELS = {
    "equity and liabilities", "assets", "non-current assets",
    "current assets", "non-current liabilities", "current liabilities",
    "shareholders' funds", "shareholders' fund",
}


def _read_bs_items(wb) -> tuple[list[LineItem], float]:
    """
    Read BS line items and total_assets.
    Returns (items, total_assets).
    """
    sheet_name = _resolve_sheet(wb, _BS_ALIASES)
    if sheet_name is None:
        logger.error("financial_parser.bs_sheet_missing", available=wb.sheetnames)
        return [], 0.0

    ws = wb[sheet_name]
    items = []
    total_assets = 0.0

    pending_parent: str | None = None
    pending_note: str = ""
    pending_subs: list[LineItem] = []

    def flush_pending(row_num: int):
        nonlocal pending_parent, pending_note, pending_subs
        if pending_parent and pending_subs:
            total = sum(i.value for i in pending_subs)
            items.append(LineItem(
                label=pending_parent,
                value=total,
                raw_value=total,
                note_ref=pending_note,
                source="BS",
                sheet_name=sheet_name,
                row_num=row_num,
            ))
        pending_parent = None
        pending_note = ""
        pending_subs = []

    for row_num in range(HEADER_ROW + 1, ws.max_row + 1):
        label = _get_text(ws, row_num, COL_PARTICULARS)
        note  = _clean(_get_text(ws, row_num, COL_NOTE_REF))
        raw   = _get_num(ws, row_num, COL_CURR_YEAR)

        if not label:
            flush_pending(row_num)
            continue

        label = _clean(label)
        label_lc = label.lower().strip()

        # TOTAL row — capture total_assets, skip for items
        if label_lc in _TOTAL_LABELS:
            flush_pending(row_num)
            if raw is not None and abs(raw) > 0 and total_assets == 0:
                total_assets = abs(raw)
            continue

        # Section header — no value, no note ref OR known header label
        if label_lc in _SECTION_HEADER_LABELS:
            flush_pending(row_num)
            continue

        if raw is None and not note:
            # Could be a section header OR a parent account without a direct note ref
            # Section headers are in _SECTION_HEADER_LABELS or all-caps
            is_header = (
                label_lc in _SECTION_HEADER_LABELS
                or (label.isupper() and len(label) > 4)
            )
            flush_pending(row_num)
            if not is_header:
                # Treat as potential parent (e.g. "Trade payables")
                # Will only be emitted if sub-items with same-root descriptions follow
                pending_parent = label
                pending_note = ""
                pending_subs = []
            continue

        if raw is None and note:
            # Parent row with note ref but no direct value (e.g. PPE)
            flush_pending(row_num)
            pending_parent = label
            pending_note = note
            pending_subs = []
            continue

        # Row has a numeric value
        abs_val = abs(raw)
        if abs_val < 100:
            continue

        # Decide if this row is a sub-component of the pending parent
        # Sub-components have labels that describe splits/parts of the parent
        # e.g. "Total outstanding dues of micro and small enterprises"
        # Independent items like "Long-term borrowings" are standalone accounts
        _SUB_COMPONENT_KEYWORDS = {"dues", "outstanding dues", "msme",
                                    "micro and small", "creditors other than",
                                    "(i)", "(ii)", "(iii)", "(iv)",
                                    "property, plant", "intangible assets under"}

        is_sub_component = pending_parent and any(
            kw in label_lc for kw in _SUB_COMPONENT_KEYWORDS
        )

        if is_sub_component:
            pending_subs.append(LineItem(
                label=label,
                value=abs_val,
                raw_value=raw,
                note_ref=note,
                source="BS",
                sheet_name=sheet_name,
                row_num=row_num,
            ))
        else:
            # Independent item — flush any pending parent first
            if pending_parent and pending_subs:
                total = sum(i.value for i in pending_subs)
                items.append(LineItem(
                    label=pending_parent,
                    value=total,
                    raw_value=total,
                    note_ref=pending_note,
                    source="BS",
                    sheet_name=sheet_name,
                    row_num=row_num,
                ))
                pending_parent = None
                pending_note = ""
                pending_subs = []
            elif pending_parent and not pending_subs:
                # Parent with no sub-items yet → discard pending, this is independent
                pending_parent = None
                pending_note = ""

            items.append(LineItem(
                label=label,
                value=abs_val,
                raw_value=raw,
                note_ref=note,
                source="BS",
                sheet_name=sheet_name,
                row_num=row_num,
            ))

    flush_pending(ws.max_row + 1)

    logger.info("financial_parser.bs_read", items=len(items), total_assets=total_assets)
    return items, total_assets


# ── P&L parser ───────────────────────────────────────────────────────────────

_TURNOVER_KEYWORDS = {"revenue from operations", "revenue", "turnover",
                      "net revenue", "sales"}
_PBT_KEYWORDS = {"profit before tax", "profit/(loss) before tax",
                 "profit before exceptional", "profit/ (loss) before tax"}
_PL_SKIP_LABELS = {
    "total income", "total expenses", "tax expense:",
    "earnings per equity share:", "see accompanying notes",
    "basic", "diluted",
}


def _read_pl_items(wb) -> tuple[list[LineItem], float, float]:
    """
    Read P&L line items directly from the P&L sheet.
    Returns (items, turnover, pbt).

    Key insight: note refs in col C are present but note sheets have no amounts.
    All values come directly from col D of the P&L sheet.
    """
    pl_sheet_name = _resolve_sheet(wb, _PL_ALIASES)
    if pl_sheet_name is None:
        logger.error("financial_parser.pl_sheet_missing", available=wb.sheetnames)
        return [], 0.0, 0.0

    ws = wb[pl_sheet_name]
    items = []
    turnover = 0.0
    pbt = 0.0

    for row_num in range(HEADER_ROW + 1, ws.max_row + 1):
        label = _get_text(ws, row_num, COL_PARTICULARS)
        if not label:
            continue
        label = _clean(label)
        label_lc = label.lower().strip()

        note  = _clean(_get_text(ws, row_num, COL_NOTE_REF))
        raw   = _get_num(ws, row_num, COL_CURR_YEAR)

        # No value — section header or descriptor row → skip
        if raw is None:
            continue

        abs_val = abs(raw)

        # Capture turnover
        if any(kw in label_lc for kw in _TURNOVER_KEYWORDS):
            if abs_val > turnover:
                turnover = abs_val

        # Capture PBT
        if any(kw in label_lc for kw in _PBT_KEYWORDS):
            pbt = raw  # Signed

        # Skip total/subtotal/EPS rows for MCOTABD candidates
        if label_lc in _PL_SKIP_LABELS:
            continue
        if label_lc.startswith("total "):
            continue

        if abs_val < 100:
            continue

        items.append(LineItem(
            label=label,
            value=abs_val,
            raw_value=raw,
            note_ref=note,
            source="P&L",
            sheet_name=pl_sheet_name,
            row_num=row_num,
        ))

    logger.info("financial_parser.pl_read", items=len(items), turnover=turnover, pbt=pbt)
    return items, turnover, pbt


# ── main entry point ─────────────────────────────────────────────────────────

def parse_financial_statements(file_path) -> FinancialStatements:
    """
    Parse BS and P&L from the financial statements Excel file.
    Returns FinancialStatements with all line items and key figures.
    """
    result = FinancialStatements()

    try:
        wb = openpyxl.load_workbook(str(file_path), data_only=True)
    except Exception as e:
        result.errors.append(f"Failed to open Excel file: {e}")
        logger.error("financial_parser.open_failed", error=str(e))
        return result

    logger.info("financial_parser.sheets", sheets=wb.sheetnames)

    result.bs_items, result.total_assets = _read_bs_items(wb)
    result.pl_items, result.turnover, result.pbt = _read_pl_items(wb)

    # Fallback total_assets from BS item sum if TOTAL row not found
    if result.total_assets == 0 and result.bs_items:
        result.total_assets = sum(i.value for i in result.bs_items) / 2  # assets ≈ liabilities ≈ half of total

    logger.info(
        "financial_parser.complete",
        bs_items=len(result.bs_items),
        pl_items=len(result.pl_items),
        turnover=result.turnover,
        total_assets=result.total_assets,
        pbt=result.pbt,
    )
    return result


# ── MCOTABD candidates ────────────────────────────────────────────────────────

def get_mcotabd_candidates(
    fs: FinancialStatements,
    performance_materiality: float,
) -> list[dict]:
    """
    Compare all BS + P&L line items against performance materiality.
    Returns list of dicts for the MCOTABD confirmation UI.
    """
    candidates = []
    seen: set[str] = set()

    for item in fs.bs_items + fs.pl_items:
        key = item.label.lower().strip()
        if key in seen:
            continue
        seen.add(key)

        candidates.append({
            "account": item.label,
            "value": item.value,
            "source": item.source,
            "note_ref": item.note_ref,
            "above_pm": item.value >= performance_materiality,
        })

    candidates.sort(key=lambda x: (-int(x["above_pm"]), -x["value"]))

    logger.info(
        "financial_parser.mcotabd_candidates",
        total=len(candidates),
        above_pm=sum(1 for c in candidates if c["above_pm"]),
        pm_threshold=performance_materiality,
    )
    return candidates
