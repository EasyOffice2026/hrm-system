from typing import Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.expense import Expense
from app.models.hr import Employee, SalaryPayment, LeaveRecord, Resignation, Attendance
from app.models.branch import Branch
from app.models.renewal import EmployeeDocument, CompanyLicense, RenewalRequest
from app.models.cash import CashTransaction
from app.models.user import User
from app.utils.auth import get_current_user
from app.routes.hr import _brand_branch_ids, _exclude_left_employees
from app.utils.dates import apply_date_range

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _cash_balance(db: Session, branch_id: int) -> float:
    rows = db.query(CashTransaction).filter(CashTransaction.branch_id == branch_id).order_by(
        CashTransaction.date.asc(), CashTransaction.id.asc()).all()
    bal = 0.0
    for r in rows:
        if r.txn_type == "opening_balance":
            bal = r.amount
        elif r.category == "deposit" or r.txn_type == "cash_out":
            bal -= r.amount
        else:
            bal += r.amount
    return round(bal, 3)


@router.get("/")
def dashboard(branch_id: Optional[int] = None, brand_id: Optional[int] = None,
              date_from: Optional[str] = None, date_to: Optional[str] = None,
              db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    bb_ids = _brand_branch_ids(db, brand_id)
    staff_bid = branch_id or (user.branch_id if user.role == "staff" else None)

    def apply_branch(q, model):
        if staff_bid:
            q = q.filter(model.branch_id == staff_bid)
        elif bb_ids is not None:
            q = q.filter(model.branch_id.in_(bb_ids))
        return q

    today = date.today()
    month = today.strftime("%Y-%m")
    soon = today + timedelta(days=60)

    emp_q = _exclude_left_employees(apply_branch(db.query(Employee), Employee))
    employees = emp_q.all()
    emp_ids = [e.id for e in employees]
    employee_count = len(employees)

    payroll_q = apply_branch(db.query(SalaryPayment).filter(SalaryPayment.month == month), SalaryPayment)
    payroll_rows = payroll_q.all()
    payroll_total = round(sum(p.net_salary or 0 for p in payroll_rows), 3)
    payroll_paid = round(sum(p.net_salary or 0 for p in payroll_rows if p.status == "paid"), 3)

    total_expenses = apply_date_range(apply_branch(
        db.query(func.coalesce(func.sum(Expense.amount), 0)), Expense), Expense.date, date_from, date_to,
    ).scalar() or 0

    present_today = db.query(func.count(Attendance.id)).filter(
        Attendance.date == today, Attendance.status == "present",
        Attendance.employee_id.in_(emp_ids) if emp_ids else False).scalar() or 0

    pending_leaves = db.query(func.count(LeaveRecord.id)).filter(
        LeaveRecord.approval_status == "pending_approval",
        LeaveRecord.employee_id.in_(emp_ids) if emp_ids else False).scalar() or 0
    on_leave_today = db.query(func.count(LeaveRecord.id)).filter(
        LeaveRecord.approval_status == "approved", LeaveRecord.start_date <= today, LeaveRecord.end_date >= today,
        LeaveRecord.employee_id.in_(emp_ids) if emp_ids else False).scalar() or 0

    open_resignations = db.query(func.count(Resignation.id)).filter(
        Resignation.status.in_(["draft", "submitted", "approved"]),
        Resignation.employee_id.in_(emp_ids) if emp_ids else False).scalar() or 0

    docs_q = db.query(EmployeeDocument).filter(EmployeeDocument.status == "active",
                                                EmployeeDocument.expiry_date != None)
    if emp_ids:
        docs_q = docs_q.filter(EmployeeDocument.employee_id.in_(emp_ids))
    else:
        docs_q = docs_q.filter(False)
    docs_expiring = docs_q.filter(EmployeeDocument.expiry_date <= soon, EmployeeDocument.expiry_date >= today).count()
    docs_expired = docs_q.filter(EmployeeDocument.expiry_date < today).count()

    lic_q = db.query(CompanyLicense).filter(CompanyLicense.status == "active", CompanyLicense.expiry_date != None)
    if bb_ids is not None:
        lic_q = lic_q.filter((CompanyLicense.brand_id == brand_id) | (CompanyLicense.branch_id.in_(bb_ids)))
    licenses_expiring = lic_q.filter(CompanyLicense.expiry_date <= soon).count()

    req_q = db.query(func.count(RenewalRequest.id)).filter(RenewalRequest.status.in_(["submitted", "approved"]))
    if brand_id:
        req_q = req_q.filter(RenewalRequest.brand_id == brand_id)
    pending_renewals = req_q.scalar() or 0

    if staff_bid:
        branches = db.query(Branch).filter(Branch.id == staff_bid).all()
    elif bb_ids is not None:
        branches = db.query(Branch).filter(Branch.id.in_(bb_ids)).all()
    else:
        branches = db.query(Branch).all()

    branch_data = []
    for b in branches:
        b_emps = [e for e in employees if e.branch_id == b.id]
        b_payroll = sum(p.net_salary or 0 for p in payroll_rows if p.branch_id == b.id)
        b_expenses = apply_date_range(db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
            Expense.branch_id == b.id), Expense.date, date_from, date_to).scalar() or 0
        branch_data.append({
            "branch_id": b.id,
            "branch_name": b.name,
            "branch_name_ar": b.name_ar,
            "employees": len(b_emps),
            "payroll": round(b_payroll, 3),
            "expenses": round(float(b_expenses), 3),
            "cash_balance": _cash_balance(db, b.id),
        })

    return {
        "month": month,
        "employee_count": employee_count,
        "present_today": present_today,
        "on_leave_today": on_leave_today,
        "pending_leaves": pending_leaves,
        "payroll_total": payroll_total,
        "payroll_paid": payroll_paid,
        "payroll_pending": round(payroll_total - payroll_paid, 3),
        "total_expenses": float(total_expenses),
        "open_resignations": open_resignations,
        "documents_expiring": docs_expiring,
        "documents_expired": docs_expired,
        "licenses_expiring": licenses_expiring,
        "pending_renewals": pending_renewals,
        "branch_data": branch_data,
    }
