from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Text, Boolean
from datetime import datetime, timezone
from app.database import Base


class RenewalType(Base):
    """Price-list entry for a renewable document / government fee."""
    __tablename__ = "renewal_types"

    id = Column(Integer, primary_key=True, index=True)
    group = Column(String, nullable=False)  # staff | company
    name = Column(String, nullable=False)
    name_ar = Column(String, nullable=True)
    default_fee = Column(Float, default=0)
    validity_months = Column(Integer, default=12)
    reminder_days = Column(Integer, default=60)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CompanyLicense(Base):
    __tablename__ = "company_licenses"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    type_id = Column(Integer, ForeignKey("renewal_types.id"), nullable=True)
    name = Column(String, nullable=False)
    employer = Column(String, nullable=True)  # company name from the HR Employer list
    license_no = Column(String, nullable=False, unique=True)
    authority = Column(String, nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(String, default="active")  # active, expired, cancelled
    notes = Column(Text, nullable=True)
    file1 = Column(String, nullable=True)
    file2 = Column(String, nullable=True)
    file3 = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    type_id = Column(Integer, ForeignKey("renewal_types.id"), nullable=False)
    doc_no = Column(String, nullable=True)
    authority = Column(String, nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(String, default="active")
    notes = Column(Text, nullable=True)
    file1 = Column(String, nullable=True)
    file2 = Column(String, nullable=True)
    file3 = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RenewalRequest(Base):
    __tablename__ = "renewal_requests"

    id = Column(Integer, primary_key=True, index=True)
    request_no = Column(String, unique=True, nullable=False)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=True)
    group = Column(String, nullable=False)  # staff | company
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    license_id = Column(Integer, ForeignKey("company_licenses.id"), nullable=True)
    urgency = Column(String, default="normal")  # normal | urgent
    notes = Column(Text, nullable=True)
    status = Column(String, default="draft")
    # draft, pending, approved, returned, rejected, paid, closed, cancelled
    total = Column(Float, default=0)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    requested_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    submitted_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_amount = Column(Float, nullable=True)
    approval_comment = Column(Text, nullable=True)
    paid_date = Column(Date, nullable=True)
    paid_amount = Column(Float, nullable=True)
    receipt_no = Column(String, nullable=True)
    paid_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    cash_txn_id = Column(Integer, ForeignKey("cash_transactions.id"), nullable=True)
    closed_at = Column(DateTime, nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    completed_date = Column(Date, nullable=True)
    common_expense = Column(Boolean, default=False)
    payment_method = Column(String, default="personnel_petty_cash")
    # Prospective employee not yet in HR (staff requests without employee_id)
    new_emp_name = Column(String, nullable=True)
    new_emp_name_ar = Column(String, nullable=True)
    new_emp_civil_id = Column(String, nullable=True)
    new_emp_phone = Column(String, nullable=True)
    new_emp_join_date = Column(Date, nullable=True)
    file1 = Column(String, nullable=True)
    file2 = Column(String, nullable=True)
    file3 = Column(String, nullable=True)


class RenewalRequestLine(Base):
    __tablename__ = "renewal_request_lines"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("renewal_requests.id"), nullable=False)
    type_id = Column(Integer, ForeignKey("renewal_types.id"), nullable=False)
    description = Column(String, nullable=True)
    current_expiry = Column(Date, nullable=True)
    new_expiry = Column(Date, nullable=True)
    new_doc_no = Column(String, nullable=True)
    qty = Column(Float, default=1)
    fee = Column(Float, default=0)
    extra_charges = Column(Float, default=0)
    extra_desc = Column(String, nullable=True)
    actual_amount = Column(Float, nullable=True)
    expense_id = Column(Integer, ForeignKey("expenses.id"), nullable=True)


class RenewalRequestLog(Base):
    __tablename__ = "renewal_request_logs"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("renewal_requests.id"), nullable=False)
    status = Column(String, nullable=False)
    comment = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
