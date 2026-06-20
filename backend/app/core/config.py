from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://root:password@localhost:3306/specentra"
    SECRET_KEY: str = "specentra-super-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    FILE_STORAGE_PATH: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 100
    APP_NAME: str = "Specentra AMS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    RETENTION_YEARS: int = 7
    PUBLIC_BACKEND_URL: str = "http://localhost:8000"
    DOCUMENT_EDITOR_URL: str = ""

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

ALLOWED_EXTENSIONS = {
    ".xlsx", ".xls", ".docx", ".doc", ".pdf",
    ".jpg", ".jpeg", ".png", ".csv", ".zip"
}

SECTION_CODES = ["1000", "2000", "3000", "4000", "5000", "MISC"]
SECTION_NAMES = {
    "1000": "Preconditions for audit",
    "2000": "Audit Planning",
    "3000": "Communications",
    "4000": "Audit Execution",
    "5000": "Audit Reporting",
    "MISC": "Checklists, Other Misc Documents",
}

ROLES = ["Articled Assistant", "Audit Executive", "Audit Manager", "Partner", "EQCR Reviewer", "Admin"]

CLOSURE_CHECKLIST = [
    {"item_id": "CL-1001", "section_code": "1000", "description": "Independence declaration is present in section 1000", "check_type": "document_exists"},
    {"item_id": "CL-1002", "section_code": "1000", "description": "Client acceptance / continuance documentation is present", "check_type": "document_exists"},
    {"item_id": "CL-1003", "section_code": "1000", "description": "Engagement letter is present and signed", "check_type": "document_exists"},
    {"item_id": "CL-2001", "section_code": "2000", "description": "Audit strategy document is present", "check_type": "document_exists"},
    {"item_id": "CL-2002", "section_code": "2000", "description": "Audit plan is present", "check_type": "document_exists"},
    {"item_id": "CL-2003", "section_code": "2000", "description": "Risk assessment and audit programme is present", "check_type": "document_exists"},
    {"item_id": "CL-2004", "section_code": "2000", "description": "Materiality calculation is present", "check_type": "document_exists"},
    {"item_id": "CL-3001", "section_code": "3000", "description": "Management representation letter is present", "check_type": "document_exists"},
    {"item_id": "CL-3002", "section_code": "3000", "description": "Significant audit findings communicated to management are documented", "check_type": "document_exists"},
    {"item_id": "CL-4001", "section_code": "4000", "description": "At least one working paper exists for each planned audit area", "check_type": "wps_exist"},
    {"item_id": "CL-4002", "section_code": "4000", "description": "All WPs in section 4000 have a Prepared By attribution", "check_type": "prepared_by_complete"},
    {"item_id": "CL-4003", "section_code": "4000", "description": "All WPs in section 4000 have been reviewed — no WP remains in Draft or Submitted status", "check_type": "review_complete"},
    {"item_id": "CL-5001", "section_code": "5000", "description": "Draft audit report is present", "check_type": "document_exists"},
    {"item_id": "CL-5002", "section_code": "5000", "description": "Final audit report is present", "check_type": "document_exists"},
    {"item_id": "CL-E001", "section_code": None, "description": "All review notes across the engagement are closed", "check_type": "no_open_notes"},
    {"item_id": "CL-E002", "section_code": None, "description": "Partner final sign-off is recorded on at least one WP in each section", "check_type": "partner_signoff"},
]

ENGAGEMENT_TYPES = {
    "statutory-audit-corporate": "Statutory audit – Corporate",
    "statutory-audit-non-corporate": "Statutory audit – Non corporate",
    "tax-audit": "Tax audit",
    "limited-review": "Limited review",
    "certifications": "Certifications",
    "other-assurance-related": "Other Assurance engagements/Related services"
}

ENGAGEMENT_SPECS = {
    "statutory-audit-corporate": {
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
    },
    "statutory-audit-non-corporate": {
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
        ],
        "4000": [
            ("4001", "Assets"),
            ("4002", "Equity/Capital"),
            ("4003", "Expenditure"),
            ("4004", "Liabilities"),
            ("4005", "Misc"),
            ("4006", "Revenue"),
        ],
        "5000": [
            ("5001", "Financial statements"),
            ("5002", "Notes to accounts"),
            ("5003", "Audit reports"),
        ],
    },
    "tax-audit": {
        "1000": [
            ("1001", "Client Acceptance"),
            ("1002", "Engagement Letter"),
            ("1003", "Independence Declaration"),
        ],
        "2000": [
            ("2001", "Tax Audit Planning"),
            ("2002", "Materiality & Sampling"),
        ],
        "4000": [
            ("4001", "Form 3CD Verification"),
            ("4002", "Income Computation"),
            ("4003", "TDS Verification"),
            ("4004", "Depreciation Verification"),
            ("4005", "Other Execution WPs"),
        ],
        "5000": [
            ("5001", "Form 3CA / 3CB"),
            ("5002", "Form 3CD Draft"),
            ("5003", "Final Tax Audit Report"),
        ],
    },
    "limited-review": {
        "1000": [
            ("1001", "Terms of Engagement"),
            ("1002", "Independence Declaration"),
        ],
        "2000": [
            ("2001", "Review Strategy & Planning"),
            ("2002", "Analytical Procedures Design"),
        ],
        "4000": [
            ("4001", "Inquiries & Analytical Procedures"),
            ("4002", "Review Workings"),
        ],
        "5000": [
            ("5001", "Draft Review Report"),
            ("5002", "Final Review Report"),
        ],
    },
    "certifications": {
        "1000": [
            ("1001", "Certificate Request & Acceptance"),
        ],
        "2000": [
            ("2001", "Verification Plan"),
        ],
        "4000": [
            ("4001", "Supporting Documents & Verification"),
        ],
        "5000": [
            ("5001", "Certificates Issued"),
        ],
    },
    "other-assurance-related": {
        "1000": [
            ("1001", "Engagement Acceptance & Terms"),
        ],
        "2000": [
            ("2001", "Planning & Procedures"),
        ],
        "4000": [
            ("4001", "Execution & Workings"),
        ],
        "5000": [
            ("5001", "Draft & Final Reports"),
        ],
    },
}

def get_folders_for_engagement(engagement_type: str, is_small_entity: bool) -> dict:
    spec = ENGAGEMENT_SPECS.get(engagement_type, ENGAGEMENT_SPECS["statutory-audit-corporate"])
    if not is_small_entity:
        return spec
    simplified = {}
    for sec, folders in spec.items():
        if engagement_type in ("statutory-audit-corporate", "statutory-audit-non-corporate"):
            if sec == "1000":
                simplified[sec] = [f for f in folders if f[0] in ("1001", "1002")]
            elif sec == "2000":
                simplified[sec] = [f for f in folders if f[0] == "2001"]
            elif sec == "5000":
                simplified[sec] = [f for f in folders if f[0] in ("5001", "5003")]
            else:
                simplified[sec] = folders
        else:
            simplified[sec] = folders
    return simplified

