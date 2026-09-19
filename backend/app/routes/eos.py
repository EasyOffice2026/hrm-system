from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.eos import EosSettlement
from app.models.hr import Employee, AdvanceLoan, LeaveRecord, SalaryPayment, Resignation
from app.models.branch import Branch
from app.models.user import User
from app.utils.auth import get_current_user
from app.utils.kuwait_eos import EosInput, calculate, accrued_leave_days
from app.routes.hr import _brand_branch_ids

router = APIRouter(prefix="/api/eos", tags=["end-of-service"])

EOS_ROLES = ("owner", "manager", "accountant", "personnel_manager")
EOS_VIEW_ROLES = EOS_ROLES + ("personnel",)


def _require(user: User, roles=EOS_ROLES):
    if user.role not in roles:
        raise HTTPException(403, "Not authorized for End of Service")


class EosIn(BaseModel):
    employee_id: int
    join_date: Optional[str] = None
    last_working_date: str
    termination_type: str = "resignation"
    contract_type: str = "indefinite"
    pay_basis: str = "monthly"
    is_kuwaiti: bool = False
    monthly_wage: Optional[float] = None
    days_divisor: int = 26
    unpaid_leave_days: int = 0
    leave_balance_days: Optional[float] = None
    notice_days_due: int = 0
    notice_days_short: int = 0
    pending_salary: float = 0
    other_earnings: float = 0
    ticket_amount: float = 0
    loan_balance: Optional[float] = None
    pifss_adjustment: float = 0
    other_deductions: float = 0
    resignation_id: Optional[int] = None
    notes: Optional[str] = None


def _employee_defaults(db: Session, emp: Employee, last_working: date) -> dict:
    """Pre-fill wage, loan balance and leave balance from HR records."""
    wage = emp.actual_salary or emp.salary or emp.work_permit_salary or 0
    last_slip = db.query(SalaryPayment).filter(SalaryPayment.employee_id == emp.id).order_by(
        SalaryPayment.month.desc()).first()
    if last_slip:
        wage = (last_slip.basic_salary or 0) + (last_slip.housing_allowance or 0) + \
               (last_slip.transport_allowance or 0) + (last_slip.food_allowance or 0) + (last_slip.other_allowance or 0)
        if wage <= 0:
            wage = emp.actual_salary or emp.salary or 0
    loan_balance = db.query(func.coalesce(func.sum(AdvanceLoan.balance), 0)).filter(
        AdvanceLoan.employee_id == emp.id, AdvanceLoan.status == "active",
        AdvanceLoan.approval_status == "approved").scalar() or 0
    taken = db.query(func.coalesce(func.sum(LeaveRecord.days), 0)).filter(
        LeaveRecord.employee_id == emp.id, LeaveRecord.leave_type == "annual_leave",
        LeaveRecord.approval_status == "approved").scalar() or 0
    leave_balance = accrued_leave_days(emp.join_date, last_working, float(taken)) if emp.join_date else 0
    return {"monthly_wage": float(wage), "loan_balance": float(loan_balance),
            "leave_balance_days": leave_balance, "annual_leave_taken": float(taken)}


def _build_input(db: Session, body: EosIn) -> tuple[Employee, EosInput, dict]:
    emp = db.query(Employee).filter(Employee.id == body.employee_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    last_working = date.fromisoformat(body.last_working_date)
    join = date.fromisoformat(body.join_date) if body.join_date else emp.join_date
    if not join:
        raise HTTPException(400, "Employee has no join date")
    defaults = _employee_defaults(db, emp, last_working)
    inp = EosInput(
        join_date=join, last_working_date=last_working,
        monthly_wage=body.monthly_wage if body.monthly_wage is not None else defaults["monthly_wage"],
        termination_type=body.termination_type, contract_type=body.contract_type,
        pay_basis=body.pay_basis, is_kuwaiti=body.is_kuwaiti, days_divisor=body.days_divisor,
        unpaid_leave_days=body.unpaid_leave_days,
        leave_balance_days=body.leave_balance_days if body.leave_balance_days is not None else defaults["leave_balance_days"],
        notice_days_due=body.notice_days_due, notice_days_short=body.notice_days_short,
        pending_salary=body.pending_salary, other_earnings=body.other_earnings, ticket_amount=body.ticket_amount,
        loan_balance=body.loan_balance if body.loan_balance is not None else defaults["loan_balance"],
        pifss_adjustment=body.pifss_adjustment, other_deductions=body.other_deductions,
    )
    return emp, inp, defaults


def _out(db: Session, s: EosSettlement, emp: Optional[Employee] = None, branches: Optional[dict] = None):
    emp = emp or db.query(Employee).filter(Employee.id == s.employee_id).first()
    branches = branches or {b.id: b for b in db.query(Branch).all()}
    br = branches.get(s.branch_id)
    d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
    for k in ("join_date", "last_working_date", "paid_date"):
        d[k] = str(d[k]) if d[k] else None
    for k in ("created_at", "approved_at"):
        d[k] = d[k].isoformat() if d[k] else None
    d["employee_name"] = emp.name if emp else ""
    d["employee_name_ar"] = emp.name_ar if emp else ""
    d["staff_no"] = emp.staff_no if emp else ""
    d["civil_id"] = emp.civil_id if emp else ""
    d["position"] = emp.position if emp else ""
    d["branch_name"] = br.name if br else ""
    d["branch_name_ar"] = br.name_ar if br else ""
    return d


@router.get("/defaults/{employee_id}")
def eos_defaults(employee_id: int, last_working_date: Optional[str] = None,
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, EOS_VIEW_ROLES)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    lw = date.fromisoformat(last_working_date) if last_working_date else (emp.last_working_date or date.today())
    d = _employee_defaults(db, emp, lw)
    d.update({"join_date": str(emp.join_date) if emp.join_date else None, "last_working_date": str(lw),
              "employee_name": emp.name, "branch_id": emp.branch_id})
    return d


@router.post("/calculate")
def eos_calculate(body: EosIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, EOS_VIEW_ROLES)
    emp, inp, defaults = _build_input(db, body)
    try:
        res = calculate(inp)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"employee_id": emp.id, "employee_name": emp.name, "inputs": {
        **{k: (str(v) if isinstance(v, date) else v) for k, v in inp.__dict__.items()}}, "defaults": defaults,
        **res.dict()}


@router.get("/")
def list_settlements(brand_id: Optional[int] = None, branch_id: Optional[int] = None, status: Optional[str] = None,
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, EOS_VIEW_ROLES)
    q = db.query(EosSettlement)
    if branch_id:
        q = q.filter(EosSettlement.branch_id == branch_id)
    else:
        bb = _brand_branch_ids(db, brand_id)
        if bb is not None:
            q = q.filter(EosSettlement.branch_id.in_(bb))
    if status:
        q = q.filter(EosSettlement.status == status)
    rows = q.order_by(EosSettlement.id.desc()).all()
    emps = {e.id: e for e in db.query(Employee).all()}
    branches = {b.id: b for b in db.query(Branch).all()}
    return [_out(db, s, emps.get(s.employee_id), branches) for s in rows]


@router.get("/{settlement_id}")
def get_settlement(settlement_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, EOS_VIEW_ROLES)
    s = db.query(EosSettlement).filter(EosSettlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    return _out(db, s)


def _apply(s: EosSettlement, inp: EosInput, res, body: EosIn):
    s.join_date = inp.join_date
    s.last_working_date = inp.last_working_date
    s.termination_type = inp.termination_type
    s.contract_type = inp.contract_type
    s.pay_basis = inp.pay_basis
    s.is_kuwaiti = inp.is_kuwaiti
    s.monthly_wage = inp.monthly_wage
    s.days_divisor = inp.days_divisor
    s.daily_rate = res.daily_rate
    s.service_years = res.service_years
    s.service_days = res.service_days
    s.unpaid_leave_days = inp.unpaid_leave_days
    s.gratuity_first5_days = res.gratuity_first5_days
    s.gratuity_after5_days = res.gratuity_after5_days
    s.gratuity_gross = res.gratuity_gross
    s.entitlement_fraction = res.entitlement_fraction
    s.gratuity_capped = res.gratuity_capped
    s.gratuity_amount = res.gratuity_amount
    s.leave_balance_days = inp.leave_balance_days
    s.leave_encashment = res.leave_encashment
    s.notice_days_due = inp.notice_days_due
    s.notice_pay = res.notice_pay
    s.pending_salary = inp.pending_salary
    s.other_earnings = inp.other_earnings
    s.ticket_amount = inp.ticket_amount
    s.loan_balance = inp.loan_balance
    s.pifss_adjustment = inp.pifss_adjustment if inp.is_kuwaiti else 0
    s.notice_deduction = res.notice_deduction
    s.other_deductions = inp.other_deductions
    s.total_earnings = res.total_earnings
    s.total_deductions = res.total_deductions
    s.net_settlement = res.net_settlement
    s.resignation_id = body.resignation_id
    s.notes = body.notes


def _next_ref(db: Session) -> str:
    n = (db.query(func.count(EosSettlement.id)).scalar() or 0) + 1
    return f"EOS-{date.today().year}-{n:04d}"


@router.post("/")
def create_settlement(body: EosIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    emp, inp, _ = _build_input(db, body)
    try:
        res = calculate(inp)
    except ValueError as e:
        raise HTTPException(400, str(e))
    s = EosSettlement(employee_id=emp.id, branch_id=emp.branch_id, created_by=user.id, ref_no=_next_ref(db))
    _apply(s, inp, res, body)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _out(db, s, emp)


@router.put("/{settlement_id}")
def update_settlement(settlement_id: int, body: EosIn, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    _require(user)
    s = db.query(EosSettlement).filter(EosSettlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    if s.status in ("paid", "cancelled"):
        raise HTTPException(400, f"Settlement is {s.status}")
    emp, inp, _ = _build_input(db, body)
    try:
        res = calculate(inp)
    except ValueError as e:
        raise HTTPException(400, str(e))
    s.employee_id = emp.id
    s.branch_id = emp.branch_id
    _apply(s, inp, res, body)
    db.commit()
    return _out(db, s, emp)


@router.post("/{settlement_id}/approve")
def approve_settlement(settlement_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, ("owner", "manager", "accountant"))
    s = db.query(EosSettlement).filter(EosSettlement.id == settlement_id).first()
    if not s or s.status != "draft":
        raise HTTPException(400, "Only draft settlements can be approved")
    s.status = "approved"
    s.approved_by = user.id
    s.approved_at = datetime.now(timezone.utc)
    if s.resignation_id:
        r = db.query(Resignation).filter(Resignation.id == s.resignation_id).first()
        if r:
            r.end_of_service = s.gratuity_amount
            r.leave_encashment = s.leave_encashment
            r.other_earnings = (s.other_earnings or 0) + (s.notice_pay or 0) + (s.ticket_amount or 0)
            r.deductions_amount = s.loan_balance or 0
            r.other_deductions = (s.other_deductions or 0) + (s.notice_deduction or 0) + (s.pifss_adjustment or 0)
            r.last_salary_paid_amount = s.pending_salary or 0
            r.final_settlement_amount = s.net_settlement
            r.final_settlement_calculated = True
    db.commit()
    return _out(db, s)


@router.post("/{settlement_id}/pay")
def pay_settlement(settlement_id: int, payment_method: str = "bank_transfer", paid_date: Optional[str] = None,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, ("owner", "manager", "accountant"))
    s = db.query(EosSettlement).filter(EosSettlement.id == settlement_id).first()
    if not s or s.status != "approved":
        raise HTTPException(400, "Settlement must be approved before payment")
    s.status = "paid"
    s.payment_method = payment_method
    s.paid_date = date.fromisoformat(paid_date) if paid_date else date.today()
    emp = db.query(Employee).filter(Employee.id == s.employee_id).first()
    if emp:
        emp.last_working_date = s.last_working_date
        emp.termination_date = emp.termination_date or s.last_working_date
        emp.is_active = False
        for loan in db.query(AdvanceLoan).filter(AdvanceLoan.employee_id == emp.id, AdvanceLoan.status == "active").all():
            loan.balance = 0
            loan.status = "paid_off"
    if s.resignation_id:
        r = db.query(Resignation).filter(Resignation.id == s.resignation_id).first()
        if r:
            r.final_salary_paid = True
            r.status = "completed"
    db.commit()
    return _out(db, s, emp)


@router.post("/{settlement_id}/cancel")
def cancel_settlement(settlement_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    s = db.query(EosSettlement).filter(EosSettlement.id == settlement_id).first()
    if not s or s.status == "paid":
        raise HTTPException(400, "Paid settlements cannot be cancelled")
    s.status = "cancelled"
    db.commit()
    return _out(db, s)


@router.delete("/{settlement_id}")
def delete_settlement(settlement_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, ("owner", "manager"))
    s = db.query(EosSettlement).filter(EosSettlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    if s.status == "paid":
        raise HTTPException(400, "Paid settlements cannot be deleted")
    db.delete(s)
    db.commit()
    return {"ok": True}
