"""
AMS — Document Parser
Parses Excel and Word files uploaded by CA firm.
"""

from __future__ import annotations
from pathlib import Path
import structlog

logger = structlog.get_logger()


def parse_excel(file_path) -> dict:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True)
        result = {}
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = []
            for row in ws.iter_rows(values_only=True):
                if any(cell is not None for cell in row):
                    row_str = " | ".join(
                        str(cell) if cell is not None else ""
                        for cell in row
                    )
                    rows.append(row_str)
            result[sheet_name] = "\n".join(rows)
        logger.info("document.parsed", file=str(file_path),
                    type="excel", sheets=list(result.keys()))
        return {"success": True, "content": result, "format": "excel"}
    except Exception as e:
        logger.error("document.parse.failed", file=str(file_path), error=str(e))
        return {"success": False, "error": str(e), "format": "excel"}


def parse_word(file_path) -> dict:
    try:
        from docx import Document
        doc = Document(file_path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        tables_text = []
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(
                    cell.text.strip() for cell in row.cells
                )
                if row_text.strip():
                    tables_text.append(row_text)
        full_text = "\n".join(paragraphs)
        if tables_text:
            full_text += "\n\nTABLES:\n" + "\n".join(tables_text)
        logger.info("document.parsed", file=str(file_path),
                    type="word", paragraphs=len(paragraphs))
        return {"success": True,
                "content": {"document": full_text}, "format": "word"}
    except Exception as e:
        logger.error("document.parse.failed", file=str(file_path), error=str(e))
        return {"success": False, "error": str(e), "format": "word"}


def parse_document(file_path) -> dict:
    path = Path(file_path)
    suffix = path.suffix.lower()
    name = path.name

    if suffix in (".xlsx", ".xls"):
        result = parse_excel(path)
    elif suffix in (".docx", ".doc"):
        result = parse_word(path)
    else:
        return {
            "success": False,
            "error": f"Unsupported format: {suffix}",
            "format": suffix,
            "filename": name,
        }

    result["filename"] = name
    return result


def format_for_llm(parsed_docs: list[dict]) -> tuple[str, list[str], list[dict]]:
    sections = []
    successful = []
    failed = []

    for doc in parsed_docs:
        if not doc.get("success"):
            failed.append({
                "filename": doc.get("filename", "unknown"),
                "reason": doc.get("error", "unknown error"),
            })
            continue

        successful.append(doc["filename"])
        content = doc["content"]

        if isinstance(content, dict):
            for section_name, text in content.items():
                if text.strip():
                    sections.append(
                        f"=== {doc['filename']} — {section_name} ===\n{text}"
                    )
        else:
            sections.append(f"=== {doc['filename']} ===\n{content}")

    return "\n\n".join(sections), successful, failed
