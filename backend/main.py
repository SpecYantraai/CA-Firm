from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
import os, pathlib, time

from app.core.config import settings
from app.core.database import Base, engine
from app.api.v1.router import api_router

# Create tables
Base.metadata.create_all(bind=engine)

def ensure_schema_updates():
    inspector = inspect(engine)
    additions = {
        "users": {"initials": "VARCHAR(20) NULL"},
        "working_papers": {
            "prepared_by_initials": "VARCHAR(20) NULL",
            "reviewer1_initials": "VARCHAR(20) NULL",
            "reviewer2_initials": "VARCHAR(20) NULL",
        },
        "sign_offs": {"initials": "VARCHAR(20) NULL"},
        "engagements": {
            "is_small_entity": "TINYINT(1) DEFAULT 0",
            "workflow_override": "TINYINT(1) DEFAULT 0",
        },
        "engagement_users": {
            "role": "VARCHAR(50) DEFAULT 'Preparer'",
        },
        "review_notes": {
            "response_text": "TEXT NULL",
            "responded_by": "VARCHAR(36) NULL",
            "responded_by_name": "VARCHAR(255) NULL",
            "responded_at": "DATETIME NULL",
        },
    }

    with engine.begin() as conn:
        if engine.dialect.name == "mysql":
            conn.execute(text("ALTER TABLE sections MODIFY COLUMN section_code VARCHAR(10) NOT NULL"))
        for table, columns in additions.items():
            existing = {col["name"] for col in inspector.get_columns(table)}
            for column, ddl in columns.items():
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        if "working_paper_links" not in inspector.get_table_names():
            conn.execute(text("""
                CREATE TABLE working_paper_links (
                    link_id VARCHAR(36) PRIMARY KEY,
                    source_wp_id VARCHAR(36) NOT NULL,
                    target_wp_id VARCHAR(36) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))

ensure_schema_updates()

# Create upload dir
pathlib.Path(settings.FILE_STORAGE_PATH).mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Specentra AMS — Audit File Management System Stage 1",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 1)
    print(f"[{request.method}] {request.url.path} → {response.status_code} ({duration}ms)")
    return response

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "code": "INTERNAL_SERVER_ERROR"}
    )

# Include all routes
app.include_router(api_router)

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "stage": "Stage 1 — File Explorer"
    }

# Seed admin user on first run
@app.on_event("startup")
def seed_admin():
    from app.core.database import SessionLocal
    from app.models.models import Engagement, Section, User
    from app.core.config import SECTION_CODES, SECTION_NAMES
    from app.core.security import hash_password
    from app.services.audit_file_templates import create_standard_audit_file, hide_seeded_template_working_papers
    from app.services.initials import derive_initials
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "admin@specentra.com").first()
        if not existing:
            admin = User(
                full_name="System Administrator",
                initials="SA",
                email="admin@specentra.com",
                hashed_password=hash_password("Admin@123"),
                role="Admin",
                must_change_password=False,
            )
            db.add(admin)
            # Seed a demo partner
            partner = User(
                full_name="CA Partner",
                initials="CP",
                email="partner@specentra.com",
                hashed_password=hash_password("Partner@123"),
                role="Partner",
                must_change_password=False,
            )
            db.add(partner)
            db.commit()
            print("✅ Seeded: admin@specentra.com / Admin@123 | partner@specentra.com / Partner@123")
        client_existing = db.query(User).filter(User.email == "client@specentra.com").first()
        if not client_existing:
            client = User(
                full_name="Login as Client",
                initials="CLIENT",
                email="client@specentra.com",
                hashed_password=hash_password("Client@123"),
                role="Articled Assistant",
                must_change_password=False,
            )
            db.add(client)
            db.commit()
            print("✅ Seeded: client@specentra.com / Client@123")

        hide_seeded_template_working_papers(db)
        for eng in db.query(Engagement).filter(Engagement.status != "Archived").all():
            for code in SECTION_CODES:
                exists = db.query(Section).filter(
                    Section.engagement_id == eng.engagement_id,
                    Section.section_code == code,
                ).first()
                if not exists:
                    db.add(Section(
                        engagement_id=eng.engagement_id,
                        section_code=code,
                        section_name=SECTION_NAMES[code],
                    ))
                elif exists.section_name != SECTION_NAMES[code]:
                    exists.section_name = SECTION_NAMES[code]
            db.flush()
            create_standard_audit_file(db, eng.engagement_id, seed_templates=False)
        db.commit()
    except Exception as e:
        print(f"Seed error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
