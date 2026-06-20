from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings, get_folders_for_engagement
from app.models.models import FileVersion, Folder, Section, WorkingPaper, Engagement
from app.services.numbering import assign_wp_number, check_wp_number_conflict


TEMPLATE_ROOT = Path(__file__).resolve().parents[1] / "templates" / "audit"

STANDARD_FOLDERS = {
    "1000": [
        ("1001", "SA 200 WPs"),
        ("1002", "SA 210 WPs"),
        ("1003", "SA 220 WPs"),
        ("1004", "SA 240 WPs"),
        ("1005", "SA 250 WPs"),
    ],
    "2000": [
        ("2001", "Audit planning templates"),
        ("2020.03A", "Questionnaires"),
        ("2030", "Subsequent period PL"),
    ],
    "4000": [
        ("4001", "Assets"),
        ("4002", "Equity"),
        ("4003", "Expenditure"),
        ("4004", "Liabilities"),
        ("4005", "Misc"),
        ("4006", "Revenue"),
    ],
    "5000": [
        ("5001", "Financial statements"),
        ("5002", "Notes to accounts"),
        ("5003", "Audit reports"),
        ("5004", "Tax audit statements"),
    ],
}


WP_NUMBER_RE = re.compile(r"^(\d{4}(?:\.\d{2}[A-Z]?)?)")


def create_standard_audit_file(
    db: Session,
    engagement_id: str,
    created_by: str | None = None,
    seed_templates: bool = False,
) -> None:
    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    if not eng:
        return

    sections = {
        sec.section_code: sec
        for sec in db.query(Section).filter(Section.engagement_id == engagement_id).all()
    }

    folders_to_create = get_folders_for_engagement(eng.engagement_type, eng.is_small_entity)

    folder_by_key: dict[tuple[str, str, str | None], Folder] = {}
    for section_code, folders in folders_to_create.items():
        section = sections.get(section_code)
        if not section:
            continue
        for index, name in folders:
            folder = _ensure_folder(
                db=db,
                section=section,
                engagement_id=engagement_id,
                name=name,
                wp_number=index,
                parent=None,
                created_by=created_by,
            )
            folder_by_key[(section_code, name, None)] = folder

    if seed_templates:
        _seed_1000_templates(db, engagement_id, sections, folder_by_key, created_by)
        _seed_2000_templates(db, engagement_id, sections, folder_by_key, created_by)


def hide_seeded_template_working_papers(db: Session, engagement_id: str | None = None) -> int:
    query = db.query(WorkingPaper).filter(
        WorkingPaper.prepared_by_name == "Template",
        WorkingPaper.prepared_by_initials == "TPL",
        WorkingPaper.is_deleted == False,
    )
    if engagement_id:
        query = query.filter(WorkingPaper.engagement_id == engagement_id)

    count = 0
    for wp in query.all():
        wp.is_deleted = True
        count += 1
    return count


def _ensure_folder(
    db: Session,
    section: Section,
    engagement_id: str,
    name: str,
    wp_number: str,
    parent: Folder | None,
    created_by: str | None,
) -> Folder:
    existing = db.query(Folder).filter(
        Folder.engagement_id == engagement_id,
        Folder.section_id == section.section_id,
        Folder.parent_folder_id == (parent.folder_id if parent else None),
        Folder.folder_name == name,
        Folder.is_deleted == False,
    ).first()
    if existing:
        return existing

    full_path = f"{section.section_name} / {name}"
    depth = 1
    if parent:
        full_path = f"{parent.full_path} / {name}" if parent.full_path else f"{section.section_name} / {name}"
        depth = parent.depth + 1

    folder = Folder(
        engagement_id=engagement_id,
        section_id=section.section_id,
        parent_folder_id=parent.folder_id if parent else None,
        folder_name=name,
        depth=depth,
        full_path=full_path,
        wp_number=wp_number,
        created_by=created_by,
    )
    db.add(folder)
    db.flush()
    return folder


def _seed_1000_templates(
    db: Session,
    engagement_id: str,
    sections: dict[str, Section],
    folder_by_key: dict[tuple[str, str, str | None], Folder],
    created_by: str | None,
) -> None:
    section = sections.get("1000")
    source_root = TEMPLATE_ROOT / "1000"
    if not section or not source_root.exists():
        return

    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    folders_to_create = get_folders_for_engagement(eng.engagement_type, eng.is_small_entity) if eng else {}
    allowed_folders = {name for _, name in folders_to_create.get("1000", [])}

    for sa_folder in source_root.iterdir():
        if not sa_folder.is_dir():
            continue
        if sa_folder.name not in allowed_folders:
            continue
        parent = folder_by_key.get(("1000", sa_folder.name, None))
        if not parent:
            parent = _ensure_folder(
                db, section, engagement_id, sa_folder.name,
                _folder_index_from_name(sa_folder.name, section.section_code),
                None, created_by
            )
        _seed_template_tree(db, engagement_id, section, sa_folder, parent, created_by)


def _seed_2000_templates(
    db: Session,
    engagement_id: str,
    sections: dict[str, Section],
    folder_by_key: dict[tuple[str, str, str | None], Folder],
    created_by: str | None,
) -> None:
    section = sections.get("2000")
    source_root = TEMPLATE_ROOT / "2000" / "Sample 2000 series WPs"
    if not section or not source_root.exists():
        return

    eng = db.query(Engagement).filter(Engagement.engagement_id == engagement_id).first()
    folders_to_create = get_folders_for_engagement(eng.engagement_type, eng.is_small_entity) if eng else {}
    allowed_folders = {name for _, name in folders_to_create.get("2000", [])}
    if "Audit planning templates" not in allowed_folders:
        return

    parent = folder_by_key.get(("2000", "Audit planning templates", None))
    if not parent:
        parent = _ensure_folder(db, section, engagement_id, "Audit planning templates", "2001", None, created_by)

    for file_path in sorted(source_root.iterdir()):
        if file_path.is_file():
            _create_template_wp(db, engagement_id, section, parent, file_path, created_by)


def _seed_template_tree(
    db: Session,
    engagement_id: str,
    section: Section,
    source_dir: Path,
    parent_folder: Folder,
    created_by: str | None,
) -> None:
    for child in sorted(source_dir.iterdir()):
        if child.is_dir():
            index = _folder_index_from_name(child.name, section.section_code, parent_folder)
            folder = _ensure_folder(db, section, engagement_id, child.name, index, parent_folder, created_by)
            _seed_template_tree(db, engagement_id, section, child, folder, created_by)
        elif child.is_file():
            _create_template_wp(db, engagement_id, section, parent_folder, child, created_by)


def _create_template_wp(
    db: Session,
    engagement_id: str,
    section: Section,
    folder: Folder,
    source_file: Path,
    created_by: str | None,
) -> None:
    existing = db.query(WorkingPaper).filter(
        WorkingPaper.engagement_id == engagement_id,
        WorkingPaper.folder_id == folder.folder_id,
        WorkingPaper.filename == source_file.name,
        WorkingPaper.is_deleted == False,
    ).first()
    if existing:
        return

    wp_number = _wp_number_from_filename(source_file.name)
    if not wp_number or check_wp_number_conflict(db, engagement_id, wp_number):
        wp_number = assign_wp_number(
            db=db,
            engagement_id=engagement_id,
            section_id=section.section_id,
            section_code=section.section_code,
            parent_folder_id=folder.folder_id,
            parent_wp_number=folder.wp_number,
            depth=folder.depth + 1,
        )

    storage_path = _copy_template_file(engagement_id, source_file)
    file_size = source_file.stat().st_size
    ext = source_file.suffix.lower().lstrip(".")

    wp = WorkingPaper(
        engagement_id=engagement_id,
        section_id=section.section_id,
        folder_id=folder.folder_id,
        wp_number=wp_number,
        filename=source_file.name,
        file_format=ext,
        file_size_bytes=file_size,
        file_storage_path=storage_path,
        review_status="Draft",
        prepared_by=created_by,
        prepared_by_name="Template",
        prepared_by_initials="TPL",
        prepared_at=datetime.utcnow(),
        current_version=1,
    )
    db.add(wp)
    db.flush()

    db.add(FileVersion(
        wp_id=wp.wp_id,
        version_number=1,
        filename=source_file.name,
        file_size_bytes=file_size,
        file_storage_path=storage_path,
        uploaded_by=created_by,
        uploaded_by_name="Template",
    ))


def _copy_template_file(engagement_id: str, source_file: Path) -> str:
    base = Path(settings.FILE_STORAGE_PATH) / engagement_id / "templates"
    base.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{source_file.name}"
    dest = base / safe_name
    shutil.copy2(source_file, dest)
    return str(dest)


def _wp_number_from_filename(filename: str) -> str | None:
    match = WP_NUMBER_RE.match(filename)
    return match.group(1) if match else None


def _folder_index_from_name(name: str, section_code: str, parent: Folder | None = None) -> str:
    match = WP_NUMBER_RE.match(name)
    if match:
        return match.group(1)
    if parent and parent.wp_number:
        return f"{parent.wp_number}.01"
    fallback = {
        "SA 200 WPs": "1001",
        "SA 210 WPs": "1002",
        "SA 220 WPs": "1003",
        "SA 240 WPs": "1004",
        "SA 250 WPs": "1005",
    }
    return fallback.get(name, f"{section_code}.01")
