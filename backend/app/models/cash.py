from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Text
from datetime import datetime, timezone
from app.database import Base


class CashTransaction(Base):
    __tablename__ = "cash_transactions"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    date = Column(Date, nullable=False)
    txn_type = Column(String, nullable=False)  # cash_in, cash_out, opening_balance
    category = Column(String, nullable=False)   # replenishment, expense, deposit, withdrawal, opening_balance
    amount = Column(Float, nullable=False)
    reference = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CashBalance(Base):
    __tablename__ = "cash_balances"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    date = Column(Date, nullable=False)
    opening_balance = Column(Float, default=0)
    petty_cash_in = Column(Float, default=0)
    cash_expenses = Column(Float, default=0)
    cash_withdrawn = Column(Float, default=0)
    deposited = Column(Float, default=0)
    closing_balance = Column(Float, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
