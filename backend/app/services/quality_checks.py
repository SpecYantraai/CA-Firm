from __future__ import annotations

from datetime import datetime
from sqlalchemy.orm import Session
from app.models.models import WorkingPaper, Section, WorkingPaperLink, SignOff
from app.schemas.schemas import QualityCheckItem, QualityCheckSummary

STALE_DAYS = 30
SEVERITY_PENALTY = {
    "critical": 12,
    "high": 7,
    "medium": 4,
    "low": 2,
}


def run_quality_checks(db: Session, engagement_id: str) -> QualityCheckSummary:
    sections = {
        sec.section_id: sec
        for sec in db.query(Section).filter(Section.engagement_id == engagement_id).all()
    }
    wps = db.query(WorkingPaper).filter(
        WorkingPaper.engagement_id == engagement_id,
        WorkingPaper.is_deleted == False
    ).all()
    wp_ids = [wp.wp_id for wp in wps]
    linked_wp_ids = _linked_wp_ids(db, wp_ids)
    checks: list[QualityCheckItem] = []

    for wp in wps:
        section = sections.get(wp.section_id)
        section_code = section.section_code if section else None
        section_name = section.section_name if section else None
        open_notes = sum(1 for note in wp.review_notes if note.status != "Closed")
        reviewer_signoffs = [
            so for so in wp.sign_offs
            if so.signoff_type in ("Reviewer 1", "Reviewer 2", "Final Reviewer")
        ]
        prepared_signoffs = [
            so for so in wp.sign_offs
            if so.signoff_type == "Prepared By"
        ]

        if not wp.prepared_by_initials and not prepared_signoffs:
            checks.append(_item(
                wp, section_code, section_name,
                category="Sign-offs",
                severity="high",
                title="Missing preparer sign-off",
                detail="Working paper has no preparer initials or prepared-by sign-off.",
                recommendation="Ask the preparer to sign off before the paper moves to review.",
            ))

        if wp.review_status in ("Submitted", "Under Review", "Review Notes Raised", "Finalised") and not wp.reviewer1_initials and not reviewer_signoffs:
            checks.append(_item(
                wp, section_code, section_name,
                category="Sign-offs",
                severity="critical" if wp.review_status == "Finalised" else "high",
                title="Missing reviewer sign-off",
                detail=f"Working paper is marked {wp.review_status}, but no reviewer sign-off is recorded.",
                recommendation="Record Reviewer 1 / Final Reviewer sign-off before final file assembly.",
            ))

        if open_notes > 0:
            checks.append(_item(
                wp, section_code, section_name,
                category="Review notes",
                severity="high",
                title="Open review notes",
                detail=f"{open_notes} review note(s) are still open.",
                recommendation="Resolve or close review notes before finalisation.",
            ))

        if section_code in ("4000", "5000") and wp.wp_id not in linked_wp_ids:
            checks.append(_item(
                wp, section_code, section_name,
                category="Evidence linking",
                severity="medium",
                title="Unlinked evidence trail",
                detail="Execution/reporting working paper is not linked to supporting or cross-referenced evidence.",
                recommendation="Use WP links to connect this paper to source evidence, lead schedules, or related workpapers.",
            ))

        age_days = _age_days(wp.updated_at or wp.created_at)
        if wp.review_status != "Finalised" and age_days is not None and age_days > STALE_DAYS:
            checks.append(_item(
                wp, section_code, section_name,
                category="Stale files",
                severity="medium",
                title="Stale working paper",
                detail=f"Working paper has not been updated for {age_days} days and is not finalised.",
                recommendation="Confirm whether work is still in progress, replace the file, or submit it for review.",
                age_days=age_days,
            ))

        if wp.review_status == "Finalised" and (not wp.final_reviewer_name or not wp.final_reviewed_at):
            checks.append(_item(
                wp, section_code, section_name,
                category="Conclusion quality",
                severity="critical",
                title="Weak finalisation evidence",
                detail="Working paper is finalised, but final reviewer name/date is incomplete.",
                recommendation="Record final reviewer details so the conclusion trail is defensible.",
            ))

    return _summary(engagement_id, checks)


def _linked_wp_ids(db: Session, wp_ids: list[str]) -> set[str]:
    if not wp_ids:
        return set()
    rows = db.query(WorkingPaperLink).filter(
        (WorkingPaperLink.source_wp_id.in_(wp_ids)) |
        (WorkingPaperLink.target_wp_id.in_(wp_ids))
    ).all()
    linked = set()
    for row in rows:
        linked.add(row.source_wp_id)
        linked.add(row.target_wp_id)
    return linked


def _age_days(value: datetime | None) -> int | None:
    if not value:
        return None
    return max(0, (datetime.utcnow() - value).days)


def _item(
    wp: WorkingPaper,
    section_code: str | None,
    section_name: str | None,
    category: str,
    severity: str,
    title: str,
    detail: str,
    recommendation: str,
    age_days: int | None = None,
) -> QualityCheckItem:
    return QualityCheckItem(
        check_id=f"{wp.wp_id}:{category}:{title}".replace(" ", "-").lower(),
        category=category,
        severity=severity,
        status="Open",
        title=title,
        detail=detail,
        recommendation=recommendation,
        wp_id=wp.wp_id,
        wp_number=wp.wp_number,
        filename=wp.filename,
        section_code=section_code,
        section_name=section_name,
        age_days=age_days,
    )


def _summary(engagement_id: str, checks: list[QualityCheckItem]) -> QualityCheckSummary:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    categories: dict[str, int] = {}
    penalty = 0
    for check in checks:
        counts[check.severity] = counts.get(check.severity, 0) + 1
        categories[check.category] = categories.get(check.category, 0) + 1
        penalty += SEVERITY_PENALTY.get(check.severity, 1)
    score = max(0, 100 - penalty)
    return QualityCheckSummary(
        engagement_id=engagement_id,
        score=score,
        total_issues=len(checks),
        critical=counts["critical"],
        high=counts["high"],
        medium=counts["medium"],
        low=counts["low"],
        categories=categories,
        checks=checks,
    )
