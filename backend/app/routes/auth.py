from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.branch import Branch
from app.models.hr import Brand
from app.utils.auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def resolve_allowed_brands(db: Session, user: User) -> list[int] | None:
    """Effective brand ids the user may access. None = all brands.

    - Explicit allowed_brands takes precedence for any role.
    - Otherwise owner/manager/accountant get all brands (None).
    - Staff otherwise derive their single brand from their branch.
    """
    explicit = user.get_allowed_brands()
    if explicit:
        return explicit
    if user.role in ("owner", "manager", "accountant"):
        return None
    if user.branch_id:
        branch = db.query(Branch).filter(Branch.id == user.branch_id).first()
        if branch is not None and branch.brand_id:
            return [branch.brand_id]
    return None


def _user_payload(db: Session, user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "branch_id": user.branch_id,
        "allowed_tabs": user.get_allowed_tabs(),
        "allowed_brands": resolve_allowed_brands(db, user),
    }


@router.get("/brands")
def public_brands(db: Session = Depends(get_db)):
    """Active brands for the pre-login landing page (no auth required)."""
    rows = db.query(Brand).filter(Brand.status == "active").order_by(Brand.id).all()
    return [{"id": b.id, "name_en": b.name_en, "name_ar": b.name_ar or ""} for b in rows]


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token({"sub": str(user.id), "role": user.role, "branch_id": user.branch_id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_payload(db, user),
    }


@router.get("/me")
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _user_payload(db, user)
