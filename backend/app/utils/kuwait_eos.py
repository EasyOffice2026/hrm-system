"""End of Service indemnity under Kuwait Private Sector Labour Law No. 6 of 2010.

Art. 51  - Monthly-paid: 15 days' wage per year for the first 5 years, one month per year after;
           total capped at 18 months' wage. Daily/weekly/piece-rate: 10 days per year for the first
           5 years, 15 days per year after; capped at 12 months. Fractions of a year pro-rated.
           Kuwaiti workers: employer pays the difference between its PIFSS contributions and the indemnity.
Art. 53  - Resignation from an indefinite contract: <3 yrs none, 3-5 yrs half, 5-10 yrs two-thirds,
           10+ yrs full. Termination by employer, contract expiry, death, disability, retirement or
           resignation for cause (Art. 48) = full indemnity.
Art. 41  - Summary dismissal for the listed grave offences is "without notice, indemnity or compensation":
           no gratuity.
Art. 44  - Notice: 3 months for monthly-paid workers, 1 month for others; pay in lieu when not served.
Art. 70/76 - 30 days annual leave per year; accrued balance paid in cash on termination.

The daily rate divisor (26 working days) is the prevailing Kuwaiti practice and is configurable.
"""
from dataclasses import dataclass, asdict
from datetime import date

FULL_ENTITLEMENT_TYPES = {
    "termination", "contract_expiry", "death", "disability", "retirement", "art48_resignation",
}
NO_ENTITLEMENT_TYPES = {"art41_dismissal"}


@dataclass
class EosInput:
    join_date: date
    last_working_date: date
    monthly_wage: float
    termination_type: str = "resignation"
    contract_type: str = "indefinite"
    pay_basis: str = "monthly"
    is_kuwaiti: bool = False
    days_divisor: int = 26
    unpaid_leave_days: int = 0
    leave_balance_days: float = 0
    notice_days_due: int = 0
    notice_days_short: int = 0
    pending_salary: float = 0
    other_earnings: float = 0
    ticket_amount: float = 0
    loan_balance: float = 0
    pifss_adjustment: float = 0
    other_deductions: float = 0


@dataclass
class EosResult:
    service_days: int
    service_years: float
    daily_rate: float
    gratuity_first5_days: float
    gratuity_after5_days: float
    gratuity_gross: float
    entitlement_fraction: float
    entitlement_rule: str
    gratuity_capped: bool
    cap_amount: float
    gratuity_amount: float
    leave_encashment: float
    notice_pay: float
    notice_deduction: float
    total_earnings: float
    total_deductions: float
    net_settlement: float

    def dict(self):
        return asdict(self)


def _r(v: float) -> float:
    return round(v + 1e-9, 3)


def entitlement_fraction(termination_type: str, contract_type: str, service_years: float) -> tuple[float, str]:
    if termination_type in FULL_ENTITLEMENT_TYPES:
        return 1.0, "full"
    if termination_type in NO_ENTITLEMENT_TYPES:
        return 0.0, "art41_dismissal"
    if service_years < 3:
        return 0.0, "art53_under_3y"
    if service_years < 5:
        return 0.5, "art53_3_to_5y"
    if service_years < 10:
        return 2 / 3, "art53_5_to_10y"
    return 1.0, "art53_over_10y"


def calculate(inp: EosInput) -> EosResult:
    if inp.last_working_date < inp.join_date:
        raise ValueError("last_working_date must be on/after join_date")
    divisor = inp.days_divisor or 26
    service_days = (inp.last_working_date - inp.join_date).days + 1 - max(0, inp.unpaid_leave_days)
    service_days = max(0, service_days)
    service_years = service_days / 365.0
    daily_rate = inp.monthly_wage / divisor if divisor else 0

    first5 = min(service_years, 5.0)
    after5 = max(0.0, service_years - 5.0)
    if inp.pay_basis == "daily":
        d1, d2, cap_months = 10, 15, 12
    else:
        d1, d2, cap_months = 15, 30, 18
    days_first5 = first5 * d1
    days_after5 = after5 * d2
    gross = (days_first5 + days_after5) * daily_rate
    cap_amount = cap_months * inp.monthly_wage
    capped = gross > cap_amount
    if capped:
        gross = cap_amount

    frac, rule = entitlement_fraction(inp.termination_type, inp.contract_type, service_years)
    gratuity = gross * frac

    leave_encashment = max(0.0, inp.leave_balance_days) * daily_rate
    notice_pay = max(0, inp.notice_days_due) * daily_rate
    notice_deduction = max(0, inp.notice_days_short) * daily_rate

    total_earnings = gratuity + leave_encashment + notice_pay + inp.pending_salary + inp.other_earnings + inp.ticket_amount
    pifss = inp.pifss_adjustment if inp.is_kuwaiti else 0.0
    total_deductions = inp.loan_balance + pifss + notice_deduction + inp.other_deductions
    net = total_earnings - total_deductions

    return EosResult(
        service_days=service_days,
        service_years=round(service_years, 4),
        daily_rate=_r(daily_rate),
        gratuity_first5_days=round(days_first5, 3),
        gratuity_after5_days=round(days_after5, 3),
        gratuity_gross=_r(gross),
        entitlement_fraction=round(frac, 4),
        entitlement_rule=rule,
        gratuity_capped=capped,
        cap_amount=_r(cap_amount),
        gratuity_amount=_r(gratuity),
        leave_encashment=_r(leave_encashment),
        notice_pay=_r(notice_pay),
        notice_deduction=_r(notice_deduction),
        total_earnings=_r(total_earnings),
        total_deductions=_r(total_deductions),
        net_settlement=_r(net),
    )


def accrued_leave_days(join_date: date, last_working_date: date, taken_days: float = 0,
                       annual_days: int = 30) -> float:
    """Leave accrues at 30 days per completed year (pro-rated) minus leave already taken."""
    days = max(0, (last_working_date - join_date).days + 1)
    return round(max(0.0, days / 365.0 * annual_days - taken_days), 2)
