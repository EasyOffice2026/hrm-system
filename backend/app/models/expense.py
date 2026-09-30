from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Text, Boolean
from datetime import datetime, timezone
from app.database import Base


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    name_ar = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=True)
    date = Column(Date, nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    payment_method = Column(String, default="cash")
    attachment_path = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    contract_payment_id = Column(Integer, ForeignKey("contract_payments.id"), nullable=True)
    renewal_request_id = Column(Integer, ForeignKey("renewal_requests.id"), nullable=True)
    salary_payment_id = Column(Integer, ForeignKey("salary_payments.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
