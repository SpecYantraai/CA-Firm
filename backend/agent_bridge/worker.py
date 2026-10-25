"""JSON transport around the unmodified agent, isolated from AMS module names."""
from __future__ import annotations

import contextlib
import dataclasses
import json
import math
import os
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
VENDOR = BACKEND / "vendor" / "ams_ra"
sys.path.insert(0, str(VENDOR))


def serializable(value):
    if dataclasses.is_dataclass(value):
        return serializable(dataclasses.asdict(value))
    if isinstance(value, dict):
        return {key: serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def apply_model_configuration(config):
    if not config:
        return
    provider = "openai" if config["provider"] == "openai-compatible" else config["provider"]
    os.environ.update(LLM_PROVIDER=provider, LLM_MODEL=config["model"], LLM_TIMEOUT_SECONDS=str(config["timeout_seconds"]))
    if config.get("api_key") is not None:
        key_name = {"nvidia": "NVIDIA_API_KEY", "openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}[provider]
        os.environ[key_name] = config["api_key"]


def build_llm_client(config):
    from llm.client import LLMClient
    client = LLMClient()
    if config:
        client._provider.client.base_url = config["base_url"]
        client._provider.client.timeout = config["timeout_seconds"]
    return client


def dispatch(request):
    from dotenv import dotenv_values, load_dotenv
    load_dotenv(BACKEND / ".env")
    load_dotenv(BACKEND / ".private-agent-import" / "default-model.env")
    private_config = BACKEND / ".private-agent-import" / ".env"
    for key, value in dotenv_values(private_config).items():
        if key in {"LLM_PROVIDER", "LLM_MODEL", "LLM_TIMEOUT_SECONDS", "LLM_MAX_RETRIES", "NVIDIA_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LOG_LEVEL"} and key not in os.environ and value:
            os.environ[key] = value
    if os.environ.get("LLM_PROVIDER", "nvidia").lower() == "nvidia":
        os.environ.setdefault("LLM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b")
    model_config = request.get("model_configuration")
    apply_model_configuration(model_config)
    from utils import knowledge_base as kb
    if request.get("knowledge_base_path"):
        kb.KB_PATH = Path(request["knowledge_base_path"])
    from utils.materiality import (
        calculate_materiality, calculate_materiality_flexible,
        extract_financials_from_text, identify_mcotabd, MaterialityResult,
    )
    from utils.thresholds import calculate_thresholds, calculate_tvt
    from utils.financial_parser import (
        parse_financial_statements, get_mcotabd_candidates, FinancialStatements, LineItem,
    )
    from utils.document_parser import parse_document, format_for_llm

    operation = request["operation"]
    data = request.get("data", {})
    if operation == "configuration":
        provider = os.environ.get("LLM_PROVIDER", "nvidia").lower()
        key_name = {"nvidia": "NVIDIA_API_KEY", "openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}.get(provider)
        defaults = {"nvidia": "nvidia/nemotron-3-ultra-550b-a55b", "anthropic": "claude-sonnet-4-6", "openai": "gpt-4o"}
        return {"knowledge_base": kb.get_kb_stats(), "provider": provider,
                "model": os.environ.get("LLM_MODEL", defaults.get(provider, "")),
                "base_url": model_config["base_url"] if model_config else {"nvidia": "https://integrate.api.nvidia.com/v1", "openai": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"), "anthropic": os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")}.get(provider, ""),
                "configuration_source": "admin" if model_config else "server",
                "timeout_seconds": int(os.environ.get("LLM_TIMEOUT_SECONDS", "60")),
                "configured_provider": model_config["provider"] if model_config else provider,
                "key_configured": bool(key_name and os.environ.get(key_name)),
                "provider_supported": key_name is not None}
    if operation == "test_connection":
        try:
            client = build_llm_client(model_config)
            response = client._provider.client.with_options(timeout=15, max_retries=0).models.list()
            ids = [item.id for item in response.data]
            return {"connected": True, "model_listed": client.model_name in ids if ids else None}
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            message = f"Provider connection failed (HTTP {status}). Check the API key and API base URL." if status else "Could not connect to the model provider. Check the API base URL, key, and network connection."
            raise RuntimeError(message) from None
    if operation == "industry":
        matched, exact = kb.match_industry(data["industry"])
        return {"matched_industry": matched, "exact_match": exact}
    if operation == "parse":
        paths = data["document_paths"]
        fs_result = None
        for path in paths:
            if Path(path).suffix.lower() in (".xlsx", ".xls") and fs_result is None:
                fs_result = parse_financial_statements(path)
        text, successful, failed = format_for_llm([parse_document(path) for path in paths])
        if not successful:
            raise ValueError("All documents failed to parse. " + "; ".join(item["reason"] for item in failed))
        if fs_result and not fs_result.errors:
            # Same unit conversion as the supplied Streamlit upload step.
            financials = {"turnover": fs_result.turnover * 100_000,
                          "total_assets": fs_result.total_assets * 100_000,
                          "pbt": fs_result.pbt * 100_000, "source": "structured_parser"}
            parsed_fs = serializable(fs_result)
        else:
            financials = {**extract_financials_from_text(text), "source": "text_extraction"}
            parsed_fs = None
        return {"financials": financials, "parsed_fs": parsed_fs,
                "documents_read": successful, "documents_failed": failed}
    if operation == "materiality":
        figures = {name: data[name] for name in ("turnover", "total_assets", "pbt")}
        preview = calculate_materiality(**figures)
        choice = data.get("benchmark", "System suggestion (lowest of three)")
        if choice in ("System suggestion (lowest of three)", "Custom figure"):
            result = calculate_materiality(**figures)
            if choice == "Custom figure" and data.get("custom_figure"):
                result.ca_approved_figure = data["custom_figure"]
        else:
            percentage = None if choice == "Profit Before Tax" and figures["pbt"] <= 0 else data.get("percentage")
            result = calculate_materiality_flexible(**figures, ca_benchmark=choice, ca_pct=percentage)
            result.ca_approved_figure = result.suggested_figure
        computed = result.ca_approved_figure or result.suggested_figure
        final = data.get("final_figure")
        result.ca_approved_figure = computed if final is None else final
        result.ca_justification = data.get("justification", "")
        return {"preview": serializable(preview), "computed_figure": computed,
                "materiality": {**serializable(result), "effective_figure": result.ca_approved_figure}}
    if operation == "thresholds":
        return serializable(calculate_thresholds(**data))
    if operation == "scope":
        pm = data["thresholds"]["pm"]
        parsed = data.get("parsed_fs")
        if parsed:
            fs = FinancialStatements(**{**parsed,
                "bs_items": [LineItem(**item) for item in parsed["bs_items"]],
                "pl_items": [LineItem(**item) for item in parsed["pl_items"]]})
            return get_mcotabd_candidates(fs, pm)
        mat = data["materiality"]
        obj = MaterialityResult(**{key: mat[key] for key in (
            "turnover_basis", "turnover_figure", "assets_basis", "assets_figure",
            "pbt_basis", "pbt_figure", "suggested_figure", "suggested_basis")})
        obj.ca_approved_figure = pm
        items = identify_mcotabd(data["financials"].get("accounts", {}), obj)
        return [{"account": item.account, "value": item.value, "source": "text",
                 "note_ref": "", "above_pm": item.included} for item in items
                if item.included or item.elevated_risk_flag]
    if operation == "tvt":
        return {name: calculate_tvt(data["pm"], count) for name, count in data["counts"].items()}
    if operation == "run":
        from agents.risk_assessment_agent import RiskAssessmentAgent
        return RiskAssessmentAgent(llm_client=build_llm_client(model_config)).run(data)
    raise ValueError("Unsupported bridge operation")


if __name__ == "__main__":
    request = json.loads(sys.stdin.read())
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = dispatch(request)
        response = {"ok": True, "data": serializable(result)}
    except Exception as exc:
        response = {"ok": False, "error": str(exc), "kind": type(exc).__name__}
    sys.stdout.write(json.dumps(response, ensure_ascii=True, allow_nan=False))
