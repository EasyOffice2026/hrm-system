from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date as date_cls
from app.database import get_db
from app.models.cash import CashTransaction, CashBalance
from app.models.expense import Expense
from app.utils.auth import get_current_user
from app.models.user import User
from app.routes.hr import _brand_branch_ids

PERSONNEL_ROLES = ("personnel", "personnel_manager")  # office-box-only roles
VIEW_ONLY_ROLES = ("personnel",)

router = APIRouter(prefix="/api/cash", tags=["cash"])


def _personnel_branch_ids(db: Session, user: User) -> list:
    from app.models.branch import Branch
    from app.routes.renewals import PERSONNEL_BRANCH_PREFIX
    q = db.query(Branch.id).filter(Branch.name.like(f"{PERSONNEL_BRANCH_PREFIX}%"))
    allowed = user.get_allowed_brands()
    if allowed is not None:
        q = q.filter(Branch.brand_id.in_(allowed))
    return [b.id for b in q.all()]


def _guard_personnel(db: Session, user: User, branch_id: int):
    """Personnel / Purchase Office roles can only operate their own office cash boxes."""
    if user.role in PERSONNEL_ROLES and branch_id not in _personnel_branch_ids(db, user):
        raise HTTPException(403, "This role can only access its own office petty cash")


@router.get("/transactions")
def list_transactions(
    branch_id: int = Query(None),
    brand_id: int = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(CashTransaction)
    bb_ids = _brand_branch_ids(db, brand_id)
    if user.role in PERSONNEL_ROLES:
        pids = _personnel_branch_ids(db, user)
        q = q.filter(CashTransaction.branch_id.in_([branch_id] if branch_id in pids else pids))
    elif user.role == "staff" and user.branch_id:
        q = q.filter(CashTransaction.branch_id == user.branch_id)
    elif branch_id:
        q = q.filter(CashTransaction.branch_id == branch_id)
    elif bb_ids is not None:
        q = q.filter(CashTransaction.branch_id.in_(bb_ids))
    if date_from:
        q = q.filter(CashTransaction.date >= date_from)
    if date_to:
        q = q.filter(CashTransaction.date <= date_to)
    rows = q.order_by(CashTransaction.date.asc(), CashTransaction.id.asc()).all()
    # Calculate running balance
    balance = 0.0
    result = []
    for r in rows:
        if r.txn_type == "opening_balance":
            balance = r.amount
        elif r.category == "deposit":
            balance -= r.amount  # deposit to bank reduces cash on hand
        elif r.txn_type == "cash_in":
            balance += r.amount
        else:  # cash_out
            balance -= r.amount
        result.append({
            "id": r.id, "branch_id": r.branch_id, "date": str(r.date),
            "txn_type": r.txn_type, "category": r.category,
            "amount": r.amount, "reference": r.reference, "notes": r.notes,
            "balance": round(balance, 3),
        })
    return result


@router.post("/transactions")
def create_transaction(
    branch_id: int = Query(...),
    txn_date: str = Query(...),
    txn_type: str = Query(...),
    category: str = Query(...),
    amount: float = Query(...),
    reference: str = Query(None),
    notes: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role in VIEW_ONLY_ROLES:
        raise HTTPException(403, "This role has view-only access to petty cash")
    _guard_personnel(db, user, branch_id)
    # An "opening_balance" category anchors the running balance, so store it
    # with the special opening_balance txn_type regardless of the chosen type.
    if category == "opening_balance":
        txn_type = "opening_balance"
    t = CashTransaction(
        branch_id=branch_id, date=date_cls.fromisoformat(txn_date), txn_type=txn_type,
        category=category, amount=amount, reference=reference,
        notes=notes, created_by=user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "status": "created"}


def _flow(db: Session, branch_id: int, txn_type: str, date_filter, exclude_deposit=True):
    q = db.query(func.coalesce(func.sum(CashTransaction.amount), 0)).filter(
        CashTransaction.branch_id == branch_id, date_filter, CashTransaction.txn_type == txn_type)
    if exclude_deposit:
        q = q.filter(CashTransaction.category != "deposit")
    return float(q.scalar() or 0)


def _deposits(db: Session, branch_id: int, date_filter):
    return float(db.query(func.coalesce(func.sum(CashTransaction.amount), 0)).filter(
        CashTransaction.branch_id == branch_id, date_filter, CashTransaction.category == "deposit").scalar() or 0)


@router.get("/summary")
def cash_summary(
    branch_id: int = Query(...),
    summary_date: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Petty cash box position for one branch/office on a given day.

    Cash-out expenses recorded in the Expenses module (payment_method=cash) also reduce the box.
    """
    _guard_personnel(db, user, branch_id)
    target_date = date_cls.fromisoformat(summary_date) if summary_date else date_cls.today()
    on_day = CashTransaction.date == target_date

    cash_expenses = float(db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
        Expense.branch_id == branch_id, Expense.date == target_date, Expense.payment_method == "cash").scalar() or 0)
    cash_in_manual = _flow(db, branch_id, "cash_in", on_day)
    cash_out_manual = _flow(db, branch_id, "cash_out", on_day)
    deposits = _deposits(db, branch_id, on_day)

    ob_txn = db.query(CashTransaction).filter(
        CashTransaction.branch_id == branch_id,
        CashTransaction.date < target_date,
        CashTransaction.txn_type == "opening_balance",
    ).order_by(CashTransaction.date.desc(), CashTransaction.id.desc()).first()
    ob_start = ob_txn.amount if ob_txn else 0
    ob_date = ob_txn.date if ob_txn else None

    prior_txn = CashTransaction.date < target_date
    prior_exp = Expense.date < target_date
    if ob_date:
        prior_txn = (CashTransaction.date >= ob_date) & (CashTransaction.date < target_date)
        prior_exp = (Expense.date >= ob_date) & (Expense.date < target_date)

    prior_expenses = float(db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
        Expense.branch_id == branch_id, prior_exp, Expense.payment_method == "cash").scalar() or 0)
    prior_cash_in = _flow(db, branch_id, "cash_in", prior_txn)
    prior_cash_out = _flow(db, branch_id, "cash_out", prior_txn)
    prior_deposits = _deposits(db, branch_id, prior_txn)

    opening_balance = ob_start + prior_cash_in - (prior_expenses + prior_cash_out + prior_deposits)
    total_in = float(opening_balance) + cash_in_manual
    total_out = cash_expenses + cash_out_manual + deposits

    return {
        "date": str(target_date),
        "branch_id": branch_id,
        "opening_balance": float(opening_balance),
        "petty_cash_in": cash_in_manual,
        "cash_expenses": cash_expenses,
        "cash_withdrawn": cash_out_manual,
        "deposited": deposits,
        "closing_balance": total_in - total_out,
        "total_in": total_in,
        "total_out": total_out,
    }


@router.post("/save-balance")
def save_balance(
    branch_id: int = Query(...),
    balance_date: str = Query(...),
    opening_balance: float = Query(0),
    deposited: float = Query(0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role in VIEW_ONLY_ROLES:
        raise HTTPException(403, "This role has view-only access to petty cash")
    _guard_personnel(db, user, branch_id)
    bal_date = date_cls.fromisoformat(balance_date)
    existing = db.query(CashBalance).filter(
        CashBalance.branch_id == branch_id, CashBalance.date == bal_date).first()
    summary = cash_summary(branch_id=branch_id, summary_date=balance_date, db=db, user=user)
    closing = opening_balance + summary["total_in"] - summary["total_out"]

    if existing:
        bal = existing
    else:
        bal = CashBalance(branch_id=branch_id, date=bal_date, created_by=user.id)
        db.add(bal)
    bal.opening_balance = opening_balance
    bal.petty_cash_in = summary["petty_cash_in"]
    bal.cash_expenses = summary["cash_expenses"]
    bal.cash_withdrawn = summary["cash_withdrawn"]
    bal.deposited = deposited
    bal.closing_balance = closing

    if deposited > 0:
        dep_exists = db.query(CashTransaction).filter(
            CashTransaction.branch_id == branch_id, CashTransaction.date == bal_date,
            CashTransaction.category == "deposit").first()
        if not dep_exists:
            db.add(CashTransaction(branch_id=branch_id, date=bal_date, txn_type="cash_out",
                                   category="deposit", amount=deposited, created_by=user.id))
    db.commit()
    return {"status": "saved"}
