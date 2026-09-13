from datetime import date

import pytest

from app.utils.kuwait_eos import EosInput, calculate, entitlement_fraction, accrued_leave_days


def _inp(**kw):
    base = dict(join_date=date(2018, 1, 1), last_working_date=date(2025, 12, 31), monthly_wage=520.0)
    base.update(kw)
    return EosInput(**base)


def test_resignation_under_3_years_no_gratuity():
    r = calculate(_inp(join_date=date(2024, 1, 1), last_working_date=date(2025, 12, 31)))
    assert r.entitlement_rule == "art53_under_3y"
    assert r.gratuity_amount == 0
    assert r.gratuity_gross > 0


def test_resignation_3_to_5_years_half():
    r = calculate(_inp(join_date=date(2022, 1, 1), last_working_date=date(2025, 12, 31)))
    assert r.entitlement_rule == "art53_3_to_5y"
    assert r.entitlement_fraction == 0.5
    assert r.gratuity_amount == pytest.approx(r.gratuity_gross / 2, abs=0.002)


def test_resignation_5_to_10_years_two_thirds():
    r = calculate(_inp())
    assert r.entitlement_rule == "art53_5_to_10y"
    assert r.gratuity_amount == pytest.approx(r.gratuity_gross * 2 / 3, abs=0.002)


def test_resignation_over_10_years_full():
    r = calculate(_inp(join_date=date(2010, 1, 1)))
    assert r.entitlement_rule == "art53_over_10y"
    assert r.gratuity_amount == r.gratuity_gross


def test_termination_full_entitlement_and_day_split():
    # exactly 6 years: 5*15 + 1*30 = 105 days of wage
    r = calculate(_inp(join_date=date(2019, 1, 1), last_working_date=date(2024, 12, 31),
                       termination_type="termination", monthly_wage=260.0))
    assert r.entitlement_rule == "full"
    assert r.gratuity_first5_days == pytest.approx(75, abs=0.2)
    assert r.gratuity_after5_days == pytest.approx(30, abs=0.2)
    assert r.gratuity_amount == pytest.approx(105 * 10, abs=3)


def test_eighteen_month_cap_monthly():
    r = calculate(_inp(join_date=date(1990, 1, 1), termination_type="termination", monthly_wage=1000.0))
    assert r.gratuity_capped is True
    assert r.gratuity_amount == 18_000.0


def test_daily_paid_rates_and_twelve_month_cap():
    r = calculate(_inp(join_date=date(2019, 1, 1), last_working_date=date(2024, 12, 31),
                       termination_type="termination", pay_basis="daily", monthly_wage=260.0))
    # 5*10 + 1*15 = 65 days
    assert r.gratuity_first5_days == pytest.approx(50, abs=0.2)
    assert r.gratuity_after5_days == pytest.approx(15, abs=0.2)
    capped = calculate(_inp(join_date=date(1990, 1, 1), termination_type="termination",
                            pay_basis="daily", monthly_wage=1000.0))
    assert capped.gratuity_amount == 12_000.0


def test_art41_dismissal_forfeits_gratuity():
    r = calculate(_inp(termination_type="art41_dismissal"))
    assert r.gratuity_amount == 0
    assert r.entitlement_rule == "art41_dismissal"


def test_leave_encashment_notice_and_deductions():
    r = calculate(_inp(termination_type="termination", monthly_wage=260.0, leave_balance_days=13,
                       notice_days_due=26, notice_days_short=0, pending_salary=100, ticket_amount=50,
                       loan_balance=75, other_deductions=25))
    assert r.daily_rate == 10.0
    assert r.leave_encashment == 130.0
    assert r.notice_pay == 260.0
    assert r.total_deductions == 100.0
    assert r.net_settlement == pytest.approx(r.gratuity_amount + 130 + 260 + 100 + 50 - 100, abs=0.002)


def test_pifss_adjustment_only_for_kuwaitis():
    non_kw = calculate(_inp(termination_type="termination", pifss_adjustment=500))
    kw = calculate(_inp(termination_type="termination", pifss_adjustment=500, is_kuwaiti=True))
    assert non_kw.total_deductions == 0
    assert kw.total_deductions == 500


def test_unpaid_leave_reduces_service():
    full = calculate(_inp(termination_type="termination"))
    less = calculate(_inp(termination_type="termination", unpaid_leave_days=60))
    assert less.service_days == full.service_days - 60
    assert less.gratuity_amount < full.gratuity_amount


def test_invalid_dates():
    with pytest.raises(ValueError):
        calculate(_inp(join_date=date(2026, 1, 1), last_working_date=date(2025, 1, 1)))


def test_entitlement_fraction_boundaries():
    assert entitlement_fraction("resignation", "indefinite", 2.99)[0] == 0
    assert entitlement_fraction("resignation", "indefinite", 3)[0] == 0.5
    assert entitlement_fraction("resignation", "indefinite", 5)[0] == pytest.approx(2 / 3)
    assert entitlement_fraction("resignation", "indefinite", 10)[0] == 1


def test_accrued_leave():
    assert accrued_leave_days(date(2024, 1, 1), date(2024, 12, 31), taken_days=10) == pytest.approx(20.08, abs=0.01)
