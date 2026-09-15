from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Text, Boolean
from datetime import datetime, timezone
from app.database import Base


class EosSettlement(Base):
    """End of Service settlement computed under Kuwait Labour Law No. 6 of 2010 (Arts. 51-53, 70-76)."""
    __tablename__ = "eos_settlements"

    id = Column(Integer, primary_key=True, index=True)
    ref_no = Column(String, nullable=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    resignation_id = Column(Integer, ForeignKey("resignations.id"), nullable=True)

    join_date = Column(Date, nullable=False)
    last_working_date = Column(Date, nullable=False)
    # resignation | termination | contract_expiry | death | disability | retirement | art48_resignation | art41_dismissal
    termination_type = Column(String, nullable=False, default="resignation")
    contract_type = Column(String, default="indefinite")  # indefinite | fixed
    pay_basis = Column(String, default="monthly")  # monthly | daily
    is_kuwaiti = Column(Boolean, default=False)

    monthly_wage = Column(Float, default=0)  # last full remuneration incl. regular allowances
    days_divisor = Column(Integer, default=26)  # working days per month used for daily rate
    daily_rate = Column(Float, default=0)

    service_years = Column(Float, default=0)
    service_days = Column(Integer, default=0)
    unpaid_leave_days = Column(Integer, default=0)  # excluded from service

    gratuity_first5_days = Column(Float, default=0)
    gratuity_after5_days = Column(Float, default=0)
    gratuity_gross = Column(Float, default=0)
    entitlement_fraction = Column(Float, default=1)  # 0, 0.5, 2/3, 1 per Art. 53
    gratuity_capped = Column(Boolean, default=False)
    gratuity_amount = Column(Float, default=0)

    leave_balance_days = Column(Float, default=0)
    leave_encashment = Column(Float, default=0)
    notice_days_due = Column(Integer, default=0)  # pay in lieu of notice owed to employee
    notice_pay = Column(Float, default=0)
    pending_salary = Column(Float, default=0)
    other_earnings = Column(Float, default=0)
    ticket_amount = Column(Float, default=0)

    loan_balance = Column(Float, default=0)
    pifss_adjustment = Column(Float, default=0)  # Kuwaiti nationals: employer social-security share offset
    notice_deduction = Column(Float, default=0)  # employee did not serve notice
    other_deductions = Column(Float, default=0)

    total_earnings = Column(Float, default=0)
    total_deductions = Column(Float, default=0)
    net_settlement = Column(Float, default=0)

    status = Column(String, default="draft")  # draft, approved, paid, cancelled
    payment_method = Column(String, nullable=True)
    paid_date = Column(Date, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
