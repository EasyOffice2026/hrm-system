from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from sqlalchemy import inspect, text

from app.database import Base, engine, UPLOAD_DIR, SessionLocal
from app.models import *  # noqa: F401,F403 — register all models
from app.utils.auth import hash_password
from app.routes import auth, branches, expenses, hr, dashboard, cash, export, email, users, renewals, eos

app = FastAPI(title="HRM System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(branches.router)
app.include_router(expenses.router)
app.include_router(hr.router)
app.include_router(dashboard.router)
app.include_router(cash.router)
app.include_router(export.router)
app.include_router(email.router)
app.include_router(users.router)
app.include_router(renewals.router)
app.include_router(eos.router)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static_frontend")
if not os.path.isdir(FRONTEND_DIST):
    FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "frontend", "dist")
FRONTEND_DIST = os.path.abspath(FRONTEND_DIST)

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="frontend-assets")

    NO_CACHE = {"Cache-Control": "no-cache, no-store, must-revalidate"}

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path) and not file_path.endswith("index.html"):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"), headers=NO_CACHE)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    _seed_data()
    _seed_renewals()


# Columns added after the initial schema; create_all() does not alter existing tables.
_ADDED_COLUMNS = [
    ("users", "expires_at", "TIMESTAMP"),
]


def _ensure_columns():
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl_type in _ADDED_COLUMNS:
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))


def _seed_renewals():
    from app.routes.renewals import seed_renewals
    db = SessionLocal()
    try:
        seed_renewals(db)
    finally:
        db.close()


def _seed_data():
    """First-run seed: one company, head office + admin branch, owner login, expense categories."""
    from app.models.branch import Branch
    from app.models.hr import Brand
    from app.models.user import User
    from app.models.expense import ExpenseCategory

    db = SessionLocal()
    try:
        if db.query(Branch).count() > 0:
            return

        brand = Brand(name_en=os.environ.get("HRM_COMPANY_NAME", "Company"),
                      name_ar=os.environ.get("HRM_COMPANY_NAME_AR", "الشركة"))
        db.add(brand)
        db.commit()

        for name, name_ar, ho in [
            ("Head Office", "المكتب الرئيسي", True),
            ("Administration", "الإدارة", False),
        ]:
            db.add(Branch(name=name, name_ar=name_ar, is_head_office=ho, brand_id=brand.id))
        db.commit()

        db.add(User(
            username=os.environ.get("HRM_ADMIN_USER", "admin"),
            password_hash=hash_password(os.environ.get("HRM_ADMIN_PASSWORD", "admin123")),
            full_name="System Administrator", role="owner", branch_id=None,
        ))

        for name, name_ar in [
            ("Salaries", "رواتب"), ("Government Fees", "رسوم حكومية"),
            ("Medical", "طبي"), ("Travel & Tickets", "سفر وتذاكر"),
            ("Office Supplies", "مستلزمات مكتبية"), ("Utilities", "مرافق"),
            ("Rent", "إيجار"), ("Maintenance", "صيانة"), ("Other", "أخرى"),
        ]:
            db.add(ExpenseCategory(name=name, name_ar=name_ar))
        db.commit()
    finally:
        db.close()
