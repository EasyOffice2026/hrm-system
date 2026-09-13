"""Demo dataset for client walkthroughs.

    python -m scripts.demo_data seed    # 8 employees with attendance, OT, leave, loans,
                                        # benefits/deductions, payroll, documents,
                                        # renewal requests, petty cash and one EOS settlement
    python -m scripts.demo_data purge   # remove everything the seed created

Every demo row is tagged (staff_no / reference / request_no / license_no prefixed
with DEMO_TAG, notes containing DEMO_TAG) so purge only touches seeded data.
Run from backend/ with DATABASE_URL pointing at the target database.
"""
import sys
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal, Base, engine
from app.models import (  # noqa: F401 - registers all tables
    Branch, Brand, User, Employee, Attendance, OvertimeRecord, SalaryPayment, StaffTransfer,
    AdvanceLoan, LoanRepayment, StaffBenefitDeduction, LeaveRecord, Resignation, EosSettlement,
    RenewalType, CompanyLicense, EmployeeDocument, RenewalRequest, RenewalRequestLine,
    RenewalRequestLog, CashTransaction, CashBalance, Expense, ExpenseCategory,
)
from app.routes.hr import (
    OVERTIME_MULTIPLIERS, OVERTIME_DAYS_DIVISOR, OVERTIME_HOURS_PER_DAY,
    generate_monthly_payroll, _sync_salary_expense,
)
from app.routes.renewals import personnel_branch
from app.routes.eos import EosIn, _build_input, _apply, _next_ref
from app.utils.kuwait_eos import calculate

DEMO_TAG = "DEMO"
DEMO_BRANCH = "Salmiya Branch (Demo)"
DEMO_BRANCH_AR = "فرع السالمية (تجريبي)"

# name, name_ar, position, salary, join_date, branch ("ho" | "demo"), bank
EMPLOYEES = [
    ("Ahmed Al-Rashid", "أحمد الراشد", "HR Manager", 1200, date(2019, 3, 1), "ho", "NBK"),
    ("Fatima Hassan", "فاطمة حسن", "Accountant", 950, date(2020, 7, 15), "ho", "KFH"),
    ("Mohammed Khan", "محمد خان", "Administration Officer", 650, date(2021, 1, 10), "ho", None),
    ("Rajesh Kumar", "راجيش كومار", "Driver / Mandoob", 400, date(2022, 5, 2), "ho", None),
    ("Sara Abdullah", "سارة عبدالله", "Branch Supervisor", 800, date(2020, 11, 20), "demo", "Gulf Bank"),
    ("John Mathew", "جون ماثيو", "Sales Executive", 550, date(2023, 2, 1), "demo", "NBK"),
    ("Aisha Youssef", "عائشة يوسف", "Receptionist", 450, date(2023, 9, 12), "demo", None),
    ("Ali Hussain", "علي حسين", "Office Boy", 300, date(2018, 6, 1), "demo", None),
]

NOW = datetime.now(timezone.utc)


def _month(d: date) -> str:
    return d.strftime("%Y-%m")


def _prev_month_start(today: date, back: int) -> date:
    y, m = today.year, today.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def _admin_user(db: Session) -> User:
    u = db.query(User).filter(User.role == "owner").order_by(User.id).first()
    if not u:
        raise SystemExit("No owner user found - start the app once to seed it")
    return u


def seed(db: Session):
    if db.query(Employee).filter(Employee.staff_no.like(f"{DEMO_TAG}-%")).count():
        print("Demo data already present - run purge first")
        return
    admin = _admin_user(db)
    brand = db.query(Brand).order_by(Brand.id).first()
    ho = db.query(Branch).filter(Branch.is_head_office == True).order_by(Branch.id).first()  # noqa: E712
    if not brand or not ho:
        raise SystemExit("Head office / company missing - start the app once to seed it")

    demo_branch = Branch(name=DEMO_BRANCH, name_ar=DEMO_BRANCH_AR, brand_id=brand.id, is_head_office=False)
    db.add(demo_branch)
    db.flush()
    branches = {"ho": ho, "demo": demo_branch}

    today = date.today()
    m_prev2 = _prev_month_start(today, 2)   # paid payroll
    m_prev1 = _prev_month_start(today, 1)   # approved / pending payroll
    m_cur = today.replace(day=1)

    # --- employees + documents ------------------------------------------------
    types = {t.name: t for t in db.query(RenewalType).filter(RenewalType.group == "staff").all()}
    emps: list[Employee] = []
    for i, (name, name_ar, pos, sal, joined, br, bank) in enumerate(EMPLOYEES, start=1):
        e = Employee(
            staff_no=f"{DEMO_TAG}-{i:03d}", branch_id=branches[br].id, name=name, name_ar=name_ar,
            civil_id=f"28{i:02d}0101{i:05d}", position=pos, phone=f"+965 9{i:03d}0 {i:04d}",
            salary=sal, work_permit_salary=round(sal * 0.75, 3), actual_salary=sal,
            bank_name=bank, iban=f"KW81{bank[:3].upper()}0000000000000{i:06d}" if bank else None,
            salary_transfer_method="bank" if bank else "cash", employer=brand.name_en,
            join_date=joined,
            residency_expiry=today + timedelta(days=20 + i * 45),
            health_card_expiry=today + timedelta(days=10 + i * 30),
        )
        db.add(e)
        db.flush()
        emps.append(e)
        for tname, expiry_off, doc_no in (
            ("Residency / Iqama", 20 + i * 45, f"RES-{i:06d}"),
            ("Civil Id", 40 + i * 60, e.civil_id),
            ("Health Card", 10 + i * 30, f"HC-{i:05d}"),
            ("Passport", 400 + i * 90, f"P{i:07d}"),
        ):
            t = types.get(tname) or types.get(tname.replace("Id", "ID"))
            if t:
                db.add(EmployeeDocument(
                    employee_id=e.id, type_id=t.id, doc_no=doc_no, authority="MOI" if "Passport" not in tname else "Embassy",
                    issue_date=today - timedelta(days=365), expiry_date=today + timedelta(days=expiry_off),
                    notes=DEMO_TAG,
                ))
    # one expired document to show alerts
    if types.get("Work Permit"):
        db.add(EmployeeDocument(employee_id=emps[3].id, type_id=types["Work Permit"].id, doc_no="WP-2201",
                                authority="PAM", issue_date=today - timedelta(days=380),
                                expiry_date=today - timedelta(days=15), notes=DEMO_TAG))

    # --- attendance (last 30 working days) ------------------------------------
    for d in (today - timedelta(days=n) for n in range(1, 31)):
        if d.weekday() == 4:  # Friday off
            continue
        for k, e in enumerate(emps):
            status, cin, cout = "present", time(8, 0), time(17, 0)
            if (d.day + k) % 9 == 0:
                status, cin = "late", time(8, 35)
            if (d.day + k) % 17 == 0:
                status, cin, cout = "absent", None, None
            db.add(Attendance(employee_id=e.id, date=d, check_in=cin, check_out=cout, status=status, notes=DEMO_TAG))

    # --- overtime -------------------------------------------------------------
    ot_plan = [  # emp idx, month start, day, hours, type, approved
        (2, m_prev2, 5, 3, "weekday", True), (3, m_prev2, 12, 4, "night", True),
        (5, m_prev2, 20, 8, "rest_day", True), (6, m_prev1, 3, 2, "weekday", True),
        (3, m_prev1, 9, 6, "holiday", True), (7, m_prev1, 15, 3, "weekday", False),
        (2, m_cur, 2, 2, "weekday", False), (4, m_cur, 4, 5, "rest_day", False),
    ]
    for idx, ms, day, hours, typ, approved in ot_plan:
        e = emps[idx]
        hr = round(e.actual_salary / OVERTIME_DAYS_DIVISOR / OVERTIME_HOURS_PER_DAY, 3)
        mult = OVERTIME_MULTIPLIERS[typ]
        db.add(OvertimeRecord(
            employee_id=e.id, date=ms.replace(day=day), month=_month(ms), hours=hours, ot_type=typ,
            rate_multiplier=mult, hourly_rate=hr, amount=round(hours * hr * mult, 3), notes=DEMO_TAG,
            approval_status="approved" if approved else "pending_approval",
            approved_by=admin.id if approved else None, approval_date=NOW if approved else None,
        ))

    # --- leave ----------------------------------------------------------------
    leaves = [
        (1, "annual_leave", m_prev2.replace(day=10), 5, True, "approved"),
        (4, "sick_leave", m_prev1.replace(day=6), 2, True, "approved"),
        (6, "absent", m_prev1.replace(day=18), 2, False, "approved"),
        (0, "annual_leave", m_cur.replace(day=20), 10, True, "pending_approval"),
        (5, "annual_leave", today + timedelta(days=45), 14, True, "pending_approval"),
    ]
    for idx, lt, start, days, paid, st in leaves:
        db.add(LeaveRecord(
            employee_id=emps[idx].id, leave_type=lt, start_date=start, end_date=start + timedelta(days=days - 1),
            days=days, is_paid=paid, month=_month(start), notes=DEMO_TAG, approval_status=st,
            approved_by=admin.id if st == "approved" else None, approval_date=NOW if st == "approved" else None,
        ))

    # --- loans & repayments ---------------------------------------------------
    loan_a = AdvanceLoan(employee_id=emps[2].id, loan_type="loan", amount=600, balance=400, monthly_deduction=100,
                         deduction_month=_month(m_prev2), date=m_prev2 - timedelta(days=20), notes=DEMO_TAG,
                         approval_status="approved", approved_by=admin.id, approval_date=NOW)
    loan_b = AdvanceLoan(employee_id=emps[5].id, loan_type="advance", amount=150, balance=0, monthly_deduction=150,
                         deduction_month=_month(m_prev2), date=m_prev2 + timedelta(days=3), notes=DEMO_TAG,
                         status="paid_off", approval_status="approved", approved_by=admin.id, approval_date=NOW)
    loan_c = AdvanceLoan(employee_id=emps[7].id, loan_type="advance", amount=100, balance=100, monthly_deduction=50,
                         deduction_month=_month(m_cur), date=today - timedelta(days=2), notes=DEMO_TAG)
    db.add_all([loan_a, loan_b, loan_c])
    db.flush()
    db.add_all([
        LoanRepayment(loan_id=loan_a.id, amount=100, date=m_prev2.replace(day=28), month=_month(m_prev2), notes=DEMO_TAG),
        LoanRepayment(loan_id=loan_a.id, amount=100, date=m_prev1.replace(day=28), month=_month(m_prev1), notes=DEMO_TAG),
        LoanRepayment(loan_id=loan_b.id, amount=150, date=m_prev2.replace(day=28), month=_month(m_prev2), notes=DEMO_TAG),
    ])

    # --- benefits & deductions ------------------------------------------------
    bd = [
        (0, "bonus", 150, "one_time", m_prev2, None, "approved"),
        (1, "incentive", 50, "monthly", m_prev2, None, "approved"),
        (4, "other_benefit", 60, "monthly", m_prev2, None, "approved"),   # transport allowance
        (3, "fine", 25, "one_time", m_prev1, None, "approved"),
        (6, "leave_salary", 450, "one_time", m_prev1, None, "approved"),
        (5, "ticket", 180, "one_time", m_cur, None, "pending_approval"),
        (7, "penalty", 15, "one_time", m_cur, None, "pending_approval"),
    ]
    for idx, cat, amt, freq, ms, end, st in bd:
        db.add(StaffBenefitDeduction(
            employee_id=emps[idx].id, category=cat, amount=amt, frequency=freq, date=ms.replace(day=1),
            month=_month(ms), end_month=end, notes=DEMO_TAG, approval_status=st,
            approved_by=admin.id if st == "approved" else None, approval_date=NOW if st == "approved" else None,
        ))

    # --- transfer -------------------------------------------------------------
    db.add(StaffTransfer(employee_id=emps[6].id, from_branch_id=ho.id, to_branch_id=demo_branch.id,
                         transfer_date=m_prev1.replace(day=15), requested_by=admin.id, approved_by=admin.id,
                         status="approved", notes=DEMO_TAG))
    db.add(StaffTransfer(employee_id=emps[3].id, from_branch_id=ho.id, to_branch_id=demo_branch.id,
                         transfer_date=today + timedelta(days=7), requested_by=admin.id, status="pending", notes=DEMO_TAG))
    db.commit()

    # --- payroll: two months generated by the real engine ---------------------
    generate_monthly_payroll(month=_month(m_prev2), brand_id=None, db=db, user=admin)
    generate_monthly_payroll(month=_month(m_prev1), brand_id=None, db=db, user=admin)
    emp_ids = [e.id for e in emps]
    for sp in db.query(SalaryPayment).filter(SalaryPayment.employee_id.in_(emp_ids)).all():
        sp.notes = DEMO_TAG
        sp.approval_status = "approved"
        sp.approved_by = admin.id
        sp.approval_date = NOW
        if sp.month == _month(m_prev2):
            sp.status = "paid"
            sp.paid_date = m_prev1.replace(day=1)
            _sync_salary_expense(db, sp)
    db.commit()

    # --- company licenses + renewal requests + petty cash ---------------------
    ctypes = {t.name: t for t in db.query(RenewalType).filter(RenewalType.group == "company").all()}
    lic = CompanyLicense(brand_id=brand.id, branch_id=demo_branch.id, type_id=(ctypes.get("Company / Commercial License") or ctypes.get("Other")).id,
                         name="Commercial License - Salmiya", employer=brand.name_en, license_no=f"{DEMO_TAG}-CL-1001",
                         authority="Ministry of Commerce", issue_date=today - timedelta(days=340),
                         expiry_date=today + timedelta(days=25), notes=DEMO_TAG)
    lic2 = CompanyLicense(brand_id=brand.id, branch_id=ho.id, type_id=(ctypes.get("Fire Department Certificate") or ctypes.get("Other")).id,
                          name="Fire Safety Certificate - HO", employer=brand.name_en, license_no=f"{DEMO_TAG}-FD-2002",
                          authority="Kuwait Fire Force", issue_date=today - timedelta(days=200),
                          expiry_date=today + timedelta(days=165), notes=DEMO_TAG)
    db.add_all([lic, lic2])
    db.flush()

    personnel = personnel_branch(db, brand.id)
    admin_branch = db.query(Branch).filter(Branch.name.like("Administration%")).order_by(Branch.id).first() or ho
    cash_boxes = [personnel, admin_branch]
    for box, opening in zip(cash_boxes, (500, 1500)):
        db.add(CashTransaction(branch_id=box.id, date=m_prev2, txn_type="opening_balance", category="opening_balance",
                               amount=opening, reference=DEMO_TAG, notes=f"{DEMO_TAG} opening float", created_by=admin.id))
        db.add(CashTransaction(branch_id=box.id, date=m_prev1.replace(day=2), txn_type="cash_in", category="replenishment",
                               amount=opening, reference=DEMO_TAG, notes=f"{DEMO_TAG} monthly replenishment", created_by=admin.id))
    db.flush()

    res_t = types.get("Residency / Iqama") or next(iter(types.values()))
    hc_t = types.get("Health Card") or res_t
    req_specs = [  # no, group, emp idx / license, urgency, status, lines[(type, fee)]
        ("0001", "staff", emps[3], None, "urgent", "paid", [(res_t, 60), (hc_t, 50)]),
        ("0002", "staff", emps[6], None, "normal", "approved", [(res_t, 60)]),
        ("0003", "staff", emps[1], None, "normal", "pending", [(hc_t, 50)]),
        ("0004", "company", None, lic, "urgent", "pending", [(ctypes.get("Company / Commercial License") or ctypes.get("Other"), 120)]),
    ]
    for no, group, emp, license_, urg, status, lines in req_specs:
        total = sum(f for _, f in lines)
        rq = RenewalRequest(
            request_no=f"{DEMO_TAG}-RR-{no}", brand_id=brand.id, group=group,
            employee_id=emp.id if emp else None, license_id=license_.id if license_ else None,
            urgency=urg, notes=DEMO_TAG, status=status, total=total, requested_by=admin.id,
            requested_at=NOW - timedelta(days=int(no) * 3), submitted_at=NOW - timedelta(days=int(no) * 3),
        )
        if status in ("approved", "paid"):
            rq.approved_by = admin.id
            rq.approved_at = NOW - timedelta(days=int(no) * 2)
            rq.approved_amount = total
        if status == "paid":
            rq.paid_date = m_prev1.replace(day=10)
            rq.paid_amount = total
            rq.receipt_no = f"{DEMO_TAG}-RCPT-{no}"
            rq.paid_by = admin.id
        db.add(rq)
        db.flush()
        for t, fee in lines:
            db.add(RenewalRequestLine(request_id=rq.id, type_id=t.id, description=t.name, fee=fee, qty=1,
                                      current_expiry=today + timedelta(days=30), new_expiry=today + timedelta(days=395)))
        db.add(RenewalRequestLog(request_id=rq.id, status=status, comment=DEMO_TAG, user_id=admin.id))
        if status == "paid":
            txn = CashTransaction(branch_id=personnel.id, date=rq.paid_date, txn_type="cash_out", category="expense",
                                  amount=total, reference=DEMO_TAG, notes=f"{DEMO_TAG} {rq.request_no}", created_by=admin.id)
            db.add(txn)
            db.flush()
            rq.cash_txn_id = txn.id

    gov = db.query(ExpenseCategory).filter(ExpenseCategory.name == "Government Fees").first()
    office = db.query(ExpenseCategory).filter(ExpenseCategory.name == "Office Supplies").first()
    db.add_all([
        Expense(branch_id=admin_branch.id, category_id=office.id if office else None, date=m_prev1.replace(day=5),
                description="Printer toner & stationery", amount=42.5, payment_method="cash", notes=DEMO_TAG, created_by=admin.id),
        Expense(branch_id=personnel.id, category_id=gov.id if gov else None, date=m_prev1.replace(day=12),
                description="Traffic fine - company vehicle", amount=30, payment_method="cash", notes=DEMO_TAG, created_by=admin.id),
    ])
    db.commit()

    # --- resignation + EOS settlement (Ali Hussain, 8+ years) ------------------
    ali = emps[7]
    last_day = today + timedelta(days=30)
    ali.termination_date = today
    ali.last_working_date = last_day
    rs = Resignation(ref_no=f"{DEMO_TAG}-RES-0001", employee_id=ali.id, name_en=ali.name, name_ar=ali.name_ar,
                     civil_id=ali.civil_id, nationality="Indian", job_title=ali.position, department_branch=demo_branch.name,
                     date_of_joining=ali.join_date, last_working_day=last_day, mobile=ali.phone, reason=f"{DEMO_TAG} - Returning home",
                     resignation_date=today, company_id_returned=True, uniform_returned=True, status="submitted")
    db.add(rs)
    db.flush()
    body = EosIn(employee_id=ali.id, last_working_date=last_day.isoformat(), termination_type="resignation",
                 notice_days_due=0, resignation_id=rs.id, notes=DEMO_TAG)
    emp, inp, _ = _build_input(db, body)
    res = calculate(inp)
    s = EosSettlement(employee_id=emp.id, branch_id=emp.branch_id, created_by=admin.id, ref_no=_next_ref(db))
    _apply(s, inp, res, body)
    s.resignation_id = rs.id
    s.notes = DEMO_TAG
    db.add(s)
    db.commit()
    print(f"Seeded {len(emps)} demo employees (staff_no {DEMO_TAG}-001..{DEMO_TAG}-{len(emps):03d}) "
          f"with payroll {_month(m_prev2)} (paid) and {_month(m_prev1)} (approved).")


def purge(db: Session):
    emp_ids = [e.id for e in db.query(Employee.id).filter(Employee.staff_no.like(f"{DEMO_TAG}-%")).all()]
    demo_branch_ids = [b.id for b in db.query(Branch.id).filter(Branch.name == DEMO_BRANCH).all()]

    sp_ids = [r.id for r in db.query(SalaryPayment.id).filter(SalaryPayment.employee_id.in_(emp_ids))] if emp_ids else []
    rq_q = db.query(RenewalRequest).filter(
        (RenewalRequest.request_no.like(f"{DEMO_TAG}-%")) | (RenewalRequest.employee_id.in_(emp_ids or [-1])))
    rq_ids = [r.id for r in rq_q.all()]

    def _del(q):
        return q.delete(synchronize_session=False)

    n = 0
    if rq_ids:
        n += _del(db.query(Expense).filter(Expense.renewal_request_id.in_(rq_ids)))
        n += _del(db.query(RenewalRequestLog).filter(RenewalRequestLog.request_id.in_(rq_ids)))
        n += _del(db.query(RenewalRequestLine).filter(RenewalRequestLine.request_id.in_(rq_ids)))
        n += _del(db.query(RenewalRequest).filter(RenewalRequest.id.in_(rq_ids)))
    if sp_ids:
        n += _del(db.query(Expense).filter(Expense.salary_payment_id.in_(sp_ids)))
    n += _del(db.query(Expense).filter(Expense.notes == DEMO_TAG))
    n += _del(db.query(CashTransaction).filter(CashTransaction.reference == DEMO_TAG))
    n += _del(db.query(CompanyLicense).filter(CompanyLicense.license_no.like(f"{DEMO_TAG}-%")))
    if emp_ids:
        n += _del(db.query(EosSettlement).filter(EosSettlement.employee_id.in_(emp_ids)))
        n += _del(db.query(Resignation).filter(Resignation.employee_id.in_(emp_ids)))
        n += _del(db.query(EmployeeDocument).filter(EmployeeDocument.employee_id.in_(emp_ids)))
        n += _del(db.query(LeaveRecord).filter(LeaveRecord.employee_id.in_(emp_ids)))
        n += _del(db.query(StaffBenefitDeduction).filter(StaffBenefitDeduction.employee_id.in_(emp_ids)))
        loan_ids = [l.id for l in db.query(AdvanceLoan.id).filter(AdvanceLoan.employee_id.in_(emp_ids))]
        if loan_ids:
            n += _del(db.query(LoanRepayment).filter(LoanRepayment.loan_id.in_(loan_ids)))
        n += _del(db.query(AdvanceLoan).filter(AdvanceLoan.employee_id.in_(emp_ids)))
        n += _del(db.query(StaffTransfer).filter(StaffTransfer.employee_id.in_(emp_ids)))
        n += _del(db.query(SalaryPayment).filter(SalaryPayment.employee_id.in_(emp_ids)))
        n += _del(db.query(OvertimeRecord).filter(OvertimeRecord.employee_id.in_(emp_ids)))
        n += _del(db.query(Attendance).filter(Attendance.employee_id.in_(emp_ids)))
        n += _del(db.query(Employee).filter(Employee.id.in_(emp_ids)))
    if demo_branch_ids:
        n += _del(db.query(CashBalance).filter(CashBalance.branch_id.in_(demo_branch_ids)))
        n += _del(db.query(Branch).filter(Branch.id.in_(demo_branch_ids)))
    db.commit()
    print(f"Purged {n} demo rows ({len(emp_ids)} employees).")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd not in ("seed", "purge"):
        print(__doc__)
        sys.exit(1)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        (seed if cmd == "seed" else purge)(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
