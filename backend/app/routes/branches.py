from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.branch import Branch
from app.utils.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/branches", tags=["branches"])
ADMIN_ROLES = ("owner", "manager", "accountant")


def _out(b: Branch):
    return {"id": b.id, "name": b.name, "name_ar": b.name_ar or "",
            "brand_id": b.brand_id, "is_head_office": b.is_head_office,
            "is_active": b.is_active}


@router.get("/")
def list_branches(brand_id: Optional[int] = None, scope: Optional[str] = None,
                  db: Session = Depends(get_db)):
    q = db.query(Branch)
    if brand_id:
        q = q.filter(Branch.brand_id == brand_id)
    if scope == "personnel":
        q = q.filter(Branch.name.like("Personnel Office%"))
    elif scope == "operating":
        q = q.filter(~Branch.name.like("Personnel Office%"))
    return [_out(b) for b in q.all()]


@router.post("/")
def create_branch(name: str = Form(...), name_ar: str = Form(""),
                  is_head_office: bool = Form(False),
                  brand_id: Optional[int] = Form(None),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Not authorized")
    branch = Branch(name=name, name_ar=name_ar, is_head_office=is_head_office, brand_id=brand_id)
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return _out(branch)


@router.put("/{branch_id}")
def update_branch(branch_id: int, name: str = Form(...), name_ar: str = Form(""),
                  is_head_office: bool = Form(False),
                  brand_id: Optional[int] = Form(None),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Not authorized")
    b = db.query(Branch).filter(Branch.id == branch_id).first()
    if not b:
        raise HTTPException(404, "Branch not found")
    b.name = name
    b.name_ar = name_ar
    b.is_head_office = is_head_office
    b.brand_id = brand_id
    db.commit()
    return _out(b)


@router.delete("/{branch_id}")
def delete_branch(branch_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Not authorized")
    b = db.query(Branch).filter(Branch.id == branch_id).first()
    if not b:
        raise HTTPException(404, "Branch not found")
    db.delete(b)
    db.commit()
    return {"message": "Branch deleted"}
