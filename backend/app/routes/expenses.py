from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional
import os, uuid

from app.database import get_db, UPLOAD_DIR
from app.models.expense import ExpenseCategory, Expense
from app.models.branch import Branch
from app.models.user import User
from app.utils.auth import get_current_user
from app.routes.hr import _brand_branch_ids
from app.utils.dates import apply_date_range

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return db.query(ExpenseCategory).filter(ExpenseCategory.is_active == True).all()


@router.post("/categories")
def create_category(name: str = Form(...), name_ar: str = Form(""),
                    db: Session = Depends(get_db), _=Depends(get_current_user)):
    cat = ExpenseCategory(name=name, name_ar=name_ar)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Only owner/manager can manage categories")
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == category_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    cat.is_active = False
    db.commit()
    return {"status": "deleted"}


@router.get("/")
def list_expenses(branch_id: Optional[int] = None, brand_id: Optional[int] = None,
                  date_from: Optional[str] = None, date_to: Optional[str] = None,
                  db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    q = db.query(Expense)
    bb_ids = _brand_branch_ids(db, brand_id)
    if user.role == "staff" and user.branch_id:
        # Branch staff only ever see their own branch's expenses
        q = q.filter(Expense.branch_id == user.branch_id)
    elif branch_id:
        q = q.filter(Expense.branch_id == branch_id)
    elif bb_ids is not None:
        q = q.filter(Expense.branch_id.in_(bb_ids))
    if user.role in ("personnel", "personnel_manager"):
        q = q.filter(Expense.renewal_request_id.isnot(None))
    q = apply_date_range(q, Expense.date, date_from, date_to)
    return q.order_by(Expense.date.desc()).all()


@router.post("/")
def create_expense(
    branch_id: int = Form(...), expense_date: str = Form(...),
    description: str = Form(...), amount: float = Form(...),
    category_id: Optional[int] = Form(None),
    payment_method: str = Form("cash"), notes: str = Form(""),
    attachment: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    attachment_path = None
    if attachment and attachment.filename:
        ext = os.path.splitext(attachment.filename)[1]
        fname = f"{uuid.uuid4().hex}{ext}"
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
            f.write(attachment.file.read())
        attachment_path = fname

    exp = Expense(
        branch_id=branch_id, category_id=category_id,
        date=date.fromisoformat(expense_date),
        description=description, amount=amount,
        payment_method=payment_method, notes=notes,
        attachment_path=attachment_path, created_by=user.id,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    return exp


@router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    branch_id: int = Form(...), expense_date: str = Form(...),
    description: str = Form(...), amount: float = Form(...),
    category_id: Optional[int] = Form(None),
    payment_method: str = Form("cash"), notes: str = Form(""),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        from fastapi import HTTPException
        raise HTTPException(404, "Expense not found")
    if exp.contract_payment_id:
        from fastapi import HTTPException
        raise HTTPException(400, "This expense is managed from Contracts & Subscriptions")
    if exp.renewal_request_id:
        from fastapi import HTTPException
        raise HTTPException(400, "This expense is managed from HR Documents & Renewals")
    if exp.salary_payment_id:
        from fastapi import HTTPException
        raise HTTPException(400, "This expense is managed from HR Payroll")
    exp.branch_id = branch_id
    exp.category_id = category_id
    exp.date = date.fromisoformat(expense_date)
    exp.description = description
    exp.amount = amount
    exp.payment_method = payment_method
    exp.notes = notes or None
    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        from fastapi import HTTPException
        raise HTTPException(403, "Only owner/manager can delete expenses")
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        from fastapi import HTTPException
        raise HTTPException(404, "Expense not found")
    if exp.contract_payment_id:
        from fastapi import HTTPException
        raise HTTPException(400, "This expense is managed from Contracts & Subscriptions")
    if exp.renewal_request_id:
        from fastapi import HTTPException
        raise HTTPException(400, "This expense is managed from HR Documents & Renewals")
    if exp.salary_payment_id:
        from fastapi import HTTPException
        raise HTTPException(400, "This expense is managed from HR Payroll")
    db.delete(exp)
    db.commit()
    return {"ok": True}


