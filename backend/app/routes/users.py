from fastapi import APIRouter, Depends, HTTPException, Form, Body
from sqlalchemy.orm import Session
from typing import Optional
import json

from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def _parse_brands(raw: Optional[str]) -> Optional[list[int]]:
    """Parse a comma-separated brand id string. Empty/None -> None (all/derive)."""
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return None
    ids = []
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    return ids or None


@router.get("/")
def list_users(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    users = db.query(User).order_by(User.id).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "branch_id": u.branch_id,
            "is_active": u.is_active,
            "allowed_tabs": u.get_allowed_tabs(),
            "allowed_brands": u.get_allowed_brands(),
        }
        for u in users
    ]


@router.post("/")
def create_user(
    username: str = Form(...),
    password: str = Form(...),
    full_name: str = Form(...),
    role: str = Form("staff"),
    branch_id: Optional[int] = Form(None),
    allowed_brands: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "owner":
        raise HTTPException(403, "Only owner can create users")
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(400, "Username already exists")
    new_user = User(
        username=username,
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
        branch_id=branch_id if role == "staff" else None,
        is_active=True,
    )
    new_user.set_allowed_brands(_parse_brands(allowed_brands))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username, "message": "User created"}


@router.put("/{user_id}")
def update_user(
    user_id: int,
    username: str = Form(None),
    password: str = Form(None),
    full_name: str = Form(None),
    role: str = Form(None),
    branch_id: Optional[str] = Form(None),
    allowed_brands: Optional[str] = Form(None),
    is_active: str = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "owner":
        raise HTTPException(403, "Only owner can edit users")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if username:
        dup = db.query(User).filter(User.username == username, User.id != user_id).first()
        if dup:
            raise HTTPException(400, "Username already exists")
        target.username = username
    if password:
        target.password_hash = hash_password(password)
    if full_name:
        target.full_name = full_name
    if role:
        target.role = role
        if role != "staff":
            target.branch_id = None
    if branch_id is not None:
        target.branch_id = int(branch_id) if branch_id and branch_id != "null" else None
    if is_active is not None:
        target.is_active = is_active.lower() in ("true", "1", "yes")
    if allowed_brands is not None:
        target.set_allowed_brands(_parse_brands(allowed_brands))
    db.commit()
    return {"message": "User updated"}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "owner":
        raise HTTPException(403, "Only owner can delete users")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "Cannot delete yourself")
    db.delete(target)
    db.commit()
    return {"message": "User deleted"}


@router.put("/{user_id}/permissions")
def update_user_permissions(
    user_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "owner":
        raise HTTPException(403, "Only owner can manage permissions")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    tabs = payload.get("allowed_tabs")
    if tabs is not None and not isinstance(tabs, list):
        raise HTTPException(400, "allowed_tabs must be a list or null")
    target.set_allowed_tabs(tabs)
    db.commit()
    return {"message": "Permissions updated", "allowed_tabs": target.get_allowed_tabs()}
