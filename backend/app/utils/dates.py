from datetime import date
from typing import Optional


def apply_date_range(q, column, date_from: Optional[str], date_to: Optional[str]):
    """Filter a query on a Date column by optional ISO date bounds (inclusive)."""
    if date_from:
        q = q.filter(column >= date.fromisoformat(date_from))
    if date_to:
        q = q.filter(column <= date.fromisoformat(date_to))
    return q
