from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime, timezone
from typing import Optional, List
import os, uuid, json

from app.database import get_db, UPLOAD_DIR
from app.models.hr import Brand, Employee
from app.models.branch import Branch
from app.models.expense import Expense, ExpenseCategory
from app.models.cash import CashTransaction
from app.models.user import User
from app.models.renewal import (
    RenewalType, CompanyLicense, EmployeeDocument, RenewalRequest, RenewalRequestLine, RenewalRequestLog,
)
from app.utils.auth import get_current_user, hash_password
from app.routes.hr import _exclude_left_employees

router = APIRouter(prefix="/api/renewals", tags=["renewals"])

PERSONNEL_ROLE = "personnel"
PERSONNEL_MANAGER_ROLE = "personnel_manager"
PERSONNEL_ROLES = (PERSONNEL_ROLE, PERSONNEL_MANAGER_ROLE)  # restricted to the personnel module
RENEWAL_ROLES = ("owner", "manager", "accountant", PERSONNEL_ROLE, PERSONNEL_MANAGER_ROLE)
APPROVER_ROLES = ("owner", "manager", PERSONNEL_MANAGER_ROLE)
PAYER_ROLES = ("owner", "manager", "accountant", PERSONNEL_MANAGER_ROLE)  # confirm payment / manage the petty cash
PERSONNEL_BRANCH_PREFIX = "Personnel Office"
PERSONNEL_PAYMENT_METHOD = "personnel_petty_cash"
PERSONNEL_PAYMENT_METHODS = (PERSONNEL_PAYMENT_METHOD, "personnel_bank_transfer", "personnel_knet")  # never branch cash
PERSONNEL_TABS = ["dashboard", "renewals", "hr", "hr_employees", "cash", "expenses"]

SEED_TYPES = [
    ("staff", "Residency / Iqama", "الإقامة", 12),
    ("staff", "Work Permit", "إذن العمل", 12),
    ("staff", "Civil ID", "البطاقة المدنية", 12),
    ("staff", "Health Card", "البطاقة الصحية", 12),
    ("staff", "Driving License", "رخصة القيادة", 12),
    ("staff", "Passport", "جواز السفر", 60),
    ("staff", "Fine", "غرامة", 0),
    ("staff", "Other", "أخرى", 12),
    ("company", "Company / Commercial License", "الرخصة التجارية", 12),
    ("company", "Municipality Permit", "ترخيص البلدية", 12),
    ("company", "Fire Department Certificate", "شهادة الإطفاء", 12),
    ("company", "Health Department Permit", "ترخيص وزارة الصحة", 12),
    ("company", "Signboard License", "رخصة اللوحة الإعلانية", 12),
    ("company", "Vehicle Registration", "دفتر المركبة", 12),
    ("company", "Other", "أخرى", 12),
]

STATUS_FLOW = {
    "draft": "Draft", "pending": "Pending Approval", "approved": "Approved", "returned": "Returned",
    "rejected": "Rejected", "completed": "Completed - Awaiting Payment Confirmation",
    "paid": "Payment Confirmed", "closed": "Closed", "cancelled": "Cancelled",
}


# ---------------------------------------------------------------- helpers

def _now():
    return datetime.now(timezone.utc)


def _require(user: User, roles=RENEWAL_ROLES):
    if user.role not in roles:
        raise HTTPException(403, "Not authorized")


def _brand_ids_for(user: User) -> Optional[list]:
    """Brands the user may operate on (None = all)."""
    return user.get_allowed_brands()


def _check_brand(user: User, brand_id: Optional[int]):
    allowed = _brand_ids_for(user)
    if allowed is not None and brand_id is not None and brand_id not in allowed:
        raise HTTPException(403, "Brand not allowed")


def personnel_branch(db: Session, brand_id: int, create: bool = True) -> Optional[Branch]:
    """The Personnel Office cash box branch for a brand (one per brand)."""
    b = db.query(Branch).filter(Branch.brand_id == brand_id,
                                Branch.name.like(f"{PERSONNEL_BRANCH_PREFIX}%")).first()
    if b or not create:
        return b
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    suffix = f" - {brand.name_en}" if brand else ""
    suffix_ar = f" - {brand.name_ar or brand.name_en}" if brand else ""
    b = Branch(name=f"{PERSONNEL_BRANCH_PREFIX}{suffix}", name_ar=f"مكتب شؤون الموظفين{suffix_ar}",
               brand_id=brand_id, is_head_office=False, is_active=True)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def is_personnel_branch(b: Branch) -> bool:
    return (b.name or "").startswith(PERSONNEL_BRANCH_PREFIX)


def personnel_cash_balance(db: Session, branch_id: int) -> float:
    bal = 0.0
    rows = db.query(CashTransaction).filter(CashTransaction.branch_id == branch_id)\
        .order_by(CashTransaction.date.asc(), CashTransaction.id.asc()).all()
    for r in rows:
        if r.txn_type == "opening_balance":
            bal = r.amount
        elif r.category == "deposit":
            bal -= r.amount
        elif r.txn_type == "cash_in":
            bal += r.amount
        else:
            bal -= r.amount
    return round(bal, 3)


def seed_renewals(db: Session):
    """Idempotent: price-list types, Personnel Office cash boxes, mandoob login, document migration."""
    existing = {(t.group, t.name.lower()) for t in db.query(RenewalType).all()}
    for group, name, name_ar, months in SEED_TYPES:
        if (group, name.lower()) not in existing:
            db.add(RenewalType(group=group, name=name, name_ar=name_ar, default_fee=0,
                               validity_months=months, reminder_days=60, is_active=True))
    db.commit()

    brands = db.query(Brand).all()
    for br in brands:
        personnel_branch(db, br.id)

    for username, password, full_name, role in (
        ("mandoob", "Mandoob@2026", "Mandoob - Personnel Officer", PERSONNEL_ROLE),
        ("personnel.manager", "PManager@2026", "Personnel Manager", PERSONNEL_MANAGER_ROLE),
    ):
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(username=username, password_hash=hash_password(password),
                     full_name=full_name, role=role, branch_id=None)
            u.set_allowed_brands([b.id for b in brands] or None)
            db.add(u)
        if set(PERSONNEL_TABS) - set(u.get_allowed_tabs() or []):
            u.set_allowed_tabs(sorted(set(u.get_allowed_tabs() or []) | set(PERSONNEL_TABS)))
    db.commit()

    # Migrate legacy expiry columns into the document register (once per employee/type)
    res_t = db.query(RenewalType).filter(RenewalType.group == "staff", RenewalType.name == "Residency / Iqama").first()
    hc_t = db.query(RenewalType).filter(RenewalType.group == "staff", RenewalType.name == "Health Card").first()
    have = {(d.employee_id, d.type_id) for d in db.query(EmployeeDocument.employee_id, EmployeeDocument.type_id).all()}
    for emp in db.query(Employee).all():
        if res_t and emp.residency_expiry and (emp.id, res_t.id) not in have:
            db.add(EmployeeDocument(employee_id=emp.id, type_id=res_t.id, doc_no=emp.civil_id,
                                    expiry_date=emp.residency_expiry, status="active"))
        if hc_t and emp.health_card_expiry and (emp.id, hc_t.id) not in have:
            db.add(EmployeeDocument(employee_id=emp.id, type_id=hc_t.id,
                                    expiry_date=emp.health_card_expiry, status="active"))
    db.commit()


def _save_upload(f: Optional[UploadFile]) -> Optional[str]:
    if not f or not f.filename:
        return None
    ext = os.path.splitext(f.filename)[1]
    fname = f"renewal_{uuid.uuid4().hex}{ext}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, fname), "wb") as out:
        out.write(f.file.read())
    return fname


def _d(s: Optional[str]) -> Optional[date]:
    return date.fromisoformat(s) if s else None


def _days(d: Optional[date]) -> Optional[int]:
    return (d - date.today()).days if d else None


def _type_map(db: Session):
    return {t.id: t for t in db.query(RenewalType).all()}


def _branch_map(db: Session):
    return {b.id: b for b in db.query(Branch).all()}


def _type_out(t: RenewalType):
    return {"id": t.id, "group": t.group, "name": t.name, "name_ar": t.name_ar or "",
            "default_fee": t.default_fee or 0, "validity_months": t.validity_months or 0,
            "reminder_days": t.reminder_days or 0, "is_active": bool(t.is_active)}


def _license_out(l: CompanyLicense, types, branches):
    t = types.get(l.type_id)
    b = branches.get(l.branch_id)
    return {"id": l.id, "brand_id": l.brand_id, "branch_id": l.branch_id,
            "branch_name": b.name if b else "", "type_id": l.type_id,
            "type_name": t.name if t else "", "name": l.name, "employer": l.employer or "", "license_no": l.license_no,
            "authority": l.authority or "", "issue_date": str(l.issue_date) if l.issue_date else "",
            "expiry_date": str(l.expiry_date) if l.expiry_date else "",
            "days_remaining": _days(l.expiry_date), "status": l.status,
            "notes": l.notes or "", "file1": l.file1, "file2": l.file2, "file3": l.file3}


def _doc_out(d: EmployeeDocument, emp: Optional[Employee], types, branches):
    t = types.get(d.type_id)
    b = branches.get(emp.branch_id) if emp else None
    return {"id": d.id, "employee_id": d.employee_id, "employee_name": emp.name if emp else "",
            "employee_name_ar": (emp.name_ar or "") if emp else "", "civil_id": (emp.civil_id or "") if emp else "",
            "branch_id": emp.branch_id if emp else None, "branch_name": b.name if b else "",
            "type_id": d.type_id, "type_name": t.name if t else "", "doc_no": d.doc_no or "",
            "authority": d.authority or "", "issue_date": str(d.issue_date) if d.issue_date else "",
            "expiry_date": str(d.expiry_date) if d.expiry_date else "",
            "days_remaining": _days(d.expiry_date), "status": d.status, "notes": d.notes or "",
            "file1": d.file1, "file2": d.file2, "file3": d.file3}


def _user_name(db: Session, uid: Optional[int]) -> str:
    if not uid:
        return ""
    u = db.query(User).filter(User.id == uid).first()
    return u.full_name if u else ""


def _lines_out(db: Session, req_id: int, types):
    out = []
    for ln in db.query(RenewalRequestLine).filter(RenewalRequestLine.request_id == req_id).order_by(RenewalRequestLine.id).all():
        t = types.get(ln.type_id)
        out.append({
            "id": ln.id, "type_id": ln.type_id, "type_name": t.name if t else "",
            "type_name_ar": (t.name_ar or "") if t else "",
            "description": ln.description or "",
            "current_expiry": str(ln.current_expiry) if ln.current_expiry else "",
            "new_expiry": str(ln.new_expiry) if ln.new_expiry else "",
            "new_doc_no": ln.new_doc_no or "", "qty": ln.qty if ln.qty is not None else 1,
            "fee": ln.fee or 0, "extra_charges": ln.extra_charges or 0,
            "extra_desc": ln.extra_desc or "",
            "line_total": _line_total(ln),
            "actual_amount": ln.actual_amount, "expense_id": ln.expense_id,
        })
    return out


def _line_total(ln: RenewalRequestLine) -> float:
    qty = ln.qty if ln.qty is not None else 1
    return round(qty * (ln.fee or 0) + (ln.extra_charges or 0), 3)


def request_out(db: Session, r: RenewalRequest, detail: bool = False):
    types = _type_map(db)
    branches = _branch_map(db)
    emp = db.query(Employee).filter(Employee.id == r.employee_id).first() if r.employee_id else None
    lic = db.query(CompanyLicense).filter(CompanyLicense.id == r.license_id).first() if r.license_id else None
    is_new_emp = r.group == "staff" and not emp and bool(r.new_emp_name)
    branch_id = emp.branch_id if emp else (lic.branch_id if lic else None)
    if is_new_emp and not branch_id and r.brand_id:
        pb = personnel_branch(db, r.brand_id, create=False)
        branch_id = pb.id if pb else None
    b = branches.get(branch_id)
    d = {
        "id": r.id, "request_no": r.request_no, "brand_id": r.brand_id, "group": r.group,
        "employee_id": r.employee_id, "license_id": r.license_id,
        "is_new_employee": is_new_emp,
        "subject_name": emp.name if emp else (lic.name if lic else (r.new_emp_name or "")),
        "subject_name_ar": (emp.name_ar or "") if emp else ((r.new_emp_name_ar or "") if is_new_emp else ""),
        "subject_employer": (emp.employer or "") if emp else ((lic.employer or "") if lic else ""),
        "subject_id_no": (emp.civil_id or "") if emp else (lic.license_no if lic else (r.new_emp_civil_id or "")),
        "subject_position": (emp.position or "") if emp else ((lic.authority or "") if lic else ""),
        "subject_phone": (emp.phone or "") if emp else ((r.new_emp_phone or "") if is_new_emp else ""),
        "new_emp_join_date": str(r.new_emp_join_date) if is_new_emp and r.new_emp_join_date else "",
        "branch_id": branch_id, "branch_name": b.name if b else "",
        "urgency": r.urgency or "normal", "notes": r.notes or "", "status": r.status,
        "status_label": STATUS_FLOW.get(r.status, r.status), "total": r.total or 0,
        "requested_by": r.requested_by, "requested_by_name": _user_name(db, r.requested_by),
        "requested_at": str(r.requested_at)[:16] if r.requested_at else "",
        "submitted_at": str(r.submitted_at)[:16] if r.submitted_at else "",
        "approved_by_name": _user_name(db, r.approved_by),
        "approved_at": str(r.approved_at)[:16] if r.approved_at else "",
        "approved_amount": r.approved_amount, "approval_comment": r.approval_comment or "",
        "paid_date": str(r.paid_date) if r.paid_date else "", "paid_amount": r.paid_amount,
        "receipt_no": r.receipt_no or "", "paid_by_name": _user_name(db, r.paid_by),
        "payment_method": r.payment_method or PERSONNEL_PAYMENT_METHOD,
        "completed_date": str(r.completed_date) if r.completed_date else "",
        "completed_by_name": _user_name(db, r.completed_by),
        "completed_at": str(r.completed_at)[:16] if r.completed_at else "",
        "common_expense": bool(r.common_expense),
        "file1": r.file1, "file2": r.file2, "file3": r.file3,
        "line_count": db.query(func.count(RenewalRequestLine.id)).filter(RenewalRequestLine.request_id == r.id).scalar() or 0,
    }
    if detail:
        d["lines"] = _lines_out(db, r.id, types)
        d["logs"] = [{"status": l.status, "label": STATUS_FLOW.get(l.status, l.status), "comment": l.comment or "",
                      "user_name": _user_name(db, l.user_id), "at": str(l.created_at)[:16]}
                     for l in db.query(RenewalRequestLog).filter(RenewalRequestLog.request_id == r.id)
                     .order_by(RenewalRequestLog.id).all()]
        d["last_transaction"] = last_transaction(db, r.group, r.employee_id, r.license_id, exclude_request_id=r.id)
    return d


def last_transaction(db: Session, group: str, employee_id: Optional[int], license_id: Optional[int],
                     exclude_request_id: Optional[int] = None):
    q = db.query(RenewalRequest).filter(RenewalRequest.status.in_(("paid", "closed")))
    if group == "staff":
        if not employee_id:
            return None
        q = q.filter(RenewalRequest.employee_id == employee_id)
    else:
        if not license_id:
            return None
        q = q.filter(RenewalRequest.license_id == license_id)
    if exclude_request_id:
        q = q.filter(RenewalRequest.id != exclude_request_id)
    r = q.order_by(RenewalRequest.paid_date.desc(), RenewalRequest.id.desc()).first()
    if not r:
        return None
    types = _type_map(db)
    return {"request_no": r.request_no, "paid_date": str(r.paid_date) if r.paid_date else "",
            "paid_amount": r.paid_amount or r.total or 0, "lines": _lines_out(db, r.id, types),
            "paid_by_name": _user_name(db, r.paid_by)}


def _log(db: Session, req: RenewalRequest, status: str, user: User, comment: Optional[str] = None):
    db.add(RenewalRequestLog(request_id=req.id, status=status, comment=comment, user_id=user.id))


def _next_request_no(db: Session, brand_id: Optional[int]) -> str:
    y = date.today().year
    prefix = f"RN-{brand_id or 0}-{y}-"
    n = db.query(func.count(RenewalRequest.id)).filter(RenewalRequest.request_no.like(f"{prefix}%")).scalar() or 0
    return f"{prefix}{n + 1:04d}"


def _renewal_category(db: Session, t: Optional[RenewalType]) -> ExpenseCategory:
    name = t.name if t else "Renewals"
    cat = db.query(ExpenseCategory).filter(func.lower(ExpenseCategory.name) == name.lower()).first()
    if not cat:
        cat = ExpenseCategory(name=name, name_ar=(t.name_ar if t else "تجديدات"), is_active=True)
        db.add(cat)
        db.flush()
    return cat


# ---------------------------------------------------------------- types (price list)

@router.get("/types")
def list_types(group: Optional[str] = None, include_inactive: bool = False,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    q = db.query(RenewalType)
    if group:
        q = q.filter(RenewalType.group == group)
    if not include_inactive:
        q = q.filter(RenewalType.is_active == True)  # noqa: E712
    return [_type_out(t) for t in q.order_by(RenewalType.group, RenewalType.name).all()]


@router.post("/types")
def create_type(group: str = Form(...), name: str = Form(...), name_ar: str = Form(""),
                default_fee: float = Form(0), validity_months: int = Form(12), reminder_days: int = Form(60),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    if group not in ("staff", "company"):
        raise HTTPException(400, "group must be staff or company")
    t = RenewalType(group=group, name=name.strip(), name_ar=name_ar or None, default_fee=default_fee,
                    validity_months=validity_months, reminder_days=reminder_days, is_active=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _type_out(t)


@router.put("/types/{type_id}")
def update_type(type_id: int, name: str = Form(...), name_ar: str = Form(""), default_fee: float = Form(0),
                validity_months: int = Form(12), reminder_days: int = Form(60), is_active: bool = Form(True),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    t = db.query(RenewalType).filter(RenewalType.id == type_id).first()
    if not t:
        raise HTTPException(404, "Type not found")
    t.name, t.name_ar, t.default_fee = name.strip(), name_ar or None, default_fee
    t.validity_months, t.reminder_days, t.is_active = validity_months, reminder_days, is_active
    db.commit()
    return _type_out(t)


@router.delete("/types/{type_id}")
def delete_type(type_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, ("owner", "manager"))
    t = db.query(RenewalType).filter(RenewalType.id == type_id).first()
    if not t:
        raise HTTPException(404, "Type not found")
    used = db.query(RenewalRequestLine).filter(RenewalRequestLine.type_id == type_id).first() \
        or db.query(EmployeeDocument).filter(EmployeeDocument.type_id == type_id).first() \
        or db.query(CompanyLicense).filter(CompanyLicense.type_id == type_id).first()
    if used:
        t.is_active = False
        db.commit()
        return {"ok": True, "deactivated": True}
    db.delete(t)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- company licenses

@router.get("/licenses")
def list_licenses(brand_id: Optional[int] = None, branch_id: Optional[int] = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    q = db.query(CompanyLicense)
    allowed = _brand_ids_for(user)
    if brand_id:
        q = q.filter(CompanyLicense.brand_id == brand_id)
    elif allowed is not None:
        q = q.filter(CompanyLicense.brand_id.in_(allowed))
    if branch_id:
        q = q.filter(CompanyLicense.branch_id == branch_id)
    types, branches = _type_map(db), _branch_map(db)
    return [_license_out(l, types, branches) for l in q.order_by(CompanyLicense.expiry_date).all()]


@router.post("/licenses")
def create_license(brand_id: int = Form(...), branch_id: Optional[int] = Form(None), type_id: Optional[int] = Form(None),
                   name: str = Form(...), license_no: str = Form(...), authority: str = Form(""), employer: str = Form(""),
                   issue_date: str = Form(""), expiry_date: str = Form(""), notes: str = Form(""),
                   file1: Optional[UploadFile] = File(None), file2: Optional[UploadFile] = File(None),
                   file3: Optional[UploadFile] = File(None),
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    _check_brand(user, brand_id)
    license_no = license_no.strip()
    if db.query(CompanyLicense).filter(CompanyLicense.license_no == license_no).first():
        raise HTTPException(400, f"License number {license_no} already exists")
    l = CompanyLicense(brand_id=brand_id, branch_id=branch_id or None, type_id=type_id or None, name=name.strip(),
                       employer=employer.strip() or None, license_no=license_no, authority=authority or None, issue_date=_d(issue_date),
                       expiry_date=_d(expiry_date), notes=notes or None, status="active",
                       file1=_save_upload(file1), file2=_save_upload(file2), file3=_save_upload(file3))
    db.add(l)
    db.commit()
    db.refresh(l)
    return _license_out(l, _type_map(db), _branch_map(db))


@router.put("/licenses/{license_id}")
def update_license(license_id: int, branch_id: Optional[int] = Form(None), type_id: Optional[int] = Form(None),
                   name: str = Form(...), license_no: str = Form(...), authority: str = Form(""), employer: str = Form(""),
                   issue_date: str = Form(""), expiry_date: str = Form(""), notes: str = Form(""),
                   status: str = Form("active"),
                   file1: Optional[UploadFile] = File(None), file2: Optional[UploadFile] = File(None),
                   file3: Optional[UploadFile] = File(None),
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    l = db.query(CompanyLicense).filter(CompanyLicense.id == license_id).first()
    if not l:
        raise HTTPException(404, "License not found")
    _check_brand(user, l.brand_id)
    license_no = license_no.strip()
    dup = db.query(CompanyLicense).filter(CompanyLicense.license_no == license_no, CompanyLicense.id != l.id).first()
    if dup:
        raise HTTPException(400, f"License number {license_no} already exists")
    l.branch_id, l.type_id, l.name, l.license_no = branch_id or None, type_id or None, name.strip(), license_no
    l.authority, l.issue_date, l.expiry_date = authority or None, _d(issue_date), _d(expiry_date)
    l.employer = employer.strip() or None
    l.notes, l.status = notes or None, status
    for attr, f in (("file1", file1), ("file2", file2), ("file3", file3)):
        saved = _save_upload(f)
        if saved:
            setattr_file(l, attr, saved)
    db.commit()
    return _license_out(l, _type_map(db), _branch_map(db))


def setattr_file(obj, attr: str, value: str):
    if attr == "file1":
        obj.file1 = value
    elif attr == "file2":
        obj.file2 = value
    else:
        obj.file3 = value


@router.delete("/licenses/{license_id}")
def delete_license(license_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, ("owner", "manager"))
    l = db.query(CompanyLicense).filter(CompanyLicense.id == license_id).first()
    if not l:
        raise HTTPException(404, "License not found")
    if db.query(RenewalRequest).filter(RenewalRequest.license_id == l.id).first():
        l.status = "cancelled"
        db.commit()
        return {"ok": True, "cancelled": True}
    db.delete(l)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- employee documents

@router.get("/documents")
def list_documents(brand_id: Optional[int] = None, branch_id: Optional[int] = None,
                   employee_id: Optional[int] = None, include_left: bool = False,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    eq = db.query(Employee)
    if not include_left:
        eq = _exclude_left_employees(eq)
    allowed = _brand_ids_for(user)
    branches = _branch_map(db)
    if brand_id:
        eq = eq.filter(Employee.branch_id.in_([b.id for b in branches.values() if b.brand_id == brand_id]))
    elif allowed is not None:
        eq = eq.filter(Employee.branch_id.in_([b.id for b in branches.values() if b.brand_id in allowed]))
    if branch_id:
        eq = eq.filter(Employee.branch_id == branch_id)
    if employee_id:
        eq = eq.filter(Employee.id == employee_id)
    emps = {e.id: e for e in eq.all()}
    if not emps:
        return []
    types = _type_map(db)
    docs = db.query(EmployeeDocument).filter(EmployeeDocument.employee_id.in_(list(emps.keys()))).all()
    out = [_doc_out(d, emps.get(d.employee_id), types, branches) for d in docs]
    out.sort(key=lambda x: (x["expiry_date"] or "9999", x["employee_name"]))
    return out


@router.post("/documents")
def create_document(employee_id: int = Form(...), type_id: int = Form(...), doc_no: str = Form(""),
                    authority: str = Form(""), issue_date: str = Form(""), expiry_date: str = Form(""),
                    notes: str = Form(""),
                    file1: Optional[UploadFile] = File(None), file2: Optional[UploadFile] = File(None),
                    file3: Optional[UploadFile] = File(None),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    d = EmployeeDocument(employee_id=employee_id, type_id=type_id, doc_no=doc_no or None,
                         authority=authority or None, issue_date=_d(issue_date), expiry_date=_d(expiry_date),
                         notes=notes or None, status="active",
                         file1=_save_upload(file1), file2=_save_upload(file2), file3=_save_upload(file3))
    db.add(d)
    _sync_employee_legacy(db, emp, type_id, d.expiry_date)
    db.commit()
    db.refresh(d)
    return _doc_out(d, emp, _type_map(db), _branch_map(db))


def _sync_employee_legacy(db: Session, emp: Employee, type_id: int, expiry: Optional[date]):
    t = db.query(RenewalType).filter(RenewalType.id == type_id).first()
    if not t or not expiry:
        return
    if t.name == "Residency / Iqama":
        emp.residency_expiry = expiry
    elif t.name == "Health Card":
        emp.health_card_expiry = expiry


@router.put("/documents/{doc_id}")
def update_document(doc_id: int, type_id: int = Form(...), doc_no: str = Form(""), authority: str = Form(""),
                    issue_date: str = Form(""), expiry_date: str = Form(""), notes: str = Form(""),
                    status: str = Form("active"),
                    file1: Optional[UploadFile] = File(None), file2: Optional[UploadFile] = File(None),
                    file3: Optional[UploadFile] = File(None),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    d = db.query(EmployeeDocument).filter(EmployeeDocument.id == doc_id).first()
    if not d:
        raise HTTPException(404, "Document not found")
    d.type_id, d.doc_no, d.authority = type_id, doc_no or None, authority or None
    d.issue_date, d.expiry_date, d.notes, d.status = _d(issue_date), _d(expiry_date), notes or None, status
    for attr, f in (("file1", file1), ("file2", file2), ("file3", file3)):
        saved = _save_upload(f)
        if saved:
            setattr_file(d, attr, saved)
    emp = db.query(Employee).filter(Employee.id == d.employee_id).first()
    if emp:
        _sync_employee_legacy(db, emp, type_id, d.expiry_date)
    db.commit()
    return _doc_out(d, emp, _type_map(db), _branch_map(db))


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, ("owner", "manager"))
    d = db.query(EmployeeDocument).filter(EmployeeDocument.id == doc_id).first()
    if not d:
        raise HTTPException(404, "Document not found")
    db.delete(d)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- dashboard / expiry

@router.get("/expiry")
def expiry_board(brand_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """All staff documents + company licenses with days remaining."""
    _require(user)
    docs = list_documents(brand_id=brand_id, db=db, user=user)
    lics = list_licenses(brand_id=brand_id, db=db, user=user)
    out = []
    for d in docs:
        out.append({"kind": "staff", "ref_id": d["id"], "employee_id": d["employee_id"], "license_id": None,
                    "name": d["employee_name"], "id_no": d["civil_id"], "branch_id": d["branch_id"],
                    "branch_name": d["branch_name"], "type_id": d["type_id"], "type_name": d["type_name"],
                    "doc_no": d["doc_no"], "expiry_date": d["expiry_date"], "days_remaining": d["days_remaining"],
                    "status": d["status"]})
    for l in lics:
        if l["status"] == "cancelled":
            continue
        out.append({"kind": "company", "ref_id": l["id"], "employee_id": None, "license_id": l["id"],
                    "name": l["name"], "id_no": l["license_no"], "branch_id": l["branch_id"],
                    "branch_name": l["branch_name"], "type_id": l["type_id"], "type_name": l["type_name"],
                    "doc_no": l["license_no"], "expiry_date": l["expiry_date"], "days_remaining": l["days_remaining"],
                    "status": l["status"]})
    out.sort(key=lambda x: (x["expiry_date"] or "9999"))
    return out


@router.get("/summary")
def summary(brand_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    board = expiry_board(brand_id=brand_id, db=db, user=user)
    expired = sum(1 for x in board if x["days_remaining"] is not None and x["days_remaining"] < 0)
    d30 = sum(1 for x in board if x["days_remaining"] is not None and 0 <= x["days_remaining"] <= 30)
    d90 = sum(1 for x in board if x["days_remaining"] is not None and 30 < x["days_remaining"] <= 90)
    rq = db.query(RenewalRequest)
    if brand_id:
        rq = rq.filter(RenewalRequest.brand_id == brand_id)
    pending = rq.filter(RenewalRequest.status == "pending").count()
    approved = rq.filter(RenewalRequest.status == "approved").count()
    completed = rq.filter(RenewalRequest.status == "completed").count()
    pb = personnel_branch(db, brand_id, create=False) if brand_id else None
    return {"expired": expired, "due_30": d30, "due_90": d90, "pending_approval": pending,
            "approved_unpaid": approved, "completed_unpaid": completed,
            "petty_cash_branch_id": pb.id if pb else None, "petty_cash_branch_name": pb.name if pb else "",
            "petty_cash_balance": personnel_cash_balance(db, pb.id) if pb else 0}


@router.get("/dashboard")
def personnel_dashboard(brand_id: Optional[int] = None, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """Personnel Officer home: petty cash, renewals pipeline, expiries ."""
    _require(user)
    _check_brand(user, brand_id)
    today = date.today()
    month_start = today.replace(day=1)
    board = expiry_board(brand_id=brand_id, db=db, user=user)
    expired = [x for x in board if x["days_remaining"] is not None and x["days_remaining"] < 0]
    due_30 = [x for x in board if x["days_remaining"] is not None and 0 <= x["days_remaining"] <= 30]
    due_90 = [x for x in board if x["days_remaining"] is not None and 30 < x["days_remaining"] <= 90]

    rq = db.query(RenewalRequest)
    if brand_id:
        rq = rq.filter(RenewalRequest.brand_id == brand_id)
    counts = {s: 0 for s in STATUS_FLOW}
    for st, n in rq.with_entities(RenewalRequest.status, func.count(RenewalRequest.id)).group_by(RenewalRequest.status).all():
        counts[st] = n
    recent = [request_out(db, r) for r in rq.order_by(RenewalRequest.id.desc()).limit(8).all()]

    pb = personnel_branch(db, brand_id, create=False) if brand_id else None
    cash_in_month = cash_out_month = 0.0
    recent_cash = []
    if pb:
        ctx = db.query(CashTransaction).filter(CashTransaction.branch_id == pb.id)
        for r in ctx.filter(CashTransaction.date >= month_start).all():
            if r.txn_type == "cash_in" and r.category != "deposit":
                cash_in_month += r.amount
            elif r.txn_type != "opening_balance":
                cash_out_month += r.amount
        recent_cash = [{"id": r.id, "date": str(r.date), "txn_type": r.txn_type, "category": r.category,
                        "amount": r.amount, "reference": r.reference or "", "notes": r.notes or ""}
                       for r in ctx.order_by(CashTransaction.date.desc(), CashTransaction.id.desc()).limit(8).all()]

    branches = _branch_map(db)
    ex = db.query(Expense).filter(Expense.renewal_request_id.isnot(None))
    if brand_id:
        ex = ex.filter(Expense.branch_id.in_([b.id for b in branches.values() if b.brand_id == brand_id]))
    spend_month = ex.filter(Expense.date >= month_start).with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar() or 0
    spend_by_branch = [{"branch_id": bid, "branch_name": branches[bid].name if bid in branches else "", "amount": round(float(a), 3)}
                       for bid, a in ex.with_entities(Expense.branch_id, func.sum(Expense.amount)).group_by(Expense.branch_id).all()]
    spend_by_branch.sort(key=lambda x: -x["amount"])

    upcoming = sorted(expired + due_30 + due_90, key=lambda x: (x["days_remaining"] if x["days_remaining"] is not None else 9999))[:10]
    return {
        "petty_cash_branch_name": pb.name if pb else "",
        "petty_cash_balance": personnel_cash_balance(db, pb.id) if pb else 0,
        "cash_in_month": round(cash_in_month, 3), "cash_out_month": round(cash_out_month, 3),
        "renewal_spend_month": round(float(spend_month), 3),
        "expired": len(expired), "due_30": len(due_30), "due_90": len(due_90),
        "documents_total": len(board),
        "requests": counts, "recent_requests": recent, "upcoming": upcoming,
        "recent_cash": recent_cash, "spend_by_branch": spend_by_branch,
    }


@router.get("/last-transaction")
def get_last_transaction(group: str, employee_id: Optional[int] = None, license_id: Optional[int] = None,
                         db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    lt = last_transaction(db, group, employee_id, license_id)
    open_q = db.query(RenewalRequest).filter(RenewalRequest.status.in_(("draft", "pending", "approved", "returned", "completed")))
    if group == "staff":
        open_q = open_q.filter(RenewalRequest.employee_id == employee_id)
    else:
        open_q = open_q.filter(RenewalRequest.license_id == license_id)
    open_reqs = [{"id": r.id, "request_no": r.request_no, "status": r.status} for r in open_q.all()]
    return {"last": lt, "open_requests": open_reqs}


# ---------------------------------------------------------------- requests

class LineIn(BaseModel):
    type_id: int
    description: Optional[str] = None
    current_expiry: Optional[str] = None
    new_expiry: Optional[str] = None
    new_doc_no: Optional[str] = None
    qty: float = 1
    fee: float = 0
    extra_charges: float = 0
    extra_desc: Optional[str] = None


class NewEmployeeIn(BaseModel):
    """Prospective employee not yet in HR; stored on the request only."""
    name: str
    name_ar: Optional[str] = None
    civil_id: Optional[str] = None
    phone: Optional[str] = None
    join_date: Optional[str] = None


class RequestIn(BaseModel):
    brand_id: int
    group: str
    employee_id: Optional[int] = None
    new_employee: Optional[NewEmployeeIn] = None
    license_id: Optional[int] = None
    urgency: str = "normal"
    notes: Optional[str] = None
    submit: bool = False
    common_expense: bool = False
    lines: List[LineIn]


def _validate_new_employee(db: Session, body: RequestIn) -> None:
    ne = body.new_employee
    if not ne.name.strip():
        raise HTTPException(400, "New employee name is required")
    civil_id = (ne.civil_id or "").strip() or None
    if civil_id:
        dup = db.query(Employee).join(Branch, Branch.id == Employee.branch_id).filter(
            Employee.civil_id == civil_id, Branch.brand_id == body.brand_id).first()
        if dup:
            raise HTTPException(400, f"An employee with Civil ID {civil_id} already exists: {dup.name}. Select the existing employee.")


def _apply_new_employee(r: RenewalRequest, body: RequestIn) -> None:
    ne = body.new_employee if body.group == "staff" and not body.employee_id else None
    r.new_emp_name = ne.name.strip() if ne else None
    r.new_emp_name_ar = ((ne.name_ar or "").strip() or None) if ne else None
    r.new_emp_civil_id = ((ne.civil_id or "").strip() or None) if ne else None
    r.new_emp_phone = ((ne.phone or "").strip() or None) if ne else None
    r.new_emp_join_date = _d(ne.join_date) if ne else None


def _validate_request(db: Session, body: RequestIn):
    if body.group not in ("staff", "company"):
        raise HTTPException(400, "group must be staff or company")
    if body.group == "staff":
        if body.new_employee and not body.employee_id:
            _validate_new_employee(db, body)
        elif not body.employee_id or not db.query(Employee).filter(Employee.id == body.employee_id).first():
            raise HTTPException(400, "Employee is required")
    else:
        if not body.license_id or not db.query(CompanyLicense).filter(CompanyLicense.id == body.license_id).first():
            raise HTTPException(400, "Company license is required")
    if not body.lines:
        raise HTTPException(400, "At least one line is required")
    types = _type_map(db)
    for ln in body.lines:
        t = types.get(ln.type_id)
        if not t:
            raise HTTPException(400, "Unknown renewal type")
        if t.group != body.group:
            raise HTTPException(400, f"Type '{t.name}' belongs to the {t.group} group, not {body.group}")


def _replace_lines(db: Session, req: RenewalRequest, lines: List[LineIn]):
    db.query(RenewalRequestLine).filter(RenewalRequestLine.request_id == req.id).delete()
    total = 0.0
    for ln in lines:
        qty = ln.qty if ln.qty and ln.qty > 0 else 1
        total += qty * (ln.fee or 0) + (ln.extra_charges or 0)
        db.add(RenewalRequestLine(request_id=req.id, type_id=ln.type_id, description=ln.description or None,
                                  current_expiry=_d(ln.current_expiry), new_expiry=_d(ln.new_expiry),
                                  new_doc_no=ln.new_doc_no or None, qty=qty, fee=ln.fee or 0,
                                  extra_charges=ln.extra_charges or 0, extra_desc=ln.extra_desc or None))
    req.total = round(total, 3)


@router.get("/requests")
def list_requests(brand_id: Optional[int] = None, status: Optional[str] = None, group: Optional[str] = None,
                  date_from: Optional[str] = None, date_to: Optional[str] = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    q = db.query(RenewalRequest)
    allowed = _brand_ids_for(user)
    if brand_id:
        q = q.filter(RenewalRequest.brand_id == brand_id)
    elif allowed is not None:
        q = q.filter(RenewalRequest.brand_id.in_(allowed))
    if status:
        q = q.filter(RenewalRequest.status.in_(status.split(",")))
    if group:
        q = q.filter(RenewalRequest.group == group)
    if date_from:
        q = q.filter(func.date(RenewalRequest.requested_at) >= date_from)
    if date_to:
        q = q.filter(func.date(RenewalRequest.requested_at) <= date_to)
    return [request_out(db, r) for r in q.order_by(RenewalRequest.id.desc()).all()]


@router.get("/requests/{req_id}")
def get_request(req_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    r = db.query(RenewalRequest).filter(RenewalRequest.id == req_id).first()
    if not r:
        raise HTTPException(404, "Request not found")
    _check_brand(user, r.brand_id)
    return request_out(db, r, detail=True)


@router.post("/requests")
def create_request(body: RequestIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    _check_brand(user, body.brand_id)
    _validate_request(db, body)
    r = RenewalRequest(request_no=_next_request_no(db, body.brand_id), brand_id=body.brand_id, group=body.group,
                       employee_id=body.employee_id if body.group == "staff" else None,
                       license_id=body.license_id if body.group == "company" else None,
                       urgency=body.urgency or "normal", notes=body.notes or None, status="draft",
                       common_expense=bool(body.common_expense),
                       requested_by=user.id, requested_at=_now())
    _apply_new_employee(r, body)
    db.add(r)
    db.flush()
    _replace_lines(db, r, body.lines)
    _log(db, r, "draft", user)
    if body.submit:
        r.status, r.submitted_at = "pending", _now()
        _log(db, r, "pending", user)
    db.commit()
    return request_out(db, r, detail=True)


@router.put("/requests/{req_id}")
def update_request(req_id: int, body: RequestIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    r = db.query(RenewalRequest).filter(RenewalRequest.id == req_id).first()
    if not r:
        raise HTTPException(404, "Request not found")
    _check_brand(user, r.brand_id)
    if r.status not in ("draft", "returned"):
        raise HTTPException(400, "Only draft or returned requests can be edited")
    _validate_request(db, body)
    r.group, r.urgency, r.notes = body.group, body.urgency or "normal", body.notes or None
    r.common_expense = bool(body.common_expense)
    r.employee_id = body.employee_id if body.group == "staff" else None
    r.license_id = body.license_id if body.group == "company" else None
    _apply_new_employee(r, body)
    _replace_lines(db, r, body.lines)
    if body.submit:
        r.status, r.submitted_at = "pending", _now()
        _log(db, r, "pending", user)
    db.commit()
    return request_out(db, r, detail=True)


def _get_req(db: Session, user: User, req_id: int) -> RenewalRequest:
    r = db.query(RenewalRequest).filter(RenewalRequest.id == req_id).first()
    if not r:
        raise HTTPException(404, "Request not found")
    _check_brand(user, r.brand_id)
    return r


@router.post("/requests/{req_id}/submit")
def submit_request(req_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    r = _get_req(db, user, req_id)
    if r.status not in ("draft", "returned"):
        raise HTTPException(400, f"Cannot submit a request in status {r.status}")
    if not db.query(RenewalRequestLine).filter(RenewalRequestLine.request_id == r.id).first():
        raise HTTPException(400, "Add at least one line before submitting")
    r.status, r.submitted_at = "pending", _now()
    _log(db, r, "pending", user)
    db.commit()
    return request_out(db, r, detail=True)


@router.post("/requests/{req_id}/approve")
def approve_request(req_id: int, approved_amount: Optional[float] = Form(None), comment: str = Form(""),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user, APPROVER_ROLES)
    r = _get_req(db, user, req_id)
    if r.status != "pending":
        raise HTTPException(400, "Only pending requests can be approved")
    if r.requested_by == user.id and user.role != "owner":
        raise HTTPException(403, "You cannot approve your own request")
    r.status, r.approved_by, r.approved_at = "approved", user.id, _now()
    r.approved_amount = approved_amount if approved_amount is not None else r.total
    r.approval_comment = comment or None
    _log(db, r, "approved", user, comment or None)
    db.commit()
    return request_out(db, r, detail=True)


@router.post("/requests/{req_id}/return")
def return_request(req_id: int, comment: str = Form(...), db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    _require(user, APPROVER_ROLES)
    r = _get_req(db, user, req_id)
    if r.status != "pending":
        raise HTTPException(400, "Only pending requests can be returned")
    r.status, r.approval_comment = "returned", comment
    _log(db, r, "returned", user, comment)
    db.commit()
    return request_out(db, r, detail=True)


@router.post("/requests/{req_id}/reject")
def reject_request(req_id: int, comment: str = Form(...), db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    _require(user, APPROVER_ROLES)
    r = _get_req(db, user, req_id)
    if r.status not in ("pending", "approved"):
        raise HTTPException(400, "Only pending/approved requests can be rejected")
    r.status, r.approval_comment, r.approved_by, r.approved_at = "rejected", comment, user.id, _now()
    _log(db, r, "rejected", user, comment)
    db.commit()
    return request_out(db, r, detail=True)


@router.post("/requests/{req_id}/cancel")
def cancel_request(req_id: int, comment: str = Form(""), db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    _require(user)
    r = _get_req(db, user, req_id)
    if r.status in ("paid", "closed"):
        raise HTTPException(400, "Paid requests cannot be cancelled")
    if r.status in ("approved", "completed") and user.role not in APPROVER_ROLES:
        raise HTTPException(403, "Only the Operations Manager can cancel an approved request")
    r.status = "cancelled"
    _log(db, r, "cancelled", user, comment or None)
    db.commit()
    return request_out(db, r, detail=True)


@router.delete("/requests/{req_id}")
def delete_request(req_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    r = _get_req(db, user, req_id)
    if r.status != "draft":
        raise HTTPException(400, "Only draft requests can be deleted")
    db.query(RenewalRequestLine).filter(RenewalRequestLine.request_id == r.id).delete()
    db.query(RenewalRequestLog).filter(RenewalRequestLog.request_id == r.id).delete()
    db.delete(r)
    db.commit()
    return {"ok": True}


def _parse_actuals(actuals: str) -> dict:
    try:
        return {int(k): float(v) for k, v in json.loads(actuals or "{}").items()}
    except (ValueError, AttributeError):
        raise HTTPException(400, "Invalid actual amounts")


def _update_registers(db: Session, r: RenewalRequest, emp, lic, lines, done_date: date):
    types = _type_map(db)
    for ln in lines:
        t = types.get(ln.type_id)
        if r.group == "staff" and emp and t and t.name != "Fine":
            if not (ln.new_expiry or ln.new_doc_no):
                continue
            doc = db.query(EmployeeDocument).filter(EmployeeDocument.employee_id == emp.id,
                                                    EmployeeDocument.type_id == ln.type_id).first()
            if not doc:
                doc = EmployeeDocument(employee_id=emp.id, type_id=ln.type_id, status="active")
                db.add(doc)
            if ln.new_expiry:
                doc.expiry_date, doc.issue_date, doc.status = ln.new_expiry, done_date, "active"
            if ln.new_doc_no:
                doc.doc_no = ln.new_doc_no
            _sync_employee_legacy(db, emp, ln.type_id, ln.new_expiry)
        elif r.group == "company" and lic:
            if ln.new_expiry:
                lic.expiry_date, lic.issue_date, lic.status = ln.new_expiry, done_date, "active"
            if ln.new_doc_no:
                lic.license_no = ln.new_doc_no


@router.post("/requests/{req_id}/complete")
def complete_request(req_id: int, completed_date: str = Form(...), receipt_no: str = Form(""),
                     actuals: str = Form("{}"), notes: str = Form(""), common_expense: bool = Form(False),
                     file1: Optional[UploadFile] = File(None), file2: Optional[UploadFile] = File(None),
                     file3: Optional[UploadFile] = File(None),
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Personnel Officer reports the approved task as done (actual amounts, receipt, renewed documents).
    No cash or expense is posted until a manager / accountant confirms the payment."""
    _require(user)
    r = _get_req(db, user, req_id)
    if r.status != "approved":
        raise HTTPException(400, "Only approved requests can be marked completed")
    actual_map = _parse_actuals(actuals)
    done = _d(completed_date) or date.today()
    total = 0.0
    lines = db.query(RenewalRequestLine).filter(RenewalRequestLine.request_id == r.id).order_by(RenewalRequestLine.id).all()
    for ln in lines:
        amt = actual_map.get(ln.id, _line_total(ln))
        ln.actual_amount = round(amt, 3)
        total += amt
    emp = db.query(Employee).filter(Employee.id == r.employee_id).first() if r.employee_id else None
    lic = db.query(CompanyLicense).filter(CompanyLicense.id == r.license_id).first() if r.license_id else None
    _update_registers(db, r, emp, lic, lines, done)
    r.status, r.completed_date, r.completed_by, r.completed_at = "completed", done, user.id, _now()
    r.receipt_no = receipt_no or None
    r.common_expense = bool(common_expense)
    if notes:
        r.notes = f"{r.notes}\n{notes}" if r.notes else notes
    for attr, f in (("file1", file1), ("file2", file2), ("file3", file3)):
        saved = _save_upload(f)
        if saved:
            setattr_file(r, attr, saved)
    _log(db, r, "completed", user, f"KD {round(total, 3):.3f}" + (f" · receipt {receipt_no}" if receipt_no else ""))
    db.commit()
    return request_out(db, r, detail=True)


@router.post("/requests/{req_id}/pay")
def pay_request(req_id: int, paid_date: str = Form(""), receipt_no: str = Form(""),
                actuals: str = Form("{}"), notes: str = Form(""), common_expense: Optional[bool] = Form(None),
                payment_method: str = Form(PERSONNEL_PAYMENT_METHOD),
                file1: Optional[UploadFile] = File(None), file2: Optional[UploadFile] = File(None),
                file3: Optional[UploadFile] = File(None),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Manager / Accountant confirms payment of a completed request: Cash Out from the brand's Personnel
    Office petty cash, one Expense per line on the employee's / license's branch (or on the Personnel Office
    when marked as a common expense), payment method personnel_petty_cash, registers updated."""
    _require(user, PAYER_ROLES)
    r = _get_req(db, user, req_id)
    if r.status != "completed":
        raise HTTPException(400, "Only completed requests can be confirmed as paid")
    pd = _d(paid_date) or r.completed_date or date.today()
    actual_map = _parse_actuals(actuals)
    if common_expense is not None:
        r.common_expense = bool(common_expense)
    receipt_no = receipt_no or r.receipt_no or ""
    if payment_method not in PERSONNEL_PAYMENT_METHODS:
        raise HTTPException(400, "Invalid payment method")
    r.payment_method = payment_method

    pb = personnel_branch(db, r.brand_id)
    emp = db.query(Employee).filter(Employee.id == r.employee_id).first() if r.employee_id else None
    lic = db.query(CompanyLicense).filter(CompanyLicense.id == r.license_id).first() if r.license_id else None
    exp_branch_id = emp.branch_id if emp else (lic.branch_id if lic else None)
    if r.common_expense or not exp_branch_id:
        exp_branch_id = pb.id
    subject = emp.name if emp else (lic.name if lic else (r.new_emp_name or ""))
    types = _type_map(db)

    total = 0.0
    lines = db.query(RenewalRequestLine).filter(RenewalRequestLine.request_id == r.id).order_by(RenewalRequestLine.id).all()
    for ln in lines:
        amt = actual_map.get(ln.id, ln.actual_amount if ln.actual_amount is not None else _line_total(ln))
        ln.actual_amount = round(amt, 3)
        total += amt
        t = types.get(ln.type_id)
        if amt > 0:
            cat = _renewal_category(db, t)
            exp = Expense(branch_id=exp_branch_id, category_id=cat.id, date=pd,
                          description=f"{r.request_no} · {t.name if t else 'Renewal'} · {subject}",
                          amount=round(amt, 3), payment_method=payment_method,
                          notes=(ln.description or None), created_by=user.id, renewal_request_id=r.id)
            db.add(exp)
            db.flush()
            ln.expense_id = exp.id

    total = round(total, 3)
    if payment_method == PERSONNEL_PAYMENT_METHOD:
        txn = CashTransaction(branch_id=pb.id, date=pd, txn_type="cash_out", category="expense", amount=total,
                              reference=r.request_no, notes=f"{subject}{' · ' + receipt_no if receipt_no else ''}",
                              created_by=user.id)
        db.add(txn)
        db.flush()
        r.cash_txn_id = txn.id
    r.status, r.paid_date, r.paid_amount, r.receipt_no, r.paid_by = "paid", pd, total, receipt_no or None, user.id
    if notes:
        r.notes = f"{r.notes}\n{notes}" if r.notes else notes
    for attr, f in (("file1", file1), ("file2", file2), ("file3", file3)):
        saved = _save_upload(f)
        if saved:
            setattr_file(r, attr, saved)
    _log(db, r, "paid", user, f"KD {total:.3f} · {payment_method}" + (f" · receipt {receipt_no}" if receipt_no else ""))
    db.commit()
    return request_out(db, r, detail=True)


@router.post("/requests/{req_id}/files")
def upload_request_files(req_id: int, file1: Optional[UploadFile] = File(None), file2: Optional[UploadFile] = File(None),
                         file3: Optional[UploadFile] = File(None),
                         db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    r = _get_req(db, user, req_id)
    for attr, f in (("file1", file1), ("file2", file2), ("file3", file3)):
        saved = _save_upload(f)
        if saved:
            setattr_file(r, attr, saved)
    db.commit()
    return request_out(db, r, detail=True)


@router.post("/requests/{req_id}/close")
def close_request(req_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    r = _get_req(db, user, req_id)
    if r.status != "paid":
        raise HTTPException(400, "Only paid requests can be closed")
    r.status, r.closed_at = "closed", _now()
    _log(db, r, "closed", user)
    db.commit()
    return request_out(db, r, detail=True)


@router.get("/petty-cash")
def petty_cash(brand_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require(user)
    _check_brand(user, brand_id)
    pb = personnel_branch(db, brand_id)
    return {"branch_id": pb.id, "branch_name": pb.name, "balance": personnel_cash_balance(db, pb.id)}


# ---------------------------------------------------------------- exports / print

def _fmt_amt(v) -> str:
    return f"{(v or 0):,.3f}"


@router.get("/export/requests/{fmt}")
def export_requests(fmt: str, brand_id: Optional[int] = None, status: Optional[str] = None,
                    group: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.routes.export import _respond
    rows = list_requests(brand_id=brand_id, status=status, group=group, date_from=date_from, date_to=date_to,
                         db=db, user=user)
    header = ["Request No", "Date", "Type", "Name", "Company / Employer", "Civil ID / License No", "Branch", "Lines", "Total (KD)",
              "Status", "Requested By", "Approved By", "Approved On", "Paid Date", "Paid (KD)", "Receipt"]
    data = [[r["request_no"], r["requested_at"][:10], r["group"].title(), r["subject_name"], r["subject_employer"], r["subject_id_no"],
             r["branch_name"], r["line_count"], r["total"], r["status_label"], r["requested_by_name"],
             r["approved_by_name"], r["approved_at"][:10], r["paid_date"], r["paid_amount"] or "", r["receipt_no"]]
            for r in rows]
    return _respond(fmt, header, data, "renewal_requests", title="HR Documents & Renewals - Requests")


@router.get("/export/documents/{fmt}")
def export_documents(fmt: str, brand_id: Optional[int] = None, kind: Optional[str] = None,
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.routes.export import _respond
    board = expiry_board(brand_id=brand_id, db=db, user=user)
    if kind in ("staff", "company"):
        board = [x for x in board if x["kind"] == kind]
    header = ["Kind", "Name", "Civil ID / License No", "Branch", "Document Type", "Document No",
              "Expiry Date", "Days Remaining", "Status"]
    data = [[x["kind"].title(), x["name"], x["id_no"], x["branch_name"], x["type_name"], x["doc_no"],
             x["expiry_date"], x["days_remaining"] if x["days_remaining"] is not None else "", x["status"]]
            for x in board]
    return _respond(fmt, header, data, "documents_register", title="HR Documents & Renewals - Register")


@router.get("/export/types/{fmt}")
def export_types(fmt: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.routes.export import _respond
    rows = list_types(include_inactive=True, db=db, user=user)
    header = ["Group", "Type", "Type (Arabic)", "Standard Fee (KD)", "Validity (months)", "Reminder (days)", "Active"]
    data = [[t["group"].title(), t["name"], t["name_ar"], t["default_fee"], t["validity_months"],
             t["reminder_days"], "Yes" if t["is_active"] else "No"] for t in rows]
    return _respond(fmt, header, data, "renewal_price_list", title="Renewal Price List")


@router.get("/requests/{req_id}/form.pdf")
def request_form_pdf(req_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Printable request form (A4)."""
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import io
    import arabic_reshaper
    from bidi.algorithm import get_display

    _require(user)
    r = _get_req(db, user, req_id)
    d = request_out(db, r, detail=True)
    brand = db.query(Brand).filter(Brand.id == r.brand_id).first()

    dvs = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    dvsb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if "DejaVuSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans", dvs))
    if "DejaVuSans-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", dvsb))

    def ar(text: str) -> str:
        return get_display(arabic_reshaper.reshape(text)) if text else ""

    normal = ParagraphStyle("n", fontName="DejaVuSans", fontSize=9, leading=12)
    bold = ParagraphStyle("b", fontName="DejaVuSans-Bold", fontSize=9, leading=12)
    title = ParagraphStyle("t", fontName="DejaVuSans-Bold", fontSize=14, leading=18, alignment=1)
    sub = ParagraphStyle("s", fontName="DejaVuSans", fontSize=10, leading=13, alignment=1, textColor=colors.grey)
    small = ParagraphStyle("sm", fontName="DejaVuSans", fontSize=8, leading=10, textColor=colors.grey)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)
    el = []
    brand_name = f"{brand.name_en}  {ar(brand.name_ar or '')}" if brand else ""
    el.append(Paragraph(brand_name, title))
    el.append(Paragraph(f"Renewal / Expense Request Form  ·  {ar('طلب تجديد / مصروف')}", sub))
    el.append(Spacer(1, 4 * mm))

    kind = "Staff / Employee" if r.group == "staff" else "Company License"
    id_label = "Civil ID" if r.group == "staff" else "License No"
    info = [
        [Paragraph("Request No", bold), Paragraph(d["request_no"], normal),
         Paragraph("Status", bold), Paragraph(d["status_label"], normal)],
        [Paragraph("Request Date", bold), Paragraph(d["requested_at"], normal),
         Paragraph("Urgency", bold), Paragraph(d["urgency"].title(), normal)],
        [Paragraph("Prepared By", bold), Paragraph(d["requested_by_name"], normal),
         Paragraph("Request Type", bold), Paragraph(kind, normal)],
        [Paragraph("Name", bold), Paragraph(f"{d['subject_name']} {ar(d['subject_name_ar'])}".strip(), normal),
         Paragraph(id_label, bold), Paragraph(d["subject_id_no"], normal)],
        [Paragraph("Branch", bold), Paragraph(d["branch_name"], normal),
         Paragraph("Position / Authority", bold), Paragraph(d["subject_position"], normal)],
        [Paragraph("Company / Employer", bold), Paragraph(d["subject_employer"], normal),
         Paragraph("", bold), Paragraph("", normal)],
    ]
    it = Table(info, colWidths=[30 * mm, 60 * mm, 35 * mm, 55 * mm])
    it.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F8E9")),
                            ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F1F8E9")),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    el.append(it)
    el.append(Spacer(1, 5 * mm))

    el.append(Paragraph("Request Lines", bold))
    lines = [["#", "Type", "Description", "Old Expiry", "New Expiry", "Qty", "Fee", "Extra", "Total", "Actual"]]
    for i, ln in enumerate(d["lines"], 1):
        qty = ln.get("qty", 1) or 1
        lines.append([str(i), f"{ln['type_name']}\n{ar(ln['type_name_ar'])}", ln["description"] or "",
                      ln["current_expiry"], ln["new_expiry"], f"{qty:g}", _fmt_amt(ln["fee"]),
                      _fmt_amt(ln["extra_charges"]) + (f"\n{ln['extra_desc']}" if ln["extra_desc"] else ""),
                      _fmt_amt(ln["line_total"]),
                      _fmt_amt(ln["actual_amount"]) if ln["actual_amount"] is not None else ""])
    lines.append(["", "", "", "", "", "", "", "Total", _fmt_amt(d["total"]),
                  _fmt_amt(d["paid_amount"]) if d["paid_amount"] is not None else ""])
    lt = Table(lines, colWidths=[7 * mm, 32 * mm, 36 * mm, 20 * mm, 20 * mm, 10 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm],
               repeatRows=1)
    lt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "DejaVuSans"), ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E7D32")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (5, 1), (-1, -1), "RIGHT"), ("FONTNAME", (0, -1), (-1, -1), "DejaVuSans-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E8F5E9")),
    ]))
    el.append(lt)
    el.append(Spacer(1, 5 * mm))

    lt_prev = d.get("last_transaction")
    el.append(Paragraph("Last Transaction (duplicate check)", bold))
    if lt_prev:
        prev_lines = ", ".join(f"{x['type_name']} → {x['new_expiry'] or '-'}" for x in lt_prev["lines"])
        el.append(Paragraph(f"{lt_prev['request_no']} · paid {lt_prev['paid_date']} · KD {_fmt_amt(lt_prev['paid_amount'])} "
                            f"by {lt_prev['paid_by_name']} · {prev_lines}", normal))
    else:
        el.append(Paragraph("No previous paid transaction for this employee / license.", normal))
    el.append(Spacer(1, 5 * mm))

    if d["notes"]:
        el.append(Paragraph("Notes", bold))
        el.append(Paragraph(d["notes"], normal))
        el.append(Spacer(1, 4 * mm))

    appr = [
        [Paragraph("Approval (Operations Manager)", bold), Paragraph("Payment (Personnel Petty Cash)", bold)],
        [Paragraph(f"By: {d['approved_by_name'] or '____________________'}<br/>Date: {d['approved_at'] or '____________'}"
                   f"<br/>Approved Amount: {_fmt_amt(d['approved_amount']) if d['approved_amount'] is not None else '__________'}"
                   f"<br/>Comment: {d['approval_comment']}", normal),
         Paragraph(f"Paid By: {d['paid_by_name'] or '____________________'}<br/>Date: {d['paid_date'] or '____________'}"
                   f"<br/>Paid Amount: {_fmt_amt(d['paid_amount']) if d['paid_amount'] is not None else '__________'}"
                   f"<br/>Receipt No: {d['receipt_no'] or '__________'}", normal)],
        [Paragraph("<br/><br/>Signature: ______________________", normal),
         Paragraph("<br/><br/>Signature: ______________________", normal)],
    ]
    at = Table(appr, colWidths=[90 * mm, 90 * mm])
    at.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F8E9")),
                            ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el.append(at)
    el.append(Spacer(1, 4 * mm))
    files = [f for f in (d["file1"], d["file2"], d["file3"]) if f]
    el.append(Paragraph(f"Attachments: {len(files)} of 3", small))
    el.append(Paragraph("Prepared by: ______________________ (Personnel Officer)      "
                        f"Printed {datetime.now().strftime('%Y-%m-%d %H:%M')}", small))
    doc.build(el)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{d["request_no"]}.pdf"'})
