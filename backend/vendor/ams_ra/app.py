"""
AMS — Risk Assessment Agent POC v3
Fixed per CA Govind feedback:
- Issue 1: Financial figures extracted via direct cell-level parser (not text scanning)
           Materiality: CA can choose benchmark + % + justification
- Issue 2: Step 3B — Thresholds (PM, TVT, CTM) with rounding to nearest 1000
- Issue 3: MCOTABD identification uses PM threshold and real line items from BS/P&L
- Issue 4: Risk display groups controls per risk row; gate review has inline editing;
           every confirmed MCOTABD gets a risk assessment
"""

import streamlit as st
import tempfile, os, json
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed; env vars must be set manually

st.set_page_config(
    page_title="AMS — Risk Assessment Agent",
    page_icon="📋",
    layout="wide",
    initial_sidebar_state="expanded",
)

from llm.client import LLMClient
from agents.risk_assessment_agent import RiskAssessmentAgent
from utils.knowledge_base import kb_exists, save_kb, get_kb_stats, match_industry
from utils.materiality import (
    calculate_materiality, calculate_materiality_flexible,
    identify_mcotabd, extract_financials_from_text, MaterialityResult,
    BENCHMARK_OPTIONS,
)
from utils.thresholds import calculate_thresholds, calculate_tvt, DEFAULT_PM_PCT
from utils.document_parser import parse_document, format_for_llm
from utils.financial_parser import parse_financial_statements, get_mcotabd_candidates

# ── Session state init ────────────────────────────────────────
defaults = {
    "page": "agent",
    "step": 1,
    "context": {},
    "financials": {},
    "parsed_fs": None,          # FinancialStatements object
    "mcotabd_items": [],
    "confirmed_mcotabds": [],
    "thresholds": None,
    "agent_complete": False,
    "gate_approved": False,
    "materiality_override": None,
    "rcm_edits": {},            # {row_key: edited_row} for gate editing
}
for k, v in defaults.items():
    if k not in st.session_state:
        st.session_state[k] = v

# ── Sidebar ───────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## AMS")
    st.markdown("**Risk Assessment Agent**")
    st.divider()

    kb_stats = get_kb_stats()
    if kb_stats.get("loaded"):
        st.success(f"✅ KB Loaded")
        st.caption(f"{kb_stats['total_rows']:,} rows · {len(kb_stats['mcotabds'])} MCOTABDs")
        st.caption(f"File: {kb_stats['file_size_kb']} KB")
    else:
        st.error("⚠️ KB not loaded")
        st.caption("Go to Settings to upload")

    st.divider()
    col1, col2 = st.columns(2)
    with col1:
        if st.button("📋 Agent", use_container_width=True):
            st.session_state.page = "agent"
    with col2:
        if st.button("⚙️ Settings", use_container_width=True):
            st.session_state.page = "settings"

    st.divider()
    st.caption("KB First · LLM Supplements · CA Sovereign")

# ═══════════════════════════════════════════════════════════════
# SETTINGS PAGE
# ═══════════════════════════════════════════════════════════════

if st.session_state.page == "settings":
    st.title("Settings")
    st.caption("Admin configuration — knowledge base management")
    st.divider()

    st.subheader("Knowledge Base")
    st.caption(
        "Upload the firm's Knowledge_base.xlsx once. "
        "The system will use it for all future engagements."
    )

    if kb_stats.get("loaded"):
        st.success("Knowledge base is loaded and active.")
        c1, c2, c3 = st.columns(3)
        c1.metric("Total rows", f"{kb_stats['total_rows']:,}")
        c2.metric("MCOTABDs", len(kb_stats['mcotabds']))
        c3.metric("Entities", len(kb_stats['entities']))

        with st.expander("View industries in KB"):
            for ind in kb_stats['industries']:
                st.caption(f"• {ind}")

        with st.expander("View MCOTABDs in KB"):
            cols = st.columns(3)
            for i, m in enumerate(kb_stats['mcotabds']):
                cols[i % 3].caption(f"• {m}")

    kb_file = st.file_uploader(
        "Upload Knowledge_base.xlsx",
        type=["xlsx"],
        key="kb_upload",
    )

    if kb_file:
        if st.button("Save Knowledge Base", type="primary"):
            result = save_kb(kb_file.getvalue())
            if result.get("success"):
                st.success(
                    f"✅ Knowledge base saved — "
                    f"{result['total_rows']:,} rows loaded."
                )
                st.rerun()
            else:
                st.error(f"Failed: {result.get('error')}")

    st.divider()
    st.subheader("LLM Configuration")

    provider = os.environ.get("LLM_PROVIDER", "nvidia")
    model = os.environ.get("LLM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")

    provider_info = {
        "nvidia": {
            "label": "NVIDIA Nemotron ⭐ Default",
            "color": "success",
            "key_env": "NVIDIA_API_KEY",
            "key_url": "https://build.nvidia.com/",
            "models": [
                "nvidia/nemotron-3.5-lightning-30b-a3b",
                "nvidia/llama-3.1-nemotron-70b-instruct",
                "nvidia/llama-3.1-nemotron-51b-instruct",
                "meta/llama-3.1-405b-instruct",
                "meta/llama-3.1-70b-instruct",
            ],
        },
        "anthropic": {
            "label": "Anthropic Claude",
            "color": "info",
            "key_env": "ANTHROPIC_API_KEY",
            "key_url": "https://console.anthropic.com/",
            "models": ["claude-sonnet-4-6", "claude-opus-4", "claude-haiku-4-5-20251001"],
        },
        "openai": {
            "label": "OpenAI GPT",
            "color": "info",
            "key_env": "OPENAI_API_KEY",
            "key_url": "https://platform.openai.com/",
            "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        },
    }

    info = provider_info.get(provider, provider_info["nvidia"])

    pc1, pc2 = st.columns(2)
    with pc1:
        st.metric("Active Provider", info["label"])
    with pc2:
        st.metric("Active Model", model.split("/")[-1])

    key_set = bool(os.environ.get(info["key_env"]))
    if key_set:
        st.success(f"✅ {info['key_env']} is set")
    else:
        st.error(
            f"❌ {info['key_env']} not set. "
            f"Get your key at: {info['key_url']}"
        )

    with st.expander("How to change provider"):
        st.code(
            "# In your .env file:\n"
            "LLM_PROVIDER=nvidia          # nvidia | anthropic | openai\n"
            "NVIDIA_API_KEY=your_key      # from build.nvidia.com\n"
            "LLM_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b",
            language="bash"
        )
        st.caption("Restart the app after changing .env")


# ═══════════════════════════════════════════════════════════════
# AGENT PAGE
# ═══════════════════════════════════════════════════════════════

else:
    st.title("Risk Assessment Agent")
    st.caption("KB-first risk assessment · LLM supplements gaps · CA approves at gate")

    if not kb_stats.get("loaded"):
        st.warning("Knowledge base not loaded. Go to Settings to upload Knowledge_base.xlsx first.")

    st.divider()

    # ── Step progress bar ─────────────────────────────────────
    steps = ["Engagement", "Financials", "Materiality", "Thresholds", "MCOTABD", "Risk Engine", "Gate Review"]
    step_cols = st.columns(7)
    for i, (col, label) in enumerate(zip(step_cols, steps), 1):
        with col:
            if i < st.session_state.step:
                st.success(f"✅ {label}")
            elif i == st.session_state.step:
                st.info(f"▶ {label}")
            else:
                st.caption(f"○ {label}")

    st.divider()

    # ════════════════════════════════
    # STEP 1 — ENGAGEMENT DETAILS
    # ════════════════════════════════
    if st.session_state.step == 1:
        st.subheader("Step 1 — Engagement Details")

        c1, c2 = st.columns(2)
        with c1:
            client_name = st.text_input("Client name *", placeholder="e.g. George Infra Pvt Ltd")
            financial_year = st.text_input("Financial year *", placeholder="e.g. 2024-25")
        with c2:
            legal_status = st.selectbox("Legal status *", [
                "Private Limited Company", "Public Limited Company",
                "LLP", "Partnership Firm", "Proprietorship", "Other"
            ])
            client_type = st.selectbox("Client type", ["New client", "Repeat client"])

        industry = st.text_input(
            "Industry *",
            placeholder="e.g. Manufacturing, Trading, Services, Hospitality, Banking"
        )
        products = st.text_area(
            "Products / Services",
            placeholder="e.g. PPGI sheets, metal pipes, hardware products",
            height=80,
        )

        st.divider()
        st.markdown("**Specific Risk Considerations** *(optional but recommended)*")
        st.caption(
            "Share anything you already know about this engagement — "
            "fraud concerns, management quality, key business risks, "
            "regulatory issues, related party concerns, prior year observations, "
            "or anything else the agent should factor into the risk assessment."
        )
        auditor_risk_notes = st.text_area(
            "Auditor's risk considerations",
            placeholder=(
                "e.g. Management has changed recently and internal controls appear weak. "
                "There are significant related party transactions with group companies. "
                "The entity has been loss-making for 2 consecutive years..."
            ),
            height=140,
            label_visibility="collapsed",
        )

        if industry and kb_stats.get("loaded"):
            matched, exact = match_industry(industry)
            if matched:
                if exact:
                    st.success(f"✅ KB match: **{matched}**")
                else:
                    st.info(f"ℹ️ Partial KB match: **{matched}**")
            else:
                st.warning(
                    f"⚠️ No KB match for '{industry}'. "
                    "All risks will be LLM-generated and clearly labeled."
                )

        if st.button("Next →", type="primary",
                     disabled=not (client_name and financial_year and industry)):
            st.session_state.context.update({
                "client_name": client_name,
                "financial_year": financial_year,
                "legal_status": legal_status,
                "client_type": client_type,
                "industry": industry,
                "products": products,
                "auditor_risk_notes": auditor_risk_notes,
                "engagement_id": f"ENG-{client_name[:3].upper()}-{financial_year}",
            })
            st.session_state.step = 2
            st.rerun()

    # ════════════════════════════════
    # STEP 2 — UPLOAD FINANCIALS
    # ════════════════════════════════
    elif st.session_state.step == 2:
        st.subheader("Step 2 — Upload Financial Statements")
        st.caption("Upload the financial statements Excel file (Balance Sheet + P&L)")

        uploaded = st.file_uploader(
            "Financial statements",
            type=["xlsx", "xls", "docx", "doc"],
            accept_multiple_files=True,
            label_visibility="collapsed",
        )

        if uploaded:
            st.success(f"{len(uploaded)} file(s) uploaded")
            for f in uploaded:
                st.caption(f"📄 {f.name} — {round(f.size/1024, 1)} KB")

        c1, c2 = st.columns(2)
        with c1:
            if st.button("← Back"):
                st.session_state.step = 1
                st.rerun()
        with c2:
            if st.button("Next →", type="primary", disabled=not uploaded):
                temp_dir = tempfile.mkdtemp()
                paths = []
                fs_result = None

                for f in uploaded:
                    p = os.path.join(temp_dir, f.name)
                    with open(p, "wb") as out:
                        out.write(f.getvalue())
                    paths.append(p)

                    # Try structured financial parser on Excel files
                    if f.name.lower().endswith((".xlsx", ".xls")) and fs_result is None:
                        with st.spinner(f"Reading {f.name}..."):
                            fs_result = parse_financial_statements(p)

                # Fallback: text-based extraction for Word docs
                parsed = [parse_document(p) for p in paths]
                text, successful, failed = format_for_llm(parsed)

                if fs_result and not fs_result.errors:
                    # Use structured parser results
                    # Values from Excel are in Lakhs → convert to Rupees
                    _L = 100_000
                    financials = {
                        "turnover": fs_result.turnover * _L,
                        "total_assets": fs_result.total_assets * _L,
                        "pbt": fs_result.pbt * _L,
                        "parsed_fs": fs_result,
                        "source": "structured_parser",
                    }
                    st.session_state.parsed_fs = fs_result
                else:
                    # Fallback to text extraction
                    financials = extract_financials_from_text(text)
                    financials["source"] = "text_extraction"

                st.session_state.context["document_paths"] = paths
                st.session_state.context["documents_read"] = successful
                st.session_state.financials = financials
                st.session_state.step = 3
                st.rerun()

    # ════════════════════════════════
    # STEP 3 — MATERIALITY
    # ════════════════════════════════
    elif st.session_state.step == 3:
        st.subheader("Step 3 — Materiality Calculation")
        fin = st.session_state.financials
        source = fin.get("source", "text_extraction")

        if source == "structured_parser":
            st.success("✅ Figures read directly from financial statements")
        else:
            st.warning("⚠️ Figures extracted from text — please verify and correct if needed")

        st.caption("Review figures from uploaded documents. Edit if incorrect.")

        c1, c2, c3 = st.columns(3)
        with c1:
            turnover = st.number_input("Turnover (₹)", value=float(fin.get("turnover", 0)),
                                        step=100000.0, format="%.0f")
        with c2:
            total_assets = st.number_input("Total Assets (₹)", value=float(fin.get("total_assets", 0)),
                                            step=100000.0, format="%.0f")
        with c3:
            pbt = st.number_input("Profit Before Tax (₹)", value=float(fin.get("pbt", 0)),
                                   step=100000.0, format="%.0f")

        st.divider()
        st.markdown("#### Materiality Benchmark")
        st.caption(
            "The system suggests the lowest of three standard bases (conservative — per ICAI). "
            "You may choose a different benchmark and percentage."
        )

        # Show all three calculated bases
        if turnover or total_assets:
            mat_preview = calculate_materiality(turnover, total_assets, pbt)
            mc1, mc2, mc3 = st.columns(3)
            mc1.metric("0.5% of Turnover", f"₹{mat_preview.turnover_figure:,.0f}",
                       "✅ Suggested" if mat_preview.suggested_basis == "0.5% of Turnover" else "")
            mc2.metric("1% of Total Assets", f"₹{mat_preview.assets_figure:,.0f}",
                       "✅ Suggested" if mat_preview.suggested_basis == "1% of Total Assets" else "")
            mc3.metric("5% of PBT", f"₹{mat_preview.pbt_figure:,.0f}" if pbt > 0 else "N/A (loss)",
                       "✅ Suggested" if mat_preview.suggested_basis == "5% of Profit Before Tax" else "")
            st.info(f"**System suggests:** ₹{mat_preview.suggested_figure:,.0f} — {mat_preview.suggested_basis}")

        st.divider()
        st.markdown("#### CA's Choice")
        ca_benchmark_choice = st.selectbox(
            "Benchmark to use for materiality",
            options=["System suggestion (lowest of three)", "Turnover", "Total Assets",
                     "Profit Before Tax", "Custom figure"],
            key="ca_benchmark_select",
        )

        ca_pct_input = None
        ca_final_figure = None

        if ca_benchmark_choice == "Turnover":
            ca_pct_input = st.slider("% to apply on Turnover", 0.1, 5.0,
                                      value=0.5, step=0.1, format="%.1f%%")
        elif ca_benchmark_choice == "Total Assets":
            ca_pct_input = st.slider("% to apply on Total Assets", 0.1, 5.0,
                                      value=1.0, step=0.1, format="%.1f%%")
        elif ca_benchmark_choice == "Profit Before Tax":
            if pbt <= 0:
                st.warning("PBT is zero or negative — cannot use as benchmark.")
            else:
                ca_pct_input = st.slider("% to apply on PBT", 0.5, 10.0,
                                          value=5.0, step=0.5, format="%.1f%%")
        elif ca_benchmark_choice == "Custom figure":
            ca_final_figure = st.number_input(
                "Enter materiality figure directly (₹)",
                min_value=0.0, step=10000.0, format="%.0f",
            )

        # Compute materiality from CA choice
        if ca_benchmark_choice == "System suggestion (lowest of three)":
            mat = calculate_materiality(turnover, total_assets, pbt)
        elif ca_benchmark_choice == "Custom figure":
            mat = calculate_materiality(turnover, total_assets, pbt)
            if ca_final_figure:
                mat.ca_approved_figure = ca_final_figure
        else:
            benchmark_map = {
                "Turnover": "Turnover",
                "Total Assets": "Total Assets",
                "Profit Before Tax": "Profit Before Tax",
            }
            mat = calculate_materiality_flexible(
                turnover=turnover,
                total_assets=total_assets,
                pbt=pbt,
                ca_benchmark=benchmark_map.get(ca_benchmark_choice),
                ca_pct=ca_pct_input,
            )
            mat.ca_approved_figure = mat.suggested_figure

        # Show computed figure
        effective_mat = mat.ca_approved_figure or mat.suggested_figure
        st.metric("Computed Materiality", f"₹{effective_mat:,.0f}")

        # CA override field
        ca_mat = st.number_input(
            "Final materiality (₹) — edit if needed",
            value=float(effective_mat),
            step=10000.0, format="%.0f",
        )

        # Justification box — required per CA feedback
        st.divider()
        st.markdown("#### Justification *(required)*")
        st.caption(
            "Explain why you chose this benchmark and percentage. "
            "This will be recorded in the working paper."
        )
        ca_justification = st.text_area(
            "Materiality justification",
            placeholder=(
                "e.g. Turnover used as primary benchmark as the entity is a trading company "
                "with relatively low fixed assets. 0.5% applied as the engagement carries "
                "moderate inherent risk..."
            ),
            height=100,
            label_visibility="collapsed",
        )

        mat.ca_approved_figure = ca_mat
        mat.ca_justification = ca_justification

        c1, c2 = st.columns(2)
        with c1:
            if st.button("← Back"):
                st.session_state.step = 2
                st.rerun()
        with c2:
            if st.button("Next →", type="primary",
                         disabled=not ca_justification.strip()):
                st.session_state.context.update({
                    "ca_materiality_override": ca_mat,
                    "ca_materiality_justification": ca_justification,
                    "ca_benchmark_choice": ca_benchmark_choice,
                    "materiality": {
                        "turnover_figure": mat.turnover_figure,
                        "assets_figure": mat.assets_figure,
                        "pbt_figure": mat.pbt_figure,
                        "suggested_figure": mat.suggested_figure,
                        "suggested_basis": mat.suggested_basis,
                        "ca_approved_figure": ca_mat,
                        "effective_figure": ca_mat,
                        "ca_justification": ca_justification,
                    },
                })
                st.session_state.financials.update({
                    "turnover": turnover,
                    "total_assets": total_assets,
                    "pbt": pbt,
                })
                st.session_state.step = 4
                st.rerun()

    # ════════════════════════════════
    # STEP 4 — THRESHOLDS (NEW)
    # ════════════════════════════════
    elif st.session_state.step == 4:
        st.subheader("Step 4 — Thresholds")
        st.caption(
            "Set Performance Materiality (PM), Transaction Verification Threshold (TVT), "
            "and Clearly Trivial Misstatement (CTM)."
        )

        mat_data = st.session_state.context.get("materiality", {})
        raw_mat = mat_data.get("effective_figure", 500000)

        from utils.thresholds import round_to_nearest_thousand, DEFAULT_CTM_PCT
        rounded_mat = round_to_nearest_thousand(raw_mat)

        if raw_mat != rounded_mat:
            st.info(
                f"Materiality rounded from ₹{raw_mat:,.0f} → **₹{rounded_mat:,.0f}** "
                f"(nearest ₹1,000)"
            )
        else:
            st.success(f"Materiality: **₹{rounded_mat:,.0f}**")

        st.divider()
        st.markdown("#### Performance Materiality (PM)")
        st.caption(
            "PM is a buffer below overall materiality — the working threshold used to "
            "decide which accounts are material. Typically 60–90% of materiality."
        )

        pm_pct = st.slider(
            "PM as % of materiality",
            min_value=60, max_value=90, value=75, step=5,
            format="%d%%",
        )
        pm_value = round(rounded_mat * pm_pct / 100, 0)
        st.metric("Performance Materiality (PM)", f"₹{pm_value:,.0f}")

        st.divider()
        st.markdown("#### Clearly Trivial Misstatement (CTM)")
        st.caption("Errors below CTM are too small to aggregate or investigate.")

        ctm_pct = st.slider(
            "CTM as % of materiality",
            min_value=1, max_value=5, value=5, step=1,
            format="%d%%",
        )
        ctm_value = round(rounded_mat * ctm_pct / 100, 0)
        st.metric("Clearly Trivial Misstatement (CTM)", f"₹{ctm_value:,.0f}")

        st.divider()
        st.markdown("#### Transaction Verification Threshold (TVT)")
        st.caption(
            "TVT = PM ÷ expected number of transactions in an account. "
            "It tells the auditor the minimum transaction amount worth testing. "
            "You can set this per account in the MCOTABD step."
        )
        st.info(
            "Example: PM = ₹12,00,000 ÷ 12 transactions = ₹1,00,000 per transaction. "
            "You will enter the expected transaction count per MCOTABD in the next step."
        )

        c1, c2 = st.columns(2)
        with c1:
            if st.button("← Back"):
                st.session_state.step = 3
                st.rerun()
        with c2:
            if st.button("Next →", type="primary"):
                thresholds = calculate_thresholds(
                    raw_materiality=raw_mat,
                    pm_pct=float(pm_pct),
                    ctm_pct=float(ctm_pct),
                )
                st.session_state.thresholds = thresholds
                st.session_state.context["thresholds"] = {
                    "rounded_materiality": thresholds.rounded_materiality,
                    "pm": thresholds.performance_materiality,
                    "pm_pct": pm_pct,
                    "ctm": thresholds.ctm,
                    "ctm_pct": ctm_pct,
                }
                # Update effective figure to rounded materiality
                st.session_state.context["materiality"]["effective_figure"] = thresholds.rounded_materiality
                st.session_state.context["ca_materiality_override"] = thresholds.rounded_materiality
                st.session_state.step = 5
                st.rerun()

    # ════════════════════════════════
    # STEP 5 — MCOTABD CONFIRMATION
    # ════════════════════════════════
    elif st.session_state.step == 5:
        st.subheader("Step 5 — MCOTABD Confirmation")
        st.caption(
            "Review line items from your financial statements. "
            "Items above Performance Materiality (PM) are pre-selected. "
            "Add, remove, or include elevated-risk items below PM."
        )

        thresholds = st.session_state.thresholds
        mat_data = st.session_state.context.get("materiality", {})

        if thresholds:
            pm_value = thresholds.performance_materiality
            mat_value = thresholds.rounded_materiality
        else:
            mat_value = mat_data.get("effective_figure", 500000)
            pm_value = round(mat_value * 0.75, 0)

        st.markdown(
            f"**Materiality:** ₹{mat_value:,.0f} | "
            f"**Performance Materiality (PM):** ₹{pm_value:,.0f}"
        )
        st.divider()

        # Get MCOTABD candidates from structured parser or fallback
        parsed_fs = st.session_state.parsed_fs
        fin = st.session_state.financials

        if parsed_fs:
            # Structured parser path — correct line items from actual Excel cells
            candidates = get_mcotabd_candidates(parsed_fs, pm_value)
            above_pm = [c for c in candidates if c["above_pm"]]
            below_pm = [c for c in candidates if not c["above_pm"]]
        else:
            # Fallback to old text-based approach
            mat_obj = MaterialityResult(
                turnover_basis=0.5,
                turnover_figure=mat_data.get("turnover_figure", 0),
                assets_basis=1.0,
                assets_figure=mat_data.get("assets_figure", 0),
                pbt_basis=5.0,
                pbt_figure=mat_data.get("pbt_figure", 0),
                suggested_figure=mat_data.get("suggested_figure", 500000),
                suggested_basis=mat_data.get("suggested_basis", ""),
                ca_approved_figure=mat_data.get("ca_approved_figure"),
            )
            # Override effective figure with PM
            mat_obj.ca_approved_figure = pm_value
            mcotabd_items = identify_mcotabd(
                accounts=fin.get("accounts", {}),
                materiality=mat_obj,
            )
            above_pm = [
                {"account": i.account, "value": i.value, "source": "text",
                 "note_ref": "", "above_pm": i.included}
                for i in mcotabd_items if i.included
            ]
            below_pm = [
                {"account": i.account, "value": i.value, "source": "text",
                 "note_ref": "", "above_pm": False}
                for i in mcotabd_items if not i.included and i.elevated_risk_flag
            ]

        confirmed = []

        # TVT inputs — per account
        tvt_counts = {}

        st.markdown("#### ✅ Above Performance Materiality — include in scope")
        if above_pm:
            for item in above_pm:
                source_tag = f" [{item['source']}]" if item.get("source") not in ("text", "BS", "P&L") else ""
                checked = st.checkbox(
                    f"{item['account']} — ₹{item['value']:,.0f}{source_tag}",
                    value=True,
                    key=f"mcotabd_{item['account']}",
                )
                if checked:
                    confirmed.append(item['account'])
                    # TVT input for this account
                    txn_count = st.number_input(
                        f"Expected transactions in '{item['account']}' (for TVT)",
                        min_value=1, value=12, step=1,
                        key=f"tvt_{item['account']}",
                        help="Number of transactions expected in this account. TVT = PM ÷ this number.",
                    )
                    tvt = calculate_tvt(pm_value, int(txn_count))
                    st.caption(f"   TVT: ₹{tvt:,.0f} per transaction")
                    tvt_counts[item['account']] = int(txn_count)
        else:
            st.caption("No items found above PM. Check if financial statements were read correctly.")

        if below_pm:
            st.divider()
            st.markdown("#### ⚠️ Below PM — elevated risk accounts (include if required)")
            for item in below_pm:
                checked = st.checkbox(
                    f"{item['account']} — ₹{item['value']:,.0f} ⚠️",
                    value=False,
                    key=f"mcotabd_flag_{item['account']}",
                )
                if checked:
                    confirmed.append(item['account'])

        # Custom add
        st.divider()
        custom_account = st.text_input(
            "Add any other account not listed above",
            placeholder="e.g. Related Party Loans, Director's Loan Account",
            key="custom_account",
        )
        if custom_account and custom_account not in confirmed:
            confirmed.append(custom_account)
            st.success(f"✅ Added: {custom_account}")

        st.divider()
        st.info(f"**{len(confirmed)} MCOTABD(s) confirmed for risk assessment**")

        c1, c2 = st.columns(2)
        with c1:
            if st.button("← Back"):
                st.session_state.step = 4
                st.rerun()
        with c2:
            if st.button("Run Risk Engine →", type="primary",
                         disabled=len(confirmed) == 0):
                st.session_state.confirmed_mcotabds = confirmed
                st.session_state.context["confirmed_mcotabds"] = confirmed
                st.session_state.context["tvt_transaction_counts"] = tvt_counts
                st.session_state.step = 6
                st.rerun()

    # ════════════════════════════════
    # STEP 6 — RISK ENGINE
    # ════════════════════════════════
    elif st.session_state.step == 6:
        st.subheader("Step 6 — Risk Engine")

        if not st.session_state.agent_complete:
            confirmed = st.session_state.confirmed_mcotabds
            st.caption(f"Running risk assessment for {len(confirmed)} MCOTABD(s)...")

            # ── Preflight: check API key before attempting to run ──
            provider = os.environ.get("LLM_PROVIDER", "nvidia").lower()
            _key_map = {
                "nvidia": "NVIDIA_API_KEY",
                "anthropic": "ANTHROPIC_API_KEY",
                "openai": "OPENAI_API_KEY",
            }
            required_key = _key_map.get(provider, "NVIDIA_API_KEY")
            if not os.environ.get(required_key):
                st.error(
                    f"❌ **{required_key} is not set.** "
                    f"The risk engine cannot run without an LLM API key.\n\n"
                    f"**How to fix:**\n"
                    f"1. Open the `.env` file in the project folder\n"
                    f"2. Add: `{required_key}=your_api_key_here`\n"
                    f"3. Get a free key at: "
                    + ("https://build.nvidia.com/" if provider == "nvidia"
                       else "https://console.anthropic.com/" if provider == "anthropic"
                       else "https://platform.openai.com/")
                    + "\n4. Restart the app"
                )
                st.stop()

            industry = st.session_state.context.get("industry", "")
            matched, exact = match_industry(industry)

            if matched:
                st.success(f"✅ KB match found: **{matched}** — pulling from knowledge base")
            else:
                st.warning(
                    f"⚠️ No KB match for '{industry}' — "
                    "all risks will be LLM-generated and clearly labeled"
                )

            with st.spinner("Running risk assessment... this may take 30–60 seconds"):
                try:
                    llm = LLMClient()
                    agent = RiskAssessmentAgent(llm_client=llm)
                    result = agent.run(st.session_state.context)

                    if result.get("errors"):
                        err = result['errors'][-1]['error']
                        st.error(f"❌ Agent error: {err}")
                        st.info("Check that your API key is valid and your network is connected.")
                    else:
                        st.session_state.context = result
                        st.session_state.agent_complete = True
                        st.rerun()

                except EnvironmentError as e:
                    st.error(f"❌ Configuration error: {str(e)}")
                    st.info("Open the .env file and set the correct API key, then restart the app.")
                except Exception as e:
                    st.error(f"❌ Unexpected error: {str(e)}")
                    st.info(
                        "If this keeps happening, check:\n"
                        "- Your API key is valid\n"
                        "- Your internet connection is working\n"
                        "- The financial statements file was uploaded correctly"
                    )
        else:
            ctx = st.session_state.context
            kb_count = ctx.get("kb_row_count", 0)
            llm_count = ctx.get("llm_row_count", 0)
            unmatched = ctx.get("unmatched_mcotabds", [])

            c1, c2, c3 = st.columns(3)
            c1.metric("KB-derived rows", kb_count)
            c2.metric("LLM-generated rows", llm_count)
            c3.metric("MCOTABDs unmatched in KB", len(unmatched))

            if unmatched:
                st.warning(
                    f"These MCOTABDs had no KB data — "
                    f"LLM generated: **{', '.join(unmatched)}**"
                )

            st.success("Risk engine complete. Proceed to gate review.")

            c1, c2 = st.columns(2)
            with c1:
                if st.button("← Back"):
                    st.session_state.agent_complete = False
                    st.session_state.step = 5
                    st.rerun()
            with c2:
                if st.button("Gate Review →", type="primary"):
                    st.session_state.step = 7
                    st.rerun()

    # ════════════════════════════════
    # STEP 7 — CA GATE REVIEW
    # ════════════════════════════════
    elif st.session_state.step == 7:
        st.subheader("Step 7 — CA Gate Review")
        st.caption("Review all risks. Edit any row inline. Approve to write to Section 2000.")

        ctx = st.session_state.context
        rcm_rows = ctx.get("rcm_rows", [])

        if not rcm_rows:
            st.warning("No RCM rows found. Go back and re-run the risk engine.")
        else:
            # ── Group rows: one entry per (mcotabd, assertion, risk) ──────
            # Multiple controls for the same risk become one grouped row
            def _make_row_key(row: dict) -> str:
                mcotabd = row.get("mcotabd") or row.get("mcotabd_confirmed", "")
                assertion = row.get("assertion", "")
                risk = row.get("risk", "")
                return f"{mcotabd}||{assertion}||{risk}"

            grouped: dict[str, dict] = {}
            for row in rcm_rows:
                key = _make_row_key(row)
                if key not in grouped:
                    grouped[key] = {
                        "mcotabd": row.get("mcotabd") or row.get("mcotabd_confirmed", ""),
                        "assertion": row.get("assertion", ""),
                        "risk": row.get("risk", ""),
                        "controls": [],
                        "procedures": [],
                        "source": row.get("source", ""),
                        "driven_by_auditor_notes": row.get("driven_by_auditor_notes", False),
                        "key": key,
                    }
                # Accumulate controls and procedures
                ca = row.get("ca", "")
                sp = row.get("sp", "")
                if ca and ca not in grouped[key]["controls"]:
                    grouped[key]["controls"].append(ca)
                if sp and sp not in grouped[key]["procedures"]:
                    grouped[key]["procedures"].append(sp)

            grouped_rows = list(grouped.values())
            mcotabds = sorted(set(r["mcotabd"] for r in grouped_rows))

            # Summary
            kb_rows_g = [r for r in grouped_rows if r["source"] == "knowledge_base"]
            llm_rows_g = [r for r in grouped_rows if r["source"] == "llm_generated"]
            confirmed_mcotabds = st.session_state.confirmed_mcotabds
            covered_mcotabds = set(r["mcotabd"] for r in grouped_rows)
            missing_mcotabds = [m for m in confirmed_mcotabds if m not in covered_mcotabds]

            mc1, mc2, mc3 = st.columns(3)
            mc1.metric("Risk rows (grouped)", len(grouped_rows))
            mc2.metric("From Knowledge Base", len(kb_rows_g))
            mc3.metric("LLM generated", len(llm_rows_g))

            if missing_mcotabds:
                st.error(
                    f"⚠️ No risks generated for: **{', '.join(missing_mcotabds)}**. "
                    "Go back and re-run the risk engine."
                )

            if llm_rows_g:
                st.info(f"ℹ️ {len(llm_rows_g)} risk rows are LLM-generated (no KB match).")

            # ── RCM table by MCOTABD with inline editing ──────
            st.divider()
            edits = st.session_state.rcm_edits

            for mcotabd in mcotabds:
                rows_for = [r for r in grouped_rows if r["mcotabd"] == mcotabd]
                with st.expander(
                    f"**{mcotabd}** — {len(rows_for)} risk(s)",
                    expanded=True,
                ):
                    for row_idx, row in enumerate(rows_for):
                        row_key = f"{row['key']}_{row_idx}"
                        edit_state = edits.get(row_key, row)

                        if row["source"] == "knowledge_base":
                            source_badge = "🔵 KB"
                        elif row.get("driven_by_auditor_notes"):
                            source_badge = "🟠 LLM — Auditor notes"
                        else:
                            source_badge = "🟡 LLM"

                        # Editable risk row
                        with st.container():
                            col_badge, col_assertion = st.columns([1, 4])
                            with col_badge:
                                st.caption(source_badge)
                            with col_assertion:
                                new_assertion = st.text_input(
                                    "Assertion",
                                    value=edit_state.get("assertion", row["assertion"]),
                                    key=f"assertion_{row_key}",
                                    label_visibility="collapsed",
                                )

                            new_risk = st.text_area(
                                "Risk description",
                                value=edit_state.get("risk", row["risk"]),
                                key=f"risk_{row_key}",
                                height=70,
                            )

                            st.caption("Controls")
                            existing_controls = edit_state.get("controls", row["controls"])
                            new_controls = []
                            for ctrl_idx, ctrl in enumerate(existing_controls):
                                ctrl_val = st.text_input(
                                    f"Control {ctrl_idx + 1}",
                                    value=ctrl,
                                    key=f"ctrl_{row_key}_{ctrl_idx}",
                                )
                                if ctrl_val.strip():
                                    new_controls.append(ctrl_val)

                            add_ctrl = st.text_input(
                                "Add control",
                                key=f"add_ctrl_{row_key}",
                                placeholder="Type and it will be included on approval",
                            )
                            if add_ctrl.strip():
                                new_controls.append(add_ctrl)

                            st.caption("Substantive Procedures")
                            existing_procs = edit_state.get("procedures", row["procedures"])
                            new_procs = []
                            for sp_idx, sp in enumerate(existing_procs):
                                sp_val = st.text_input(
                                    f"Procedure {sp_idx + 1}",
                                    value=sp,
                                    key=f"sp_{row_key}_{sp_idx}",
                                )
                                if sp_val.strip():
                                    new_procs.append(sp_val)

                            add_sp = st.text_input(
                                "Add procedure",
                                key=f"add_sp_{row_key}",
                                placeholder="Type and it will be included on approval",
                            )
                            if add_sp.strip():
                                new_procs.append(add_sp)

                            # Save edits to session state
                            edits[row_key] = {
                                **row,
                                "assertion": new_assertion,
                                "risk": new_risk,
                                "controls": new_controls,
                                "procedures": new_procs,
                            }

                        st.divider()

                    st.session_state.rcm_edits = edits

            # ── Gate decision ──────────────────────────────────
            st.divider()
            st.markdown("#### Gate Decision")

            gc1, gc2, gc3 = st.columns(3)
            with gc1:
                if st.button("✅ Approve & Write to Section 2000",
                             type="primary", use_container_width=True):
                    # Apply all edits to context before saving
                    final_rows = []
                    for row_key, edited in st.session_state.rcm_edits.items():
                        # Flatten controls back to ca / sp fields for compatibility
                        final_rows.append({
                            "mcotabd": edited["mcotabd"],
                            "assertion": edited["assertion"],
                            "risk": edited["risk"],
                            "ca": " | ".join(edited["controls"]),
                            "controls": edited["controls"],
                            "sp": " | ".join(edited["procedures"]),
                            "procedures": edited["procedures"],
                            "source": edited["source"],
                        })
                    if final_rows:
                        ctx["rcm_rows"] = final_rows
                    st.session_state.gate_approved = True
                    st.rerun()
            with gc2:
                if st.button("🔄 Re-run agent", use_container_width=True):
                    st.session_state.agent_complete = False
                    st.session_state.gate_approved = False
                    st.session_state.rcm_edits = {}
                    st.session_state.step = 6
                    st.rerun()
            with gc3:
                if st.button("← Back", use_container_width=True):
                    st.session_state.step = 6
                    st.rerun()

        # ── Approved ──────────────────────────────────────────
        if st.session_state.gate_approved:
            st.divider()
            st.success(
                "✅ Risk assessment approved — written to Section 2000. "
                "Fieldwork may now begin."
            )
            st.caption(
                "This risk assessment is now the spec for fieldwork. "
                "Section 4000 WPs must map to confirmed MCOTABDs."
            )

            st.download_button(
                label="Download RCM (JSON)",
                data=json.dumps(ctx.get("rcm_rows", []), indent=2),
                file_name=f"RCM-{ctx.get('client_name', 'client')}-{ctx.get('financial_year', '')}.json",
                mime="application/json",
            )

            if st.button("Start new engagement"):
                for k, v in defaults.items():
                    st.session_state[k] = v
                st.rerun()
