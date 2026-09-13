from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Text, Boolean, Time, UniqueConstraint
from datetime import datetime, timezone
from app.database import Base


class Brand(Base):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    name_en = Column(String, nullable=False)
    name_ar = Column(String, nullable=True)
    status = Column(String, default="active")  # active, inactive
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    staff_no = Column(String, nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    name = Column(String, nullable=False)
    name_ar = Column(String, nullable=True)
    civil_id = Column(String, nullable=True)
    position = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    salary = Column(Float, default=0)  # legacy, kept for compat
    work_permit_salary = Column(Float, default=0)
    actual_salary = Column(Float, default=0)
    iban = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    salary_transfer_method = Column(String, default="cash")  # cash, bank
    employer = Column(String, nullable=True)  # free-text, unique list for dropdown
    join_date = Column(Date, nullable=True)
    termination_date = Column(Date, nullable=True)  # resignation/termination date
    last_working_date = Column(Date, nullable=True)  # actual last day of work
    residency_expiry = Column(Date, nullable=True)
    health_card_expiry = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False)
    check_in = Column(Time, nullable=True)
    check_out = Column(Time, nullable=True)
    status = Column(String, default="absent")  # absent, late, leave
    notes = Column(Text, nullable=True)


class SalaryPayment(Base):
    __tablename__ = "salary_payments"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    month = Column(String, nullable=False)  # YYYY-MM format
    basic_salary = Column(Float, default=0)
    # Days-based calculation
    total_days = Column(Integer, default=30)
    days_worked = Column(Integer, default=30)
    # Itemized allowances
    housing_allowance = Column(Float, default=0)
    transport_allowance = Column(Float, default=0)
    food_allowance = Column(Float, default=0)
    other_allowance = Column(Float, default=0)
    allowances = Column(Float, default=0)  # total allowances
    # Itemized deductions
    absence_deduction = Column(Float, default=0)
    late_deduction = Column(Float, default=0)
    other_deduction = Column(Float, default=0)
    deductions = Column(Float, default=0)  # total deductions
    advance = Column(Float, default=0)
    overtime = Column(Float, default=0)
    bonus = Column(Float, default=0)
    incentive = Column(Float, default=0)
    leave_salary = Column(Float, default=0)
    ticket_payment = Column(Float, default=0)
    loan_deduction = Column(Float, default=0)
    penalty = Column(Float, default=0)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    last_workplace = Column(String, nullable=True)
    net_salary = Column(Float, default=0)
    payment_method = Column(String, default="cash")  # cash, bank_transfer
    status = Column(String, default="pending")  # pending, paid
    approval_status = Column(String, default="pending_approval")  # pending_approval, approved, rejected
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approval_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    paid_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class StaffTransfer(Base):
    __tablename__ = "staff_transfers"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    from_branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    to_branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    transfer_date = Column(Date, nullable=False)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="pending")  # pending, approved, rejected
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AdvanceLoan(Base):
    __tablename__ = "advance_loans"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    loan_type = Column(String, default="advance")  # advance, loan
    amount = Column(Float, nullable=False)
    balance = Column(Float, nullable=False)
    monthly_deduction = Column(Float, default=0)
    deduction_month = Column(String, nullable=True)  # YYYY-MM; if null, no auto-deduction
    date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String, default="active")  # active, paid_off
    approval_status = Column(String, default="pending_approval")  # pending_approval, approved, rejected
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approval_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class LoanRepayment(Base):
    __tablename__ = "loan_repayments"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("advance_loans.id"), nullable=False)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    month = Column(String, nullable=True)  # YYYY-MM (optional, for reference)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class StaffBenefitDeduction(Base):
    __tablename__ = "staff_benefits_deductions"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    category = Column(String, nullable=False)  # incentive, bonus, leave_salary, ticket, fine, penalty, other_benefit, other_deduction
    amount = Column(Float, nullable=False)
    frequency = Column(String, default="one_time")  # one_time, monthly (recurring until end_month)
    date = Column(Date, nullable=False)
    month = Column(String, nullable=True)  # YYYY-MM; for monthly = start month
    end_month = Column(String, nullable=True)  # YYYY-MM; optional stop month for recurring
    notes = Column(Text, nullable=True)
    approval_status = Column(String, default="pending_approval")  # pending_approval, approved, rejected
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approval_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class LeaveRecord(Base):
    __tablename__ = "leave_records"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    leave_type = Column(String, nullable=False)  # absent, annual_leave, sick_leave
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    days = Column(Integer, nullable=False)
    is_paid = Column(Boolean, default=False)  # paid leave = no deduction
    month = Column(String, nullable=True)  # YYYY-MM to link to salary period
    notes = Column(Text, nullable=True)
    approval_status = Column(String, default="pending_approval")  # pending_approval, approved, rejected
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approval_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Resignation(Base):
    __tablename__ = "resignations"

    id = Column(Integer, primary_key=True, index=True)
    ref_no = Column(String, nullable=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    name_en = Column(String, nullable=True)
    name_ar = Column(String, nullable=True)
    civil_id = Column(String, nullable=True)
    nationality = Column(String, nullable=True)
    job_title = Column(String, nullable=True)
    department_branch = Column(String, nullable=True)
    date_of_joining = Column(Date, nullable=True)
    last_working_day = Column(Date, nullable=True)
    mobile = Column(String, nullable=True)
    email = Column(String, nullable=True)
    reason = Column(Text, nullable=True)
    resignation_date = Column(Date, nullable=True)
    # Clearance checklist
    company_id_returned = Column(Boolean, default=False)
    uniform_returned = Column(Boolean, default=False)
    locker_keys_handed = Column(Boolean, default=False)
    equipment_returned = Column(Boolean, default=False)
    loans_cleared = Column(Boolean, default=False)
    handover_completed = Column(Boolean, default=False)
    final_settlement_calculated = Column(Boolean, default=False)
    final_salary_paid = Column(Boolean, default=False)
    # Management approvals
    ops_manager_name = Column(String, nullable=True)
    ops_manager_status = Column(String, default="pending")  # pending, approved, rejected
    ops_manager_date = Column(Date, nullable=True)
    gm_name = Column(String, nullable=True)
    gm_status = Column(String, default="pending")  # pending, approved, rejected
    gm_date = Column(Date, nullable=True)
    # Finance settlement
    finance_manager_name = Column(String, nullable=True)
    last_salary_paid_amount = Column(Float, default=0)
    end_of_service = Column(Float, default=0)
    leave_encashment = Column(Float, default=0)
    other_earnings = Column(Float, default=0)
    deductions_amount = Column(Float, default=0)
    other_deductions = Column(Float, default=0)
    final_settlement_amount = Column(Float, default=0)
    finance_date = Column(Date, nullable=True)
    # Dues clearance consent
    dues_cleared_consent = Column(Boolean, default=False)
    consent_date = Column(Date, nullable=True)
    # Status
    status = Column(String, default="draft")  # draft, submitted, approved, rejected, completed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=True)
    place = Column(String, nullable=True)
    period = Column(String, nullable=True)  # weekly, monthly, quarterly, half_yearly, yearly
    value = Column(Float, default=0)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    monthly_payment = Column(Float, default=0)
    payment_day = Column(Integer, default=1)  # day of month for reminder
    notes = Column(Text, nullable=True)
    status = Column(String, default="active")  # active, expired, cancelled
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Employer(Base):
    __tablename__ = "employers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    name_ar = Column(String, nullable=True)


class ContractPayment(Base):
    __tablename__ = "contract_payments"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    due_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String, default="pending")  # pending, paid, overdue
    paid_date = Column(Date, nullable=True)
    payment_method = Column(String, nullable=True)  # cash, bank_transfer, cheque
    reference = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
