from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from datetime import date, time
from typing import Optional
import calendar

from app.database import get_db
from app.models.hr import Brand, Employee, Attendance, SalaryPayment, StaffTransfer, AdvanceLoan, LoanRepayment, StaffBenefitDeduction, LeaveRecord, Resignation, Contract, ContractPayment, Employer
from app.models.branch import Branch
from app.models.expense import Expense, ExpenseCategory
from app.models.user import User
from app.models.renewal import EmployeeDocument, RenewalRequest
from app.models.eos import EosSettlement
from app.utils.auth import get_current_user

EMPLOYEE_DEPENDENTS = (
    Attendance, SalaryPayment, StaffTransfer, AdvanceLoan, StaffBenefitDeduction,
    LeaveRecord, Resignation, EmployeeDocument, RenewalRequest, EosSettlement,
)

def _personnel_read_only(request: Request, user: User = Depends(get_current_user)):
    if user.role in ("personnel", "personnel_manager") and request.method not in ("GET", "HEAD", "OPTIONS"):
        raise HTTPException(403, "Personnel Officer has view-only access to Human Resources")


router = APIRouter(prefix="/api/hr", tags=["hr"], dependencies=[Depends(_personnel_read_only)])

SALARY_VISIBLE_ROLES = ("owner", "manager", "accountant")


def _brand_branch_ids(db: Session, brand_id: Optional[int]) -> Optional[list]:
    """Return list of branch IDs for a brand, or None if no filter."""
    if not brand_id:
        return None
    ids = [b.id for b in db.query(Branch).filter(Branch.brand_id == brand_id).all()]
    return ids


def _exclude_left_employees(q):
    """Hide employees whose last working / termination date has already passed."""
    left_on = func.coalesce(Employee.last_working_date, Employee.termination_date)
    return q.filter(
        Employee.is_active == True,
        or_(left_on == None, left_on >= date.today()),
    )


def _staff_branch_id(user) -> Optional[int]:
    """Branch id a user is restricted to (branch staff only), else None."""
    if user is not None and user.role == "staff" and user.branch_id:
        return user.branch_id
    return None


def _staff_emp_ids(db: Session, user) -> Optional[list]:
    """Employee ids in a branch-staff user's own branch, else None (no filter)."""
    bid = _staff_branch_id(user)
    if bid is None:
        return None
    return [e.id for e in db.query(Employee.id).filter(Employee.branch_id == bid).all()]


# --- Brands ---
@router.get("/brands")
def list_brands(all: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Brand)
    allowed = user.get_allowed_brands()
    if all:
        # Cross-brand transfers need every brand as a possible source/destination,
        # regardless of which brands the user is scoped to.
        rows = q.filter(Brand.status == "active").order_by(Brand.id).all()
        return [{"id": b.id, "name_en": b.name_en, "name_ar": b.name_ar or "",
                 "status": b.status or "active"} for b in rows]
    if allowed:
        q = q.filter(Brand.id.in_(allowed))
    else:
        sbid = _staff_branch_id(user)
        if sbid is not None:
            branch = db.query(Branch).filter(Branch.id == sbid).first()
            if branch is not None and branch.brand_id:
                q = q.filter(Brand.id == branch.brand_id)
            else:
                q = q.filter(False)
    rows = q.order_by(Brand.id).all()
    return [{"id": b.id, "name_en": b.name_en, "name_ar": b.name_ar or "",
             "status": b.status or "active"} for b in rows]


@router.post("/brands")
def create_brand(
    name_en: str = Form(...), name_ar: str = Form(""),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role != "owner":
        raise HTTPException(403, "Only owner can create brands")
    existing = db.query(Brand).filter(Brand.name_en == name_en).first()
    if existing:
        raise HTTPException(400, f"Brand '{name_en}' already exists")
    b = Brand(name_en=name_en, name_ar=name_ar or None)
    db.add(b)
    db.commit()
    db.refresh(b)
    return {"id": b.id, "name_en": b.name_en, "name_ar": b.name_ar or "", "status": b.status}


@router.put("/brands/{brand_id}")
def update_brand(
    brand_id: int,
    name_en: str = Form(...), name_ar: str = Form(""),
    status: str = Form("active"),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role != "owner":
        raise HTTPException(403, "Only owner can edit brands")
    b = db.query(Brand).filter(Brand.id == brand_id).first()
    if not b:
        raise HTTPException(404, "Brand not found")
    b.name_en = name_en
    b.name_ar = name_ar or None
    b.status = status
    db.commit()
    return {"id": b.id, "name_en": b.name_en, "name_ar": b.name_ar or "", "status": b.status}


@router.delete("/brands/{brand_id}")
def delete_brand(brand_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    if user.role != "owner":
        raise HTTPException(403, "Only owner can delete brands")
    b = db.query(Brand).filter(Brand.id == brand_id).first()
    if not b:
        raise HTTPException(404, "Brand not found")
    # Check no branches assigned
    branch_count = db.query(Branch).filter(Branch.brand_id == brand_id).count()
    if branch_count > 0:
        raise HTTPException(400, "Cannot delete brand with assigned branches")
    db.delete(b)
    db.commit()
    return {"ok": True}


# --- Employees ---
@router.get("/employees")
def list_employees(branch_id: Optional[int] = None, brand_id: Optional[int] = None,
                   include_left: bool = False,
                   db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    q = db.query(Employee)
    if not include_left:
        q = _exclude_left_employees(q)
    bb_ids = _brand_branch_ids(db, brand_id)
    if user.role == "staff" and user.branch_id:
        q = q.filter(Employee.branch_id == user.branch_id)
    elif branch_id:
        q = q.filter(Employee.branch_id == branch_id)
    elif bb_ids is not None:
        q = q.filter(Employee.branch_id.in_(bb_ids))
    rows = q.all()
    hide_salary = user.role not in SALARY_VISIBLE_ROLES
    result = []
    for emp in rows:
        d = {
            "id": emp.id, "staff_no": emp.staff_no or "",
            "branch_id": emp.branch_id, "name": emp.name, "name_ar": emp.name_ar or "",
            "civil_id": emp.civil_id or "", "position": emp.position or "",
            "phone": emp.phone or "",
            "salary": 0 if hide_salary else emp.salary,
            "work_permit_salary": emp.work_permit_salary or 0,
            "actual_salary": 0 if hide_salary else (emp.actual_salary or 0),
            "iban": emp.iban or "", "bank_name": emp.bank_name or "",
            "salary_transfer_method": emp.salary_transfer_method or "cash",
            "employer": emp.employer or "",
            "join_date": str(emp.join_date) if emp.join_date else "",
            "termination_date": str(emp.termination_date) if emp.termination_date else "",
            "last_working_date": str(emp.last_working_date) if emp.last_working_date else "",
            "residency_expiry": str(emp.residency_expiry) if emp.residency_expiry else "",
            "health_card_expiry": str(emp.health_card_expiry) if emp.health_card_expiry else "",
            "is_active": emp.is_active,
        }
        result.append(d)
    return result


@router.get("/employers")
def list_employers(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return managed employer list (no duplicates)."""
    rows = db.query(Employer).order_by(Employer.name).all()
    return [{"id": e.id, "name": e.name, "name_ar": e.name_ar or ""} for e in rows]


@router.post("/employers")
def create_employer(name: str = Form(...), name_ar: str = Form(""),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    name = name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    existing = db.query(Employer).filter(func.lower(Employer.name) == name.lower()).first()
    if existing:
        raise HTTPException(400, f"Employer '{name}' already exists")
    e = Employer(name=name, name_ar=name_ar.strip() or None)
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id, "name": e.name, "name_ar": e.name_ar or ""}


@router.delete("/employers/{employer_id}")
def delete_employer(employer_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    e = db.query(Employer).filter(Employer.id == employer_id).first()
    if not e:
        raise HTTPException(404, "Employer not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


@router.post("/employees")
def create_employee(
    branch_id: int = Form(...), name: str = Form(...),
    staff_no: str = Form(""), name_ar: str = Form(""),
    civil_id: str = Form(""), position: str = Form(""),
    phone: str = Form(""), salary: float = Form(0),
    work_permit_salary: float = Form(0),
    actual_salary: float = Form(0),
    iban: str = Form(""), bank_name: str = Form(""),
    salary_transfer_method: str = Form("cash"),
    employer: str = Form(""),
    join_date: str = Form(""),
    termination_date: str = Form(""),
    last_working_date: str = Form(""),
    residency_expiry: str = Form(""),
    health_card_expiry: str = Form(""),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        salary = actual_salary = 0
        if user.branch_id:
            branch_id = user.branch_id
    # Duplicate Civil ID check
    if civil_id and civil_id.strip():
        existing = db.query(Employee).filter(Employee.civil_id == civil_id.strip()).first()
        if existing:
            raise HTTPException(400, f"Employee with Civil ID {civil_id} already exists")
    # Auto-generate staff_no with Emp-XXX pattern
    import re as _re
    max_num = 0
    all_staff_nos = [e.staff_no for e in db.query(Employee.staff_no).all() if e.staff_no]
    for sn in all_staff_nos:
        m = _re.search(r'(\d+)$', sn)
        if m:
            max_num = max(max_num, int(m.group(1)))
    generated_staff_no = f"Emp-{max_num + 1:03d}"
    emp = Employee(
        branch_id=branch_id, name=name, staff_no=generated_staff_no,
        name_ar=name_ar, civil_id=civil_id, position=position, phone=phone,
        salary=salary, work_permit_salary=work_permit_salary,
        actual_salary=actual_salary,
        iban=iban or None, bank_name=bank_name or None,
        salary_transfer_method=salary_transfer_method, employer=employer or None,
        join_date=date.fromisoformat(join_date) if join_date else None,
        termination_date=date.fromisoformat(termination_date) if termination_date else None,
        last_working_date=date.fromisoformat(last_working_date) if last_working_date else None,
        residency_expiry=date.fromisoformat(residency_expiry) if residency_expiry else None,
        health_card_expiry=date.fromisoformat(health_card_expiry) if health_card_expiry else None,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@router.put("/employees/{emp_id}")
def update_employee(
    emp_id: int,
    branch_id: int = Form(...), name: str = Form(...),
    staff_no: str = Form(""), name_ar: str = Form(""),
    civil_id: str = Form(""), position: str = Form(""),
    phone: str = Form(""), salary: float = Form(0),
    work_permit_salary: float = Form(0),
    actual_salary: float = Form(0),
    iban: str = Form(""), bank_name: str = Form(""),
    salary_transfer_method: str = Form("cash"),
    employer: str = Form(""),
    join_date: str = Form(""),
    termination_date: str = Form(""),
    last_working_date: str = Form(""),
    residency_expiry: str = Form(""),
    health_card_expiry: str = Form(""),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    can_edit_salary = user.role in SALARY_VISIBLE_ROLES
    if not can_edit_salary and not (user.role == "staff" and user.branch_id):
        raise HTTPException(403, "Not authorized")
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    if not can_edit_salary and emp.branch_id != user.branch_id:
        raise HTTPException(403, "Not authorized")
    # Duplicate Civil ID check (exclude self)
    if civil_id and civil_id.strip():
        existing = db.query(Employee).filter(Employee.civil_id == civil_id.strip(), Employee.id != emp_id).first()
        if existing:
            raise HTTPException(400, f"Employee with Civil ID {civil_id} already exists")
    if can_edit_salary:
        emp.branch_id = branch_id
        emp.salary = salary
        emp.actual_salary = actual_salary
    emp.work_permit_salary = work_permit_salary
    emp.iban = iban or None
    emp.bank_name = bank_name or None
    emp.salary_transfer_method = salary_transfer_method
    emp.name = name
    emp.staff_no = staff_no or emp.staff_no
    emp.name_ar = name_ar
    emp.civil_id = civil_id
    emp.position = position
    emp.phone = phone
    emp.employer = employer or None
    emp.join_date = date.fromisoformat(join_date) if join_date else None
    emp.termination_date = date.fromisoformat(termination_date) if termination_date else None
    emp.last_working_date = date.fromisoformat(last_working_date) if last_working_date else None
    emp.residency_expiry = date.fromisoformat(residency_expiry) if residency_expiry else None
    emp.health_card_expiry = date.fromisoformat(health_card_expiry) if health_card_expiry else None
    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/employees/{emp_id}")
def delete_employee(
    emp_id: int,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in ("owner",):
        raise HTTPException(403, "Not authorized")
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    linked = [
        m.__tablename__ for m in EMPLOYEE_DEPENDENTS
        if db.query(m.id).filter(m.employee_id == emp_id).first()
    ]
    if linked:
        raise HTTPException(
            409,
            "Employee has linked records (" + ", ".join(linked) + "); mark as left instead of deleting",
        )
    db.delete(emp)
    db.commit()
    return {"message": "Deleted"}


# --- Attendance ---
@router.get("/attendance")
def list_attendance(employee_id: Optional[int] = None, att_date: Optional[str] = None,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Attendance)
    staff_emp_ids = _staff_emp_ids(db, user)
    if staff_emp_ids is not None:
        q = q.filter(Attendance.employee_id.in_(staff_emp_ids)) if staff_emp_ids else q.filter(False)
    if employee_id:
        q = q.filter(Attendance.employee_id == employee_id)
    if att_date:
        q = q.filter(Attendance.date == date.fromisoformat(att_date))
    return q.order_by(Attendance.date.desc()).all()


@router.post("/attendance")
def mark_attendance(
    employee_id: int = Form(...), att_date: str = Form(...),
    check_in: str = Form(""), check_out: str = Form(""),
    status: str = Form("absent"), notes: str = Form(""),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    att = Attendance(
        employee_id=employee_id, date=date.fromisoformat(att_date),
        check_in=time.fromisoformat(check_in) if check_in else None,
        check_out=time.fromisoformat(check_out) if check_out else None,
        status=status, notes=notes,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


SALARY_EXPENSE_CATEGORY = ("Salaries", "الرواتب")


def _admin_branch(db: Session, brand_id: Optional[int]) -> Optional[Branch]:
    """Administration branch of the brand (payroll expenses are booked here)."""
    q = db.query(Branch).filter(Branch.name.like("Administration%"))
    b = q.filter(Branch.brand_id == brand_id).order_by(Branch.id).first() if brand_id else None
    return b or q.order_by(Branch.id).first()


def _sync_salary_expense(db: Session, sp: SalaryPayment):
    """Mirror a paid salary as an Expense on the brand's Administration branch,
    keeping the payroll payment mode (cash reduces Administration petty cash;
    bank transfer is expense-only)."""
    exp = db.query(Expense).filter(Expense.salary_payment_id == sp.id).first()
    if sp.status != "paid":
        if exp:
            db.delete(exp)
        return
    emp = db.query(Employee).filter(Employee.id == sp.employee_id).first()
    emp_branch = db.query(Branch).filter(Branch.id == (emp.branch_id if emp else sp.branch_id)).first()
    admin = _admin_branch(db, emp_branch.brand_id if emp_branch else None)
    if not admin:
        return
    cat = db.query(ExpenseCategory).filter(func.lower(ExpenseCategory.name) == SALARY_EXPENSE_CATEGORY[0].lower()).first()
    if not cat:
        cat = ExpenseCategory(name=SALARY_EXPENSE_CATEGORY[0], name_ar=SALARY_EXPENSE_CATEGORY[1], is_active=True)
        db.add(cat)
        db.flush()
    if not exp:
        exp = Expense(salary_payment_id=sp.id)
        db.add(exp)
    exp.branch_id = admin.id
    exp.category_id = cat.id
    exp.date = sp.paid_date or date.today()
    exp.description = f"Salary {sp.month} — {emp.name if emp else ''}".strip(" —")
    exp.amount = round(sp.net_salary or 0, 3)
    exp.payment_method = "cash" if (sp.payment_method or "cash") == "cash" else "bank_transfer"
    exp.notes = f"Payroll · {emp_branch.name}" if emp_branch else "Payroll"


def _loan_repayments_for_month(db: Session, employee_id: int, month: str) -> float:
    """Sum of recorded Advance/Loan repayments that fall in the payroll month
    (by explicit month if set, otherwise by repayment date)."""
    year, mon = int(month.split("-")[0]), int(month.split("-")[1])
    m_start = date(year, mon, 1)
    m_end = date(year, mon, calendar.monthrange(year, mon)[1])
    loan_ids = [l.id for l in db.query(AdvanceLoan.id).filter(AdvanceLoan.employee_id == employee_id).all()]
    if not loan_ids:
        return 0.0
    total = db.query(func.coalesce(func.sum(LoanRepayment.amount), 0)).filter(
        LoanRepayment.loan_id.in_(loan_ids),
        or_(
            LoanRepayment.month == month,
            and_(
                or_(LoanRepayment.month.is_(None), LoanRepayment.month == ""),
                LoanRepayment.date >= m_start,
                LoanRepayment.date <= m_end,
            ),
        ),
    ).scalar() or 0
    return round(float(total), 3)


def _apply_loan_repayments_to_payroll(db: Session, employee_id: int, month: str):
    """Refresh loan_deduction on the pending salary record for this month."""
    sp = db.query(SalaryPayment).filter(
        SalaryPayment.employee_id == employee_id,
        SalaryPayment.month == month,
        SalaryPayment.status == "pending",
    ).first()
    if not sp:
        return
    new_ded = _loan_repayments_for_month(db, employee_id, month)
    delta = new_ded - (sp.loan_deduction or 0)
    if abs(delta) < 0.0005:
        return
    sp.loan_deduction = new_ded
    sp.net_salary = round((sp.net_salary or 0) - delta, 3)


def _calc_net(basic, total_days, days_worked,
              housing, transport, food, other_allow,
              absence_ded, late_ded, other_ded, advance,
              overtime=0, bonus=0, incentive=0, leave_salary=0,
              ticket_payment=0, loan_deduction=0, penalty=0):
    per_day = basic / total_days if total_days > 0 else 0
    earned_basic = round(per_day * days_worked, 3)
    total_allow = housing + transport + food + other_allow
    total_additions = overtime + bonus + incentive + leave_salary + ticket_payment
    total_deduct = absence_ded + late_ded + other_ded + loan_deduction + penalty
    net = earned_basic + total_allow + total_additions - total_deduct - advance
    return earned_basic, total_allow, total_deduct, round(net, 3)


# --- Salary Payments ---
@router.get("/salary")
def list_salary_payments(
    month: Optional[str] = None,
    employee_id: Optional[int] = None,
    brand_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized to view salary data")
    q = db.query(SalaryPayment)
    if month:
        q = q.filter(SalaryPayment.month == month)
    if employee_id:
        q = q.filter(SalaryPayment.employee_id == employee_id)
    bb_ids = _brand_branch_ids(db, brand_id)
    if bb_ids is not None:
        q = q.filter(SalaryPayment.branch_id.in_(bb_ids))
    rows = q.order_by(SalaryPayment.month.desc(), SalaryPayment.id).all()

    hide_salary = False

    # Get employee info for staff_no and position
    emp_ids = list({r.employee_id for r in rows})
    emps = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}

    # Filter out records for employees with 0 actual salary
    rows = [r for r in rows if (emps.get(r.employee_id) and (emps[r.employee_id].actual_salary or 0) > 0)]

    return [
        {
            "id": r.id, "employee_id": r.employee_id,
            "staff_no": emps.get(r.employee_id, Employee()).staff_no or "",
            "name": emps.get(r.employee_id, Employee()).name or "",
            "name_ar": emps.get(r.employee_id, Employee()).name_ar or "",
            "designation": emps.get(r.employee_id, Employee()).position or "",
            "current_actual_salary": emps.get(r.employee_id, Employee()).actual_salary or 0,
            "branch_id": emps[r.employee_id].branch_id if emps.get(r.employee_id) else r.branch_id, "month": r.month,
            "basic_salary": 0 if hide_salary else r.basic_salary,
            "total_days": r.total_days or 30,
            "days_worked": r.days_worked or 30,
            "period_start": str(r.period_start) if r.period_start else "",
            "period_end": str(r.period_end) if r.period_end else "",
            "last_workplace": r.last_workplace or "",
            "housing_allowance": 0 if hide_salary else (r.housing_allowance or 0),
            "transport_allowance": 0 if hide_salary else (r.transport_allowance or 0),
            "food_allowance": 0 if hide_salary else (r.food_allowance or 0),
            "other_allowance": 0 if hide_salary else (r.other_allowance or 0),
            "allowances": 0 if hide_salary else r.allowances,
            "overtime": 0 if hide_salary else (r.overtime or 0),
            "bonus": 0 if hide_salary else (r.bonus or 0),
            "incentive": 0 if hide_salary else (r.incentive or 0),
            "leave_salary": 0 if hide_salary else (r.leave_salary or 0),
            "ticket_payment": 0 if hide_salary else (r.ticket_payment or 0),
            "absence_deduction": 0 if hide_salary else (r.absence_deduction or 0),
            "late_deduction": 0 if hide_salary else (r.late_deduction or 0),
            "other_deduction": 0 if hide_salary else (r.other_deduction or 0),
            "loan_deduction": 0 if hide_salary else (r.loan_deduction or 0),
            "penalty": 0 if hide_salary else (r.penalty or 0),
            "deductions": 0 if hide_salary else r.deductions,
            "advance": 0 if hide_salary else r.advance,
            "net_salary": 0 if hide_salary else r.net_salary,
            "payment_method": r.payment_method,
            "status": r.status, "notes": r.notes,
            "paid_date": str(r.paid_date) if r.paid_date else None,
        }
        for r in rows
    ]


@router.post("/salary/generate")
def generate_monthly_payroll(
    month: str = Form(...),
    brand_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    year, mon = int(month.split("-")[0]), int(month.split("-")[1])
    last_day = calendar.monthrange(year, mon)[1]
    # Default to full month
    p_start = date(year, mon, 1)
    p_end = date(year, mon, last_day)
    total_days = 30  # salary basis always 30
    period_working_days = 30

    eq = db.query(Employee).filter(
        Employee.is_active == True,
        Employee.actual_salary > 0,
    )
    bb_ids = _brand_branch_ids(db, brand_id)
    if bb_ids is not None:
        eq = eq.filter(Employee.branch_id.in_(bb_ids))
    employees = eq.all()

    # Clean up old pending salary records for employees with 0 actual salary
    zero_salary_emps = db.query(Employee).filter(
        (Employee.actual_salary == None) | (Employee.actual_salary == 0)
    ).all()
    zero_ids = [e.id for e in zero_salary_emps]
    if zero_ids:
        db.query(SalaryPayment).filter(
            SalaryPayment.month == month,
            SalaryPayment.employee_id.in_(zero_ids),
            SalaryPayment.status == "pending",
        ).delete(synchronize_session=False)

    created = 0
    updated = 0
    skipped_resigned = []
    for emp in employees:
        # Skip employees whose last working date is before this payroll month
        if emp.last_working_date and emp.last_working_date < p_start:
            # Also clean up any existing pending salary record for this month
            old_rec = db.query(SalaryPayment).filter(
                SalaryPayment.employee_id == emp.id,
                SalaryPayment.month == month,
                SalaryPayment.status == "pending",
            ).first()
            if old_rec:
                db.delete(old_rec)
            skipped_resigned.append(emp.id)
            continue

        existing = db.query(SalaryPayment).filter(
            SalaryPayment.employee_id == emp.id,
            SalaryPayment.month == month,
        ).first()
        # Skip already-paid or on-hold records
        if existing and existing.status in ("paid", "on_hold"):
            continue

        # Determine effective period for this employee
        emp_period_start = p_start
        emp_period_end = p_end
        emp_period_days = period_working_days

        # If employee joined mid-month, start from join_date
        if emp.join_date and emp.join_date > p_start and emp.join_date <= p_end:
            emp_period_start = emp.join_date
            emp_period_days = (p_end - emp.join_date).days + 1
            emp_period_days = min(max(emp_period_days, 0), 30)

        # If employee has a last_working_date in this month, cap the period
        if emp.last_working_date and emp_period_start <= emp.last_working_date <= p_end:
            emp_period_end = emp.last_working_date
            emp_period_days = (emp.last_working_date - emp_period_start).days + 1
            emp_period_days = min(max(emp_period_days, 0), 30)

        # Auto-calculate leave/absence days for this month
        # Simple rule: any leave record whose dates overlap with this payroll month
        # No approval filter — if leave is recorded, it affects salary
        leave_recs_by_month = db.query(LeaveRecord).filter(
            LeaveRecord.employee_id == emp.id,
            LeaveRecord.month == month,
        ).all()
        leave_recs_by_date = db.query(LeaveRecord).filter(
            LeaveRecord.employee_id == emp.id,
            LeaveRecord.start_date <= p_end,
            LeaveRecord.end_date >= p_start,
        ).all()
        # Merge both sets (deduplicate by id)
        seen_ids = set()
        leave_recs = []
        for lr in leave_recs_by_month + leave_recs_by_date:
            if lr.id not in seen_ids:
                seen_ids.add(lr.id)
                leave_recs.append(lr)

        # Calculate actual days within this payroll month for each leave record
        unpaid_absence_days = 0
        paid_leave_days = 0
        for lr in leave_recs:
            # Calculate overlap between leave period and payroll month
            overlap_start = max(lr.start_date, p_start)
            overlap_end = min(lr.end_date, p_end)
            overlap_days = max(0, (overlap_end - overlap_start).days + 1)
            # Cap at 30 days (salary basis)
            overlap_days = min(overlap_days, 30)
            if lr.is_paid:
                paid_leave_days += overlap_days
            else:
                unpaid_absence_days += overlap_days

        total_leave_days = unpaid_absence_days + paid_leave_days
        actual_days_worked = max(0, emp_period_days - total_leave_days)

        # Absence deduction (only for unpaid leaves)
        per_day = emp.actual_salary / total_days if total_days > 0 else 0
        absence_ded = round(per_day * unpaid_absence_days, 3)

        # Pro-rate salary based on actual period days
        prorated_salary = round(per_day * emp_period_days, 3)

        # Loan deduction = Advance/Loan repayments recorded for this payroll month
        loan_ded = _loan_repayments_for_month(db, emp.id, month)

        # Auto-calculate benefits from StaffBenefitDeduction for this month (approved only).
        # One-time records apply only in their own month; monthly recurring records
        # apply every month from their start month until their optional end month.
        ben_deds = db.query(StaffBenefitDeduction).filter(
            StaffBenefitDeduction.employee_id == emp.id,
            StaffBenefitDeduction.approval_status == "approved",
            or_(
                and_(
                    func.coalesce(StaffBenefitDeduction.frequency, "one_time") != "monthly",
                    StaffBenefitDeduction.month == month,
                ),
                and_(
                    StaffBenefitDeduction.frequency == "monthly",
                    StaffBenefitDeduction.month <= month,
                    or_(
                        StaffBenefitDeduction.end_month.is_(None),
                        StaffBenefitDeduction.end_month >= month,
                    ),
                ),
            ),
        ).all()
        incentive_total = sum(b.amount for b in ben_deds if b.category == "incentive")
        bonus_total = sum(b.amount for b in ben_deds if b.category == "bonus")
        leave_salary_total = sum(b.amount for b in ben_deds if b.category == "leave_salary")
        ticket_total = sum(b.amount for b in ben_deds if b.category == "ticket")
        overtime_total = sum(b.amount for b in ben_deds if b.category == "overtime")
        other_benefit_total = sum(b.amount for b in ben_deds if b.category == "other_benefit")

        # Auto-calculate deductions from StaffBenefitDeduction for this month
        penalty_total = sum(b.amount for b in ben_deds if b.category in ("fine", "penalty"))
        other_ded_total = sum(b.amount for b in ben_deds if b.category == "other_deduction")

        # sp.allowances = fixed allowances (other_benefit goes into other_allowance)
        fixed_allowances = other_benefit_total
        total_additions = incentive_total + bonus_total + leave_salary_total + ticket_total + overtime_total
        fixed_deductions = absence_ded + other_ded_total  # exclude loan_ded and penalty (stored separately)
        net = prorated_salary + fixed_allowances + total_additions - fixed_deductions - loan_ded - penalty_total

        if existing:
            # Update existing pending record with latest calculations
            sp = existing
            sp.branch_id = emp.branch_id
            sp.basic_salary = emp.actual_salary
            sp.total_days = total_days
            # Always recalculate period dates when regenerating
            sp.days_worked = actual_days_worked
            sp.period_start = emp_period_start
            sp.period_end = emp_period_end
            sp.other_allowance = other_benefit_total
            sp.allowances = fixed_allowances
            sp.absence_deduction = absence_ded
            sp.other_deduction = other_ded_total
            sp.deductions = fixed_deductions
            sp.overtime = overtime_total
            sp.bonus = bonus_total
            sp.incentive = incentive_total
            sp.leave_salary = leave_salary_total
            sp.ticket_payment = ticket_total
            sp.loan_deduction = loan_ded
            sp.penalty = penalty_total
            sp.net_salary = net
            sp.payment_method = emp.salary_transfer_method or "cash"
            updated += 1
        else:
            sp = SalaryPayment(
                employee_id=emp.id,
                branch_id=emp.branch_id,
                month=month,
                basic_salary=emp.actual_salary,
                total_days=total_days,
                days_worked=actual_days_worked,
                period_start=emp_period_start,
                period_end=emp_period_end,
                last_workplace="",
                housing_allowance=0, transport_allowance=0,
                food_allowance=0, other_allowance=other_benefit_total,
                allowances=fixed_allowances,
                absence_deduction=absence_ded, late_deduction=0,
                other_deduction=other_ded_total,
                deductions=fixed_deductions,
                advance=0,
                overtime=overtime_total,
                bonus=bonus_total,
                incentive=incentive_total,
                leave_salary=leave_salary_total,
                ticket_payment=ticket_total,
                loan_deduction=loan_ded,
                penalty=penalty_total,
                net_salary=net,
                payment_method=emp.salary_transfer_method or "cash",
                status="pending",
            )
            db.add(sp)
            created += 1
    db.commit()
    return {"message": f"Generated {created} new, updated {updated} existing salary records for {month}"}


@router.put("/salary/{payment_id}")
def update_salary_payment(
    payment_id: int,
    basic_salary: float = Form(None),
    total_days: int = Form(None),
    days_worked: int = Form(None),
    period_start: str = Form(""),
    period_end: str = Form(""),
    last_workplace: str = Form(""),
    housing_allowance: float = Form(0),
    transport_allowance: float = Form(0),
    food_allowance: float = Form(0),
    other_allowance: float = Form(0),
    absence_deduction: float = Form(0),
    late_deduction: float = Form(0),
    other_deduction: float = Form(0),
    advance: float = Form(0),
    overtime: float = Form(0),
    bonus: float = Form(0),
    incentive: float = Form(0),
    leave_salary: float = Form(0),
    ticket_payment: float = Form(0),
    loan_deduction: float = Form(0),
    penalty: float = Form(0),
    payment_method: str = Form("cash"),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    sp = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not sp:
        raise HTTPException(404, "Salary record not found")

    if basic_salary is not None:
        sp.basic_salary = basic_salary
    if total_days is not None:
        sp.total_days = total_days

    sp.period_start = date.fromisoformat(period_start) if period_start else None
    sp.period_end = date.fromisoformat(period_end) if period_end else None

    # Auto-calculate days_worked from period dates if both are provided
    if sp.period_start and sp.period_end:
        calendar_days = (sp.period_end - sp.period_start).days + 1
        sp.days_worked = min(max(calendar_days, 0), 30)
    elif days_worked is not None:
        sp.days_worked = days_worked
    sp.last_workplace = last_workplace or None
    sp.housing_allowance = housing_allowance
    sp.transport_allowance = transport_allowance
    sp.food_allowance = food_allowance
    sp.other_allowance = other_allowance
    sp.absence_deduction = absence_deduction
    sp.late_deduction = late_deduction
    sp.other_deduction = other_deduction
    sp.advance = advance
    sp.overtime = overtime
    sp.bonus = bonus
    sp.incentive = incentive
    sp.leave_salary = leave_salary
    sp.ticket_payment = ticket_payment
    sp.loan_deduction = loan_deduction
    sp.penalty = penalty
    sp.payment_method = payment_method
    sp.notes = notes

    earned, total_allow, total_deduct, net = _calc_net(
        sp.basic_salary, sp.total_days, sp.days_worked,
        housing_allowance, transport_allowance, food_allowance, other_allowance,
        absence_deduction, late_deduction, other_deduction, advance,
        overtime, bonus, incentive, leave_salary, ticket_payment,
        loan_deduction, penalty,
    )
    sp.allowances = total_allow
    sp.deductions = total_deduct
    sp.net_salary = net

    db.commit()
    return {"message": "Updated"}


@router.get("/salary/{payment_id}/payslip")
def get_payslip(
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    sp = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not sp:
        raise HTTPException(404, "Salary record not found")
    emp = db.query(Employee).filter(Employee.id == sp.employee_id).first()
    branch = db.query(Branch).filter(Branch.id == sp.branch_id).first()
    return {
        "id": sp.id,
        "month": sp.month,
        "employee": {
            "id": emp.id if emp else 0,
            "staff_no": emp.staff_no if emp else "",
            "name": emp.name if emp else "",
            "position": emp.position if emp else "",
            "civil_id": emp.civil_id if emp else "",
            "iban": emp.iban if emp else "",
            "bank_name": emp.bank_name if emp else "",
            "branch": branch.name if branch else "",
            "join_date": str(emp.join_date) if emp and emp.join_date else "",
        },
        "basic_salary": sp.basic_salary,
        "total_days": sp.total_days or 30,
        "days_worked": sp.days_worked or 30,
        "period_start": str(sp.period_start) if sp.period_start else "",
        "period_end": str(sp.period_end) if sp.period_end else "",
        "last_workplace": sp.last_workplace or "",
        "housing_allowance": sp.housing_allowance or 0,
        "transport_allowance": sp.transport_allowance or 0,
        "food_allowance": sp.food_allowance or 0,
        "other_allowance": sp.other_allowance or 0,
        "allowances": sp.allowances or 0,
        "overtime": sp.overtime or 0,
        "bonus": sp.bonus or 0,
        "incentive": sp.incentive or 0,
        "leave_salary": sp.leave_salary or 0,
        "ticket_payment": sp.ticket_payment or 0,
        "absence_deduction": sp.absence_deduction or 0,
        "late_deduction": sp.late_deduction or 0,
        "other_deduction": sp.other_deduction or 0,
        "loan_deduction": sp.loan_deduction or 0,
        "penalty": sp.penalty or 0,
        "deductions": sp.deductions or 0,
        "advance": sp.advance or 0,
        "net_salary": sp.net_salary or 0,
        "payment_method": sp.payment_method,
        "status": sp.status,
        "paid_date": str(sp.paid_date) if sp.paid_date else None,
    }


@router.post("/salary/{payment_id}/pay")
def mark_salary_paid(
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    sp = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not sp:
        raise HTTPException(404, "Salary record not found")
    sp.status = "paid"
    sp.paid_date = date.today()

    # Deduct loan balances for any manual deduction beyond the repayments
    # already recorded for this month (those reduced the balance on entry).
    recorded = _loan_repayments_for_month(db, sp.employee_id, sp.month)
    extra = round((sp.loan_deduction or 0) - recorded, 3)
    if extra > 0:
        active_loans = db.query(AdvanceLoan).filter(
            AdvanceLoan.employee_id == sp.employee_id,
            AdvanceLoan.status == "active",
        ).all()
        remaining = extra
        for loan in active_loans:
            if remaining <= 0:
                break
            deduct = min(remaining, loan.balance)
            loan.balance = round(loan.balance - deduct, 3)
            if loan.balance <= 0:
                loan.status = "paid_off"
            remaining -= deduct

    _sync_salary_expense(db, sp)
    db.commit()
    return {"message": "Marked as paid"}


@router.post("/salary/{payment_id}/hold")
def hold_salary(
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    sp = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not sp:
        raise HTTPException(404, "Salary record not found")
    if sp.status == "paid":
        raise HTTPException(400, "Cannot hold a paid salary")
    sp.status = "on_hold"
    db.commit()
    return {"message": "Salary on hold"}


@router.post("/salary/{payment_id}/release")
def release_salary(
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    sp = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not sp:
        raise HTTPException(404, "Salary record not found")
    if sp.status != "on_hold":
        raise HTTPException(400, "Salary is not on hold")
    sp.status = "pending"
    db.commit()
    return {"message": "Salary released"}


@router.delete("/salary/{payment_id}")
def delete_salary_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    sp = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not sp:
        raise HTTPException(404, "Salary record not found")
    db.query(Expense).filter(Expense.salary_payment_id == sp.id).delete()
    db.delete(sp)
    db.commit()
    return {"message": "Deleted"}


# --- Staff Transfers ---
@router.get("/transfers")
def list_transfers(brand_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(StaffTransfer)
    sbid = _staff_branch_id(user)
    if sbid is not None:
        # Branch staff see transfers involving their branch (in or out)
        q = q.filter(
            (StaffTransfer.from_branch_id == sbid) | (StaffTransfer.to_branch_id == sbid)
        )
    else:
        bb_ids = _brand_branch_ids(db, brand_id)
        if bb_ids is not None:
            q = q.filter(StaffTransfer.from_branch_id.in_(bb_ids))
    return q.order_by(StaffTransfer.created_at.desc()).all()


@router.post("/transfers")
def create_transfer(
    employee_id: int = Form(...),
    from_branch_id: int = Form(...),
    to_branch_id: int = Form(...),
    transfer_date: str = Form(...),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = StaffTransfer(
        employee_id=employee_id,
        from_branch_id=from_branch_id,
        to_branch_id=to_branch_id,
        transfer_date=date.fromisoformat(transfer_date),
        requested_by=user.id,
        notes=notes,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.post("/transfers/{transfer_id}/approve")
def approve_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    t = db.query(StaffTransfer).filter(StaffTransfer.id == transfer_id).first()
    if not t:
        raise HTTPException(404, "Transfer not found")
    t.status = "approved"
    t.approved_by = user.id
    # Update employee branch
    emp = db.query(Employee).filter(Employee.id == t.employee_id).first()
    if emp:
        emp.branch_id = t.to_branch_id
    db.commit()
    return {"message": "Transfer approved"}


@router.post("/transfers/{transfer_id}/reject")
def reject_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    t = db.query(StaffTransfer).filter(StaffTransfer.id == transfer_id).first()
    if not t:
        raise HTTPException(404, "Transfer not found")
    t.status = "rejected"
    t.approved_by = user.id
    db.commit()
    return {"message": "Transfer rejected"}


# --- Advance / Loan ---
@router.get("/loans")
def list_loans(employee_id: Optional[int] = None, brand_id: Optional[int] = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    q = db.query(AdvanceLoan)
    staff_emp_ids = _staff_emp_ids(db, user)
    if staff_emp_ids is not None:
        q = q.filter(AdvanceLoan.employee_id.in_(staff_emp_ids)) if staff_emp_ids else q.filter(False)
    if employee_id:
        q = q.filter(AdvanceLoan.employee_id == employee_id)
    elif brand_id:
        bb_ids = _brand_branch_ids(db, brand_id)
        if bb_ids is not None:
            emp_ids = [e.id for e in db.query(Employee.id).filter(Employee.branch_id.in_(bb_ids)).all()]
            q = q.filter(AdvanceLoan.employee_id.in_(emp_ids)) if emp_ids else q.filter(False)
    return q.order_by(AdvanceLoan.created_at.desc()).all()


@router.post("/loans")
def create_loan(
    employee_id: int = Form(...),
    loan_type: str = Form("advance"),
    amount: float = Form(...),
    monthly_deduction: float = Form(0),
    deduction_month: str = Form(""),
    loan_date: str = Form(...),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    loan = AdvanceLoan(
        employee_id=employee_id,
        loan_type=loan_type,
        amount=amount,
        balance=amount,
        monthly_deduction=monthly_deduction,
        deduction_month=deduction_month or None,
        date=date.fromisoformat(loan_date),
        notes=notes,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan


@router.put("/loans/{loan_id}")
def update_loan(
    loan_id: int,
    employee_id: int = Form(...),
    loan_type: str = Form("advance"),
    amount: float = Form(...),
    balance: float = Form(...),
    monthly_deduction: float = Form(0),
    deduction_month: str = Form(""),
    loan_date: str = Form(...),
    notes: str = Form(""),
    status: str = Form("active"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    loan = db.query(AdvanceLoan).filter(AdvanceLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(404, "Loan not found")
    loan.employee_id = employee_id
    loan.loan_type = loan_type
    loan.amount = amount
    loan.balance = balance
    loan.monthly_deduction = monthly_deduction
    loan.deduction_month = deduction_month or None
    loan.date = date.fromisoformat(loan_date)
    loan.notes = notes
    loan.status = status
    db.commit()
    return {"message": "Updated"}


@router.delete("/loans/{loan_id}")
def delete_loan(loan_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    loan = db.query(AdvanceLoan).filter(AdvanceLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(404, "Loan not found")
    db.query(LoanRepayment).filter(LoanRepayment.loan_id == loan_id).delete()
    db.delete(loan)
    db.commit()
    return {"message": "Deleted"}


# --- Loan Repayments (manual repayment tracking) ---
@router.get("/loans/{loan_id}/repayments")
def list_loan_repayments(loan_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    rows = db.query(LoanRepayment).filter(
        LoanRepayment.loan_id == loan_id
    ).order_by(LoanRepayment.date.desc()).all()
    return [
        {
            "id": r.id, "loan_id": r.loan_id, "amount": r.amount,
            "date": str(r.date), "month": r.month or "", "notes": r.notes or "",
        }
        for r in rows
    ]


@router.get("/loans/statement")
def loan_statement(employee_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Unified transaction ledger for one employee: every advance/loan taken
    plus every repayment/return, chronological, with a running balance."""
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    staff_emp_ids = _staff_emp_ids(db, user)
    if staff_emp_ids is not None and employee_id not in staff_emp_ids:
        raise HTTPException(403, "Not authorized")

    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")

    loans = db.query(AdvanceLoan).filter(AdvanceLoan.employee_id == employee_id).all()
    loan_ids = [l.id for l in loans]
    reps = []
    if loan_ids:
        reps = db.query(LoanRepayment).filter(LoanRepayment.loan_id.in_(loan_ids)).all()

    txns = []
    for l in loans:
        txns.append({
            "id": l.id,
            "kind": "disbursement",
            "type": l.loan_type,  # advance | loan
            "loan_id": l.id,
            "date": str(l.date),
            "amount": round(l.amount or 0, 3),
            "notes": l.notes or "",
            "status": l.status,
        })
    for r in reps:
        txns.append({
            "id": r.id,
            "kind": "repayment",
            "type": "repayment",
            "loan_id": r.loan_id,
            "date": str(r.date),
            "amount": round(r.amount or 0, 3),
            "notes": r.notes or "",
            "status": "",
        })

    txns.sort(key=lambda x: (x["date"], 0 if x["kind"] == "disbursement" else 1))
    running = 0.0
    for tx in txns:
        running += tx["amount"] if tx["kind"] == "disbursement" else -tx["amount"]
        tx["running_balance"] = round(running, 3)

    total_taken = round(sum(l.amount or 0 for l in loans), 3)
    total_repaid = round(sum(r.amount or 0 for r in reps), 3)
    outstanding = round(sum(l.balance or 0 for l in loans), 3)
    return {
        "employee": {"id": emp.id, "name": emp.name, "name_ar": emp.name_ar or "",
                     "staff_no": emp.staff_no or ""},
        "totals": {
            "total_taken": total_taken,
            "total_repaid": total_repaid,
            "outstanding": outstanding,
            "loan_count": len(loans),
        },
        "transactions": txns,
    }


@router.post("/loans/{loan_id}/repayments")
def create_loan_repayment(
    loan_id: int,
    amount: float = Form(...),
    repayment_date: str = Form(...),
    month: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    loan = db.query(AdvanceLoan).filter(AdvanceLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(404, "Loan not found")
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    rep = LoanRepayment(
        loan_id=loan_id,
        amount=amount,
        date=date.fromisoformat(repayment_date),
        month=month or None,
        notes=notes,
    )
    db.add(rep)
    loan.balance = round(max(0.0, (loan.balance or 0) - amount), 3)
    loan.status = "paid_off" if loan.balance <= 0 else "active"
    db.flush()
    _apply_loan_repayments_to_payroll(db, loan.employee_id, rep.month or rep.date.strftime("%Y-%m"))
    db.commit()
    db.refresh(rep)
    return {"id": rep.id, "balance": loan.balance, "status": loan.status}


@router.delete("/loans/repayments/{repayment_id}")
def delete_loan_repayment(repayment_id: int, db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    rep = db.query(LoanRepayment).filter(LoanRepayment.id == repayment_id).first()
    if not rep:
        raise HTTPException(404, "Repayment not found")
    loan = db.query(AdvanceLoan).filter(AdvanceLoan.id == rep.loan_id).first()
    if loan:
        loan.balance = round((loan.balance or 0) + rep.amount, 3)
        if loan.balance > 0:
            loan.status = "active"
    rep_month = rep.month or rep.date.strftime("%Y-%m")
    emp_id = loan.employee_id if loan else None
    db.delete(rep)
    db.flush()
    if emp_id:
        _apply_loan_repayments_to_payroll(db, emp_id, rep_month)
    db.commit()
    return {"message": "Deleted"}


# --- Benefits & Deductions ---
@router.get("/benefits-deductions")
def list_benefits_deductions(employee_id: Optional[int] = None, month: Optional[str] = None,
                             brand_id: Optional[int] = None,
                             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(StaffBenefitDeduction)
    staff_emp_ids = _staff_emp_ids(db, user)
    if staff_emp_ids is not None:
        q = q.filter(StaffBenefitDeduction.employee_id.in_(staff_emp_ids)) if staff_emp_ids else q.filter(False)
    if employee_id:
        q = q.filter(StaffBenefitDeduction.employee_id == employee_id)
    if month:
        q = q.filter(StaffBenefitDeduction.month == month)
    if brand_id and not employee_id:
        bb_ids = _brand_branch_ids(db, brand_id)
        if bb_ids is not None:
            emp_ids = [e.id for e in db.query(Employee.id).filter(Employee.branch_id.in_(bb_ids)).all()]
            q = q.filter(StaffBenefitDeduction.employee_id.in_(emp_ids)) if emp_ids else q.filter(False)
    return q.order_by(StaffBenefitDeduction.created_at.desc()).all()


@router.post("/benefits-deductions")
def create_benefit_deduction(
    employee_id: int = Form(...),
    category: str = Form(...),
    amount: float = Form(...),
    bd_date: str = Form(...),
    month: str = Form(""),
    frequency: str = Form("one_time"),
    end_month: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    is_mgr = user.role in ("owner", "manager", "accountant")
    bd = StaffBenefitDeduction(
        employee_id=employee_id,
        category=category,
        amount=amount,
        frequency=frequency if frequency in ("one_time", "monthly") else "one_time",
        date=date.fromisoformat(bd_date),
        month=month or None,
        end_month=end_month or None,
        notes=notes,
        approval_status="approved" if is_mgr else "pending_approval",
        approved_by=user.id if is_mgr else None,
    )
    db.add(bd)
    db.commit()
    db.refresh(bd)
    return bd


@router.put("/benefits-deductions/{bd_id}")
def update_benefit_deduction(
    bd_id: int,
    employee_id: int = Form(...),
    category: str = Form(...),
    amount: float = Form(...),
    bd_date: str = Form(...),
    month: str = Form(""),
    frequency: str = Form("one_time"),
    end_month: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    bd = db.query(StaffBenefitDeduction).filter(StaffBenefitDeduction.id == bd_id).first()
    if not bd:
        raise HTTPException(404, "Record not found")
    bd.employee_id = employee_id
    bd.category = category
    bd.amount = amount
    bd.frequency = frequency if frequency in ("one_time", "monthly") else "one_time"
    bd.date = date.fromisoformat(bd_date)
    bd.month = month or None
    bd.end_month = end_month or None
    bd.notes = notes
    db.commit()
    return {"message": "Updated"}


@router.delete("/benefits-deductions/{bd_id}")
def delete_benefit_deduction(bd_id: int, db: Session = Depends(get_db),
                             user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    bd = db.query(StaffBenefitDeduction).filter(StaffBenefitDeduction.id == bd_id).first()
    if not bd:
        raise HTTPException(404, "Record not found")
    db.delete(bd)
    db.commit()
    return {"message": "Deleted"}


# --- Leave / Absence Records ---
@router.get("/leaves")
def list_leaves(employee_id: Optional[int] = None, month: Optional[str] = None,
                brand_id: Optional[int] = None,
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(LeaveRecord)
    staff_emp_ids = _staff_emp_ids(db, user)
    if staff_emp_ids is not None:
        q = q.filter(LeaveRecord.employee_id.in_(staff_emp_ids)) if staff_emp_ids else q.filter(False)
    if employee_id:
        q = q.filter(LeaveRecord.employee_id == employee_id)
    if month:
        q = q.filter(LeaveRecord.month == month)
    if brand_id and not employee_id:
        bb_ids = _brand_branch_ids(db, brand_id)
        if bb_ids is not None:
            emp_ids = [e.id for e in db.query(Employee.id).filter(Employee.branch_id.in_(bb_ids)).all()]
            q = q.filter(LeaveRecord.employee_id.in_(emp_ids)) if emp_ids else q.filter(False)
    rows = q.order_by(LeaveRecord.start_date.desc()).all()
    return [
        {
            "id": r.id, "employee_id": r.employee_id,
            "leave_type": r.leave_type, "start_date": str(r.start_date),
            "end_date": str(r.end_date), "days": r.days,
            "is_paid": r.is_paid, "month": r.month or "",
            "notes": r.notes or "",
        }
        for r in rows
    ]


@router.post("/leaves")
def create_leave(
    employee_id: int = Form(...),
    leave_type: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    is_paid: bool = Form(False),
    month: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    is_mgr = user.role in ("owner", "manager", "accountant")
    sd = date.fromisoformat(start_date)
    ed = date.fromisoformat(end_date)
    days = (ed - sd).days + 1
    if days < 1:
        raise HTTPException(400, "End date must be after start date")
    rec = LeaveRecord(
        employee_id=employee_id,
        leave_type=leave_type,
        start_date=sd,
        end_date=ed,
        days=days,
        is_paid=is_paid,
        month=month or None,
        notes=notes,
        approval_status="approved" if is_mgr else "pending_approval",
        approved_by=user.id if is_mgr else None,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "days": rec.days, "message": f"Leave recorded: {days} days"}


@router.put("/leaves/{leave_id}")
def update_leave(
    leave_id: int,
    employee_id: int = Form(...),
    leave_type: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    is_paid: bool = Form(False),
    month: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    rec = db.query(LeaveRecord).filter(LeaveRecord.id == leave_id).first()
    if not rec:
        raise HTTPException(404, "Leave record not found")
    sd = date.fromisoformat(start_date)
    ed = date.fromisoformat(end_date)
    days = (ed - sd).days + 1
    if days < 1:
        raise HTTPException(400, "End date must be after start date")
    rec.employee_id = employee_id
    rec.leave_type = leave_type
    rec.start_date = sd
    rec.end_date = ed
    rec.days = days
    rec.is_paid = is_paid
    rec.month = month or None
    rec.notes = notes
    db.commit()
    return {"message": "Updated"}


@router.delete("/leaves/{leave_id}")
def delete_leave(leave_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Not authorized")
    rec = db.query(LeaveRecord).filter(LeaveRecord.id == leave_id).first()
    if not rec:
        raise HTTPException(404, "Leave record not found")
    db.delete(rec)
    db.commit()
    return {"message": "Deleted"}


# --- Resignations ---
def _resignation_to_dict(r):
    return {
        "id": r.id, "ref_no": r.ref_no or "", "employee_id": r.employee_id,
        "name_en": r.name_en or "", "name_ar": r.name_ar or "",
        "civil_id": r.civil_id or "", "nationality": r.nationality or "",
        "job_title": r.job_title or "", "department_branch": r.department_branch or "",
        "date_of_joining": str(r.date_of_joining) if r.date_of_joining else "",
        "last_working_day": str(r.last_working_day) if r.last_working_day else "",
        "mobile": r.mobile or "", "email": r.email or "",
        "reason": r.reason or "", "resignation_date": str(r.resignation_date) if r.resignation_date else "",
        "company_id_returned": r.company_id_returned, "uniform_returned": r.uniform_returned,
        "locker_keys_handed": r.locker_keys_handed, "equipment_returned": r.equipment_returned,
        "loans_cleared": r.loans_cleared, "handover_completed": r.handover_completed,
        "final_settlement_calculated": r.final_settlement_calculated,
        "final_salary_paid": r.final_salary_paid,
        "ops_manager_name": r.ops_manager_name or "", "ops_manager_status": r.ops_manager_status or "pending",
        "ops_manager_date": str(r.ops_manager_date) if r.ops_manager_date else "",
        "gm_name": r.gm_name or "", "gm_status": r.gm_status or "pending",
        "gm_date": str(r.gm_date) if r.gm_date else "",
        "finance_manager_name": r.finance_manager_name or "",
        "last_salary_paid_amount": r.last_salary_paid_amount or 0,
        "end_of_service": r.end_of_service or 0,
        "leave_encashment": r.leave_encashment or 0,
        "deductions_amount": r.deductions_amount or 0,
        "final_settlement_amount": r.final_settlement_amount or 0,
        "finance_date": str(r.finance_date) if r.finance_date else "",
        "dues_cleared_consent": r.dues_cleared_consent if r.dues_cleared_consent else False,
        "consent_date": str(r.consent_date) if r.consent_date else "",
        "status": r.status or "draft",
        "created_at": str(r.created_at) if r.created_at else "",
    }


@router.get("/resignations")
def list_resignations(brand_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    q = db.query(Resignation)
    staff_emp_ids = _staff_emp_ids(db, user)
    if staff_emp_ids is not None:
        q = q.filter(Resignation.employee_id.in_(staff_emp_ids)) if staff_emp_ids else q.filter(False)
    if brand_id:
        bb_ids = _brand_branch_ids(db, brand_id)
        if bb_ids is not None:
            emp_ids = [e.id for e in db.query(Employee.id).filter(Employee.branch_id.in_(bb_ids)).all()]
            q = q.filter(Resignation.employee_id.in_(emp_ids)) if emp_ids else q.filter(False)
    rows = q.order_by(Resignation.id.desc()).all()
    return [_resignation_to_dict(r) for r in rows]


@router.post("/resignations")
def create_resignation(
    employee_id: int = Form(...),
    ref_no: str = Form(""),
    name_en: str = Form(""), name_ar: str = Form(""),
    civil_id: str = Form(""), nationality: str = Form(""),
    job_title: str = Form(""), department_branch: str = Form(""),
    date_of_joining: str = Form(""), last_working_day: str = Form(""),
    mobile: str = Form(""), email: str = Form(""),
    reason: str = Form(""), resignation_date: str = Form(""),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    r = Resignation(
        employee_id=employee_id,
        ref_no=ref_no or None,
        name_en=name_en or None, name_ar=name_ar or None,
        civil_id=civil_id or None, nationality=nationality or None,
        job_title=job_title or None, department_branch=department_branch or None,
        date_of_joining=date.fromisoformat(date_of_joining) if date_of_joining else None,
        last_working_day=date.fromisoformat(last_working_day) if last_working_day else None,
        mobile=mobile or None, email=email or None,
        reason=reason or None,
        resignation_date=date.fromisoformat(resignation_date) if resignation_date else None,
    )
    db.add(r)
    # Sync dates to employee record
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if emp:
        if resignation_date:
            emp.termination_date = date.fromisoformat(resignation_date)
        if last_working_day:
            emp.last_working_date = date.fromisoformat(last_working_day)
    db.commit()
    db.refresh(r)
    return _resignation_to_dict(r)


@router.put("/resignations/{res_id}")
def update_resignation(
    res_id: int,
    ref_no: str = Form(""),
    name_en: str = Form(""), name_ar: str = Form(""),
    civil_id: str = Form(""), nationality: str = Form(""),
    job_title: str = Form(""), department_branch: str = Form(""),
    date_of_joining: str = Form(""), last_working_day: str = Form(""),
    mobile: str = Form(""), email: str = Form(""),
    reason: str = Form(""), resignation_date: str = Form(""),
    company_id_returned: bool = Form(False), uniform_returned: bool = Form(False),
    locker_keys_handed: bool = Form(False), equipment_returned: bool = Form(False),
    loans_cleared: bool = Form(False), handover_completed: bool = Form(False),
    final_settlement_calculated: bool = Form(False), final_salary_paid: bool = Form(False),
    ops_manager_name: str = Form(""), ops_manager_status: str = Form("pending"),
    ops_manager_date: str = Form(""),
    gm_name: str = Form(""), gm_status: str = Form("pending"),
    gm_date: str = Form(""),
    finance_manager_name: str = Form(""),
    last_salary_paid_amount: float = Form(0),
    end_of_service: float = Form(0),
    leave_encashment: float = Form(0),
    deductions_amount: float = Form(0),
    final_settlement_amount: float = Form(0),
    finance_date: str = Form(""),
    dues_cleared_consent: bool = Form(False),
    consent_date: str = Form(""),
    status: str = Form("draft"),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    r = db.query(Resignation).filter(Resignation.id == res_id).first()
    if not r:
        raise HTTPException(404, "Resignation not found")
    r.ref_no = ref_no or None
    r.name_en = name_en or None
    r.name_ar = name_ar or None
    r.civil_id = civil_id or None
    r.nationality = nationality or None
    r.job_title = job_title or None
    r.department_branch = department_branch or None
    r.date_of_joining = date.fromisoformat(date_of_joining) if date_of_joining else None
    r.last_working_day = date.fromisoformat(last_working_day) if last_working_day else None
    r.mobile = mobile or None
    r.email = email or None
    r.reason = reason or None
    r.resignation_date = date.fromisoformat(resignation_date) if resignation_date else None
    r.company_id_returned = company_id_returned
    r.uniform_returned = uniform_returned
    r.locker_keys_handed = locker_keys_handed
    r.equipment_returned = equipment_returned
    r.loans_cleared = loans_cleared
    r.handover_completed = handover_completed
    r.final_settlement_calculated = final_settlement_calculated
    r.final_salary_paid = final_salary_paid
    r.ops_manager_name = ops_manager_name or None
    r.ops_manager_status = ops_manager_status
    r.ops_manager_date = date.fromisoformat(ops_manager_date) if ops_manager_date else None
    r.gm_name = gm_name or None
    r.gm_status = gm_status
    r.gm_date = date.fromisoformat(gm_date) if gm_date else None
    r.finance_manager_name = finance_manager_name or None
    r.last_salary_paid_amount = last_salary_paid_amount
    r.end_of_service = end_of_service
    r.leave_encashment = leave_encashment
    r.deductions_amount = deductions_amount
    r.final_settlement_amount = final_settlement_amount
    r.finance_date = date.fromisoformat(finance_date) if finance_date else None
    r.dues_cleared_consent = dues_cleared_consent
    r.consent_date = date.fromisoformat(consent_date) if consent_date else None
    r.status = status
    # Sync dates to employee record
    emp = db.query(Employee).filter(Employee.id == r.employee_id).first()
    if emp:
        if resignation_date:
            emp.termination_date = date.fromisoformat(resignation_date)
        if last_working_day:
            emp.last_working_date = date.fromisoformat(last_working_day)
    db.commit()
    db.refresh(r)
    return _resignation_to_dict(r)


@router.delete("/resignations/{res_id}")
def delete_resignation(res_id: int, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    r = db.query(Resignation).filter(Resignation.id == res_id).first()
    if not r:
        raise HTTPException(404, "Resignation not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


# --- Contracts & Subscriptions ---
CONTRACT_KIND_AR = {
    "Rent Contract": "عقد إيجار", "Legal Contract": "عقد قانوني",
    "Internet Contract": "عقد إنترنت", "Subscription": "اشتراك",
    "Maintenance Contract": "عقد صيانة", "Consultancy Contract": "عقد استشاري",
    "Insurance Contract": "عقد تأمين", "Service Contract": "عقد خدمات",
}
DEFAULT_CONTRACT_CATEGORY = ("Contracts & Subscriptions", "العقود والاشتراكات")


def _contract_expense_category(db: Session, kind: Optional[str]) -> ExpenseCategory:
    """Expense category named after the contract type (created on demand)."""
    name = (kind or "").strip() or DEFAULT_CONTRACT_CATEGORY[0]
    cat = db.query(ExpenseCategory).filter(func.lower(ExpenseCategory.name) == name.lower()).first()
    if not cat:
        name_ar = CONTRACT_KIND_AR.get(name) or (DEFAULT_CONTRACT_CATEGORY[1] if name == DEFAULT_CONTRACT_CATEGORY[0] else None)
        cat = ExpenseCategory(name=name, name_ar=name_ar, is_active=True)
        db.add(cat)
        db.flush()
    elif not cat.is_active:
        cat.is_active = True
    return cat


def _sync_payment_expense(db: Session, p: ContractPayment, c: Contract):
    """Mirror a paid contract payment as an Expense so it reports in Expenses/Dashboard."""
    exp = db.query(Expense).filter(Expense.contract_payment_id == p.id).first()
    if p.status != "paid" or not c.branch_id:
        if exp:
            db.delete(exp)
        return
    cat = _contract_expense_category(db, c.kind)
    if not exp:
        exp = Expense(contract_payment_id=p.id)
        db.add(exp)
    exp.branch_id = c.branch_id
    exp.category_id = cat.id
    exp.date = p.due_date
    exp.description = f"{c.name} — {p.due_date:%b %Y}"
    exp.amount = p.amount
    exp.payment_method = p.payment_method or "bank_transfer"
    exp.notes = " | ".join(x for x in [p.reference, p.notes] if x) or None


def _sync_contract_expenses(db: Session, c: Contract):
    for p in db.query(ContractPayment).filter(ContractPayment.contract_id == c.id).all():
        _sync_payment_expense(db, p, c)


def _contract_to_dict(c):
    return {
        "id": c.id, "brand_id": c.brand_id, "branch_id": c.branch_id,
        "name": c.name or "", "kind": c.kind or "",
        "place": c.place or "", "period": c.period or "", "value": c.value or 0,
        "start_date": str(c.start_date) if c.start_date else "",
        "end_date": str(c.end_date) if c.end_date else "",
        "monthly_payment": c.monthly_payment or 0,
        "payment_day": c.payment_day or 1,
        "notes": c.notes or "", "status": c.status or "active",
        "created_at": str(c.created_at) if c.created_at else "",
    }


@router.get("/contracts")
def list_contracts(brand_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    q = db.query(Contract)
    if brand_id:
        q = q.filter(Contract.brand_id == brand_id)
    rows = q.order_by(Contract.id.desc()).all()
    return [_contract_to_dict(c) for c in rows]


@router.post("/contracts")
def create_contract(
    name: str = Form(...),
    kind: str = Form(""), place: str = Form(""),
    period: str = Form(""),
    value: float = Form(0), start_date: str = Form(""),
    end_date: str = Form(""), monthly_payment: float = Form(0),
    payment_day: int = Form(1), notes: str = Form(""),
    status: str = Form("active"),
    brand_id: Optional[int] = Form(None),
    branch_id: Optional[int] = Form(None),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    c = Contract(
        name=name, kind=kind or None, place=place or None,
        period=period or None,
        value=value, monthly_payment=monthly_payment,
        payment_day=payment_day, notes=notes or None, status=status,
        brand_id=brand_id, branch_id=branch_id,
        start_date=date.fromisoformat(start_date) if start_date else None,
        end_date=date.fromisoformat(end_date) if end_date else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _contract_to_dict(c)


@router.put("/contracts/{contract_id}")
def update_contract(
    contract_id: int,
    name: str = Form(...),
    kind: str = Form(""), place: str = Form(""),
    period: str = Form(""),
    value: float = Form(0), start_date: str = Form(""),
    end_date: str = Form(""), monthly_payment: float = Form(0),
    payment_day: int = Form(1), notes: str = Form(""),
    status: str = Form("active"),
    branch_id: Optional[int] = Form(None),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    c = db.query(Contract).filter(Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "Contract not found")
    c.name = name
    c.branch_id = branch_id
    c.kind = kind or None
    c.place = place or None
    c.period = period or None
    c.value = value
    c.monthly_payment = monthly_payment
    c.payment_day = payment_day
    c.notes = notes or None
    c.status = status
    c.start_date = date.fromisoformat(start_date) if start_date else None
    c.end_date = date.fromisoformat(end_date) if end_date else None
    _sync_contract_expenses(db, c)
    db.commit()
    db.refresh(c)
    return _contract_to_dict(c)


@router.delete("/contracts/{contract_id}")
def delete_contract(contract_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    c = db.query(Contract).filter(Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "Contract not found")
    for p in db.query(ContractPayment).filter(ContractPayment.contract_id == c.id).all():
        db.query(Expense).filter(Expense.contract_payment_id == p.id).delete()
        db.delete(p)
    db.delete(c)
    db.commit()
    return {"ok": True}


# --- Contract Payments ---
@router.get("/contract-reminders")
def list_contract_reminders(
    brand_id: Optional[int] = None,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    """Unpaid (pending/overdue) contract payments across all contracts."""
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    q = db.query(ContractPayment, Contract).join(Contract, Contract.id == ContractPayment.contract_id)\
        .filter(ContractPayment.status != "paid", Contract.status == "active")
    if brand_id:
        q = q.filter(Contract.brand_id == brand_id)
    today = date.today()
    out = []
    seen_contracts = set()
    for p, c in q.order_by(ContractPayment.due_date).all():
        seen_contracts.add(c.id)
        out.append({
            "payment_id": p.id, "contract_id": c.id, "contract_name": c.name,
            "kind": c.kind, "branch_id": c.branch_id, "period": c.period,
            "amount": p.amount, "due_date": str(p.due_date),
            "days_remaining": (p.due_date - today).days, "status": p.status,
        })
    # Active contracts with no unpaid payment yet: show the next scheduled due date
    cq = db.query(Contract).filter(Contract.status == "active", Contract.monthly_payment > 0)
    if brand_id:
        cq = cq.filter(Contract.brand_id == brand_id)
    for c in cq.all():
        if c.id in seen_contracts or not c.payment_day:
            continue
        y, m = today.year, today.month
        nxt = date(y, m, min(c.payment_day, calendar.monthrange(y, m)[1]))
        if nxt < today:
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
            nxt = date(y, m, min(c.payment_day, calendar.monthrange(y, m)[1]))
        if c.end_date and nxt > c.end_date:
            continue
        out.append({
            "payment_id": None, "contract_id": c.id, "contract_name": c.name,
            "kind": c.kind, "branch_id": c.branch_id, "period": c.period,
            "amount": c.monthly_payment, "due_date": str(nxt),
            "days_remaining": (nxt - today).days, "status": "upcoming",
        })
    out.sort(key=lambda r: r["due_date"])
    return out


@router.get("/contracts/{contract_id}/payments")
def list_contract_payments(contract_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    rows = db.query(ContractPayment).filter(ContractPayment.contract_id == contract_id)\
        .order_by(ContractPayment.due_date).all()
    return [{
        "id": p.id, "contract_id": p.contract_id,
        "due_date": str(p.due_date), "amount": p.amount,
        "status": p.status, "paid_date": str(p.paid_date) if p.paid_date else None,
        "payment_method": p.payment_method, "reference": p.reference,
        "notes": p.notes,
    } for p in rows]


@router.post("/contracts/{contract_id}/payments")
def create_contract_payment(
    contract_id: int,
    due_date: str = Form(...), amount: float = Form(...),
    status: str = Form("pending"), paid_date: str = Form(""),
    payment_method: str = Form(""), reference: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    c = db.query(Contract).filter(Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "Contract not found")
    if status == "paid" and not payment_method:
        raise HTTPException(400, "Payment method is required for paid payments")
    p = ContractPayment(
        contract_id=contract_id,
        due_date=date.fromisoformat(due_date),
        amount=amount, status=status,
        paid_date=date.fromisoformat(paid_date) if paid_date else None,
        payment_method=payment_method or None,
        reference=reference or None,
        notes=notes or None,
    )
    db.add(p)
    db.flush()
    _sync_payment_expense(db, p, c)
    db.commit()
    db.refresh(p)
    return {"ok": True, "id": p.id}


@router.post("/contracts/{contract_id}/generate-payments")
def generate_contract_payments(
    contract_id: int,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    """Auto-generate monthly payment schedule from contract start to end date."""
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    c = db.query(Contract).filter(Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "Contract not found")
    if not c.start_date or not c.end_date or not c.monthly_payment:
        raise HTTPException(400, "Contract must have start_date, end_date, and monthly_payment")
    # Delete existing auto-generated payments
    existing = db.query(ContractPayment).filter(ContractPayment.contract_id == contract_id).count()
    if existing > 0:
        raise HTTPException(400, "Payments already exist. Delete them first to regenerate.")
    from dateutil.relativedelta import relativedelta
    current = c.start_date
    day = c.payment_day or 1
    count = 0
    while current <= c.end_date:
        try:
            due = current.replace(day=min(day, calendar.monthrange(current.year, current.month)[1]))
        except Exception:
            due = current
        p = ContractPayment(contract_id=contract_id, due_date=due, amount=c.monthly_payment, status="pending")
        db.add(p)
        count += 1
        current = current + relativedelta(months=1)
    db.commit()
    return {"ok": True, "generated": count}


@router.put("/contract-payments/{payment_id}")
def update_contract_payment(
    payment_id: int,
    status: str = Form("pending"), paid_date: str = Form(""),
    payment_method: str = Form(""), reference: str = Form(""),
    notes: str = Form(""), amount: float = Form(0),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    p = db.query(ContractPayment).filter(ContractPayment.id == payment_id).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    if status == "paid" and not payment_method:
        raise HTTPException(400, "Payment method is required for paid payments")
    p.status = status
    if amount > 0:
        p.amount = amount
    p.paid_date = date.fromisoformat(paid_date) if paid_date else None
    p.payment_method = payment_method or None
    p.reference = reference or None
    p.notes = notes or None
    c = db.query(Contract).filter(Contract.id == p.contract_id).first()
    _sync_payment_expense(db, p, c)
    db.commit()
    return {"ok": True}


@router.delete("/contract-payments/{payment_id}")
def delete_contract_payment(payment_id: int, db: Session = Depends(get_db),
                            user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(403, "Not authorized")
    p = db.query(ContractPayment).filter(ContractPayment.id == payment_id).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    db.query(Expense).filter(Expense.contract_payment_id == p.id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}


# ── HR Approval Workflow ──────────────────────────────────────────────

APPROVAL_MODELS = {
    "salary": SalaryPayment,
    "advance_loan": AdvanceLoan,
    "benefit_deduction": StaffBenefitDeduction,
    "leave": LeaveRecord,
}

MANAGER_ROLES = ("owner", "manager", "accountant")


@router.post("/approve/{txn_type}/{txn_id}")
def approve_hr_transaction(txn_type: str, txn_id: int,
                           db: Session = Depends(get_db),
                           user: User = Depends(get_current_user)):
    """Approve an HR transaction. Only owner/manager can approve."""
    if user.role not in MANAGER_ROLES:
        raise HTTPException(403, "Only owner/manager can approve transactions")
    model = APPROVAL_MODELS.get(txn_type)
    if not model:
        raise HTTPException(400, f"Invalid transaction type: {txn_type}")
    record = db.query(model).filter(model.id == txn_id).first()
    if not record:
        raise HTTPException(404, "Record not found")
    from datetime import datetime, timezone
    record.approval_status = "approved"
    record.approved_by = user.id
    record.approval_date = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "approval_status": "approved"}


@router.post("/reject/{txn_type}/{txn_id}")
def reject_hr_transaction(txn_type: str, txn_id: int,
                          db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    """Reject an HR transaction. Only owner/manager can reject."""
    if user.role not in MANAGER_ROLES:
        raise HTTPException(403, "Only owner/manager can reject transactions")
    model = APPROVAL_MODELS.get(txn_type)
    if not model:
        raise HTTPException(400, f"Invalid transaction type: {txn_type}")
    record = db.query(model).filter(model.id == txn_id).first()
    if not record:
        raise HTTPException(404, "Record not found")
    from datetime import datetime, timezone
    record.approval_status = "rejected"
    record.approved_by = user.id
    record.approval_date = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "approval_status": "rejected"}


@router.get("/pending-approvals")
def list_pending_approvals(brand_id: Optional[int] = None,
                           db: Session = Depends(get_db),
                           user: User = Depends(get_current_user)):
    """List all pending HR transactions for manager approval."""
    if user.role not in MANAGER_ROLES:
        raise HTTPException(403, "Only owner/manager can view pending approvals")
    bb_ids = _brand_branch_ids(db, brand_id)
    results = []

    # Pending salary payments
    q = db.query(SalaryPayment).filter(SalaryPayment.approval_status == "pending_approval")
    if bb_ids is not None:
        q = q.filter(SalaryPayment.branch_id.in_(bb_ids))
    for s in q.all():
        emp = db.query(Employee).filter(Employee.id == s.employee_id).first()
        results.append({"type": "salary", "id": s.id, "employee": emp.name if emp else "?",
                        "detail": f"Salary {s.month} - KD {s.net_salary:.3f}", "date": str(s.created_at.date() if s.created_at else "")})

    # Pending advance/loans
    q = db.query(AdvanceLoan).filter(AdvanceLoan.approval_status == "pending_approval")
    for a in q.all():
        emp = db.query(Employee).filter(Employee.id == a.employee_id).first()
        results.append({"type": "advance_loan", "id": a.id, "employee": emp.name if emp else "?",
                        "detail": f"{a.loan_type.title()} - KD {a.amount:.3f}", "date": str(a.date)})

    # Pending benefits/deductions
    q = db.query(StaffBenefitDeduction).filter(StaffBenefitDeduction.approval_status == "pending_approval")
    for b in q.all():
        emp = db.query(Employee).filter(Employee.id == b.employee_id).first()
        results.append({"type": "benefit_deduction", "id": b.id, "employee": emp.name if emp else "?",
                        "detail": f"{b.category.title()} - KD {b.amount:.3f}", "date": str(b.date)})

    # Pending leaves
    q = db.query(LeaveRecord).filter(LeaveRecord.approval_status == "pending_approval")
    for l in q.all():
        emp = db.query(Employee).filter(Employee.id == l.employee_id).first()
        results.append({"type": "leave", "id": l.id, "employee": emp.name if emp else "?",
                        "detail": f"{l.leave_type.replace('_', ' ').title()} - {l.days} days", "date": str(l.start_date)})

    return results
