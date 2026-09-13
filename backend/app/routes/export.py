from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
import io, csv

from app.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.models.hr import Employee, SalaryPayment, Brand
from app.models.cash import CashBalance
from app.models.branch import Branch
from app.utils.auth import get_current_user
from app.models.user import User
from app.routes.hr import SALARY_VISIBLE_ROLES, _brand_branch_ids, _exclude_left_employees
from app.utils.dates import apply_date_range

router = APIRouter(prefix="/api/export", tags=["export"])

channels = ["cash", "knet", "link", "talabat", "keeta", "jahez"]


def _branch_map(db: Session):
    return {b.id: b.name for b in db.query(Branch).all()}


def _branch_map_ar(db: Session):
    return {b.id: (b.name_ar or b.name) for b in db.query(Branch).all()}


# ── helpers for CSV / Excel / PDF ────────────────────────────────────

def _csv_response(header: List[str], data: List[list], filename: str):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(header)
    for row in data:
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}.csv"},
    )


def _excel_response(header: List[str], data: List[list], filename: str, summary_rows: int = 0):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = Workbook()
    ws = wb.active
    ws.title = filename

    # Header style
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="2E7D32", end_color="2E7D32", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center")
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    # Summary row styles
    total_font = Font(bold=True, color="FFFFFF", size=11)
    total_fill = PatternFill(start_color="1B5E20", end_color="1B5E20", fill_type="solid")
    payable_font = Font(bold=True, color="2E7D32", size=11)
    payable_fill = PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid")
    hold_font = Font(bold=True, color="C62828", size=11)
    hold_fill = PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid")

    for col_idx, h in enumerate(header, 1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border

    for row_idx, row in enumerate(data, 2):
        for col_idx, val in enumerate(row, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.border = thin_border

    # Style summary rows
    if summary_rows > 0 and len(data) >= summary_rows:
        total_row_idx = len(data) - summary_rows + 2  # +2 for header row + 1-based
        for col_idx in range(1, len(header) + 1):
            cell = ws.cell(row=total_row_idx, column=col_idx)
            cell.font = total_font
            cell.fill = total_fill
        if summary_rows >= 2:
            payable_row_idx = total_row_idx + 1
            for col_idx in range(1, len(header) + 1):
                cell = ws.cell(row=payable_row_idx, column=col_idx)
                cell.font = payable_font
                cell.fill = payable_fill
        if summary_rows >= 3:
            hold_row_idx = total_row_idx + 2
            for col_idx in range(1, len(header) + 1):
                cell = ws.cell(row=hold_row_idx, column=col_idx)
                cell.font = hold_font
                cell.fill = hold_fill

    # Auto-width
    for col_idx, h in enumerate(header, 1):
        max_len = len(str(h))
        for row in data:
            if col_idx - 1 < len(row):
                max_len = max(max_len, len(str(row[col_idx - 1])))
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 3, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"},
    )


def _pdf_response(header: List[str], data: List[list], filename: str, title: str = "", summary_rows: int = 0):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    buf = io.BytesIO()
    page_size = landscape(A4) if len(header) > 8 else A4
    doc = SimpleDocTemplate(buf, pagesize=page_size,
                            leftMargin=10 * mm, rightMargin=10 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)

    styles = getSampleStyleSheet()
    elements = []

    if title:
        title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=14, spaceAfter=10)
        elements.append(Paragraph(title, title_style))
        elements.append(Spacer(1, 5 * mm))

    # Truncate long strings for PDF
    def trunc(val, max_len=25):
        s = str(val) if val is not None else ""
        return s[:max_len] + ".." if len(s) > max_len else s

    table_data = [header]
    for row in data:
        table_data.append([trunc(v) for v in row])

    if not table_data or len(table_data) < 2:
        table_data.append(["No data"] + [""] * (len(header) - 1))

    num_cols = len(header)
    avail_width = page_size[0] - 20 * mm
    col_width = avail_width / num_cols

    t = Table(table_data, colWidths=[col_width] * num_cols, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E7D32")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]

    # Highlight summary rows at the bottom
    if summary_rows > 0 and len(table_data) > summary_rows:
        total_row = len(table_data) - summary_rows  # first summary row (TOTAL)
        # TOTAL row styling
        style_cmds.append(("BACKGROUND", (0, total_row), (-1, total_row), colors.HexColor("#1B5E20")))
        style_cmds.append(("TEXTCOLOR", (0, total_row), (-1, total_row), colors.white))
        style_cmds.append(("FONTSIZE", (0, total_row), (-1, total_row), 8))
        # PAYABLE row styling
        if summary_rows >= 2:
            payable_row = total_row + 1
            style_cmds.append(("BACKGROUND", (0, payable_row), (-1, payable_row), colors.HexColor("#E8F5E9")))
            style_cmds.append(("TEXTCOLOR", (0, payable_row), (-1, payable_row), colors.HexColor("#2E7D32")))
            style_cmds.append(("FONTSIZE", (0, payable_row), (-1, payable_row), 8))
        # ON HOLD row styling
        if summary_rows >= 3:
            hold_row = total_row + 2
            style_cmds.append(("BACKGROUND", (0, hold_row), (-1, hold_row), colors.HexColor("#FFEBEE")))
            style_cmds.append(("TEXTCOLOR", (0, hold_row), (-1, hold_row), colors.HexColor("#C62828")))
            style_cmds.append(("FONTSIZE", (0, hold_row), (-1, hold_row), 8))

    t.setStyle(TableStyle(style_cmds))
    elements.append(t)

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}.pdf"},
    )


def _respond(fmt: str, header: List[str], data: List[list], filename: str, title: str = "", summary_rows: int = 0):
    if fmt == "excel":
        return _excel_response(header, data, filename, summary_rows=summary_rows)
    elif fmt == "pdf":
        return _pdf_response(header, data, filename, title, summary_rows=summary_rows)
    return _csv_response(header, data, filename)


# ── Data extraction helpers ─────────────────────────────────────────

def _expenses_data(db, user, branch_id, brand_id=None, date_from=None, date_to=None):
    bmap = _branch_map(db)
    q = db.query(Expense)
    bb_ids = _brand_branch_ids(db, brand_id)
    if branch_id:
        q = q.filter(Expense.branch_id == branch_id)
    elif bb_ids is not None:
        q = q.filter(Expense.branch_id.in_(bb_ids))
    elif user.role == "staff" and user.branch_id:
        q = q.filter(Expense.branch_id == user.branch_id)
    q = apply_date_range(q, Expense.date, date_from, date_to)
    rows = q.order_by(Expense.date.desc()).all()
    cmap = {c.id: c.name for c in db.query(ExpenseCategory).all()}
    header = ["Date", "Branch", "Category", "Description", "Amount", "Payment Method", "Notes"]
    data = [[str(r.date), bmap.get(r.branch_id, ""), cmap.get(r.category_id, ""), r.description,
             r.amount, r.payment_method, r.notes or ""] for r in rows]
    return header, data


def _hr_data(db, user, branch_id, brand_id=None):
    bmap = _branch_map(db)
    q = _exclude_left_employees(db.query(Employee))
    bb_ids = _brand_branch_ids(db, brand_id)
    if branch_id:
        q = q.filter(Employee.branch_id == branch_id)
    elif bb_ids is not None:
        q = q.filter(Employee.branch_id.in_(bb_ids))
    elif user.role == "staff" and user.branch_id:
        q = q.filter(Employee.branch_id == user.branch_id)
    rows = q.order_by(Employee.name).all()
    header = ["Staff No.", "Name", "Name (AR)", "Branch", "Civil ID", "Position", "Phone",
              "Employer", "Work Permit Salary", "Actual Salary", "Salary Transfer", "IBAN", "Bank",
              "Join Date", "Active"]
    data = [[r.staff_no or "", r.name, r.name_ar or "", bmap.get(r.branch_id, ""), r.civil_id or "",
             r.position or "", r.phone or "", r.employer or "",
             r.work_permit_salary or 0, r.actual_salary or 0,
             r.salary_transfer_method or "", r.iban or "", r.bank_name or "",
             str(r.join_date) if r.join_date else "", "Yes" if r.is_active else "No"] for r in rows]
    return header, data


def _cash_data(db, user, branch_id, brand_id=None):
    bmap = _branch_map(db)
    q = db.query(CashBalance)
    bb_ids = _brand_branch_ids(db, brand_id)
    if branch_id:
        q = q.filter(CashBalance.branch_id == branch_id)
    elif bb_ids is not None:
        q = q.filter(CashBalance.branch_id.in_(bb_ids))
    rows = q.order_by(CashBalance.date.desc()).all()
    header = ["Date", "Branch", "Opening Balance", "Petty Cash In",
              "Cash Expenses", "Cash Withdrawn", "Deposited", "Closing Balance"]
    data = [[str(r.date), bmap.get(r.branch_id, ""), r.opening_balance,
             r.petty_cash_in, r.cash_expenses, r.cash_withdrawn,
             r.deposited, r.closing_balance] for r in rows]
    return header, data


def _salary_data(db, user, month, lang: str = "en", brand_id=None):
    is_ar = lang == "ar"
    bmap = _branch_map_ar(db) if is_ar else _branch_map(db)
    emp_map = {e.id: e for e in db.query(Employee).all()}
    q = db.query(SalaryPayment)
    if month:
        q = q.filter(SalaryPayment.month == month)
    bb_ids = _brand_branch_ids(db, brand_id)
    if bb_ids is not None:
        q = q.filter(SalaryPayment.branch_id.in_(bb_ids))
    rows = q.order_by(SalaryPayment.month.desc()).all()
    if is_ar:
        header = ["الشهر", "رقم الموظف", "الاسم", "المنصب", "الفرع", "أيام العمل",
                  "الراتب الأساسي", "حافز", "مكافأة", "راتب الإجازة", "تذكرة", "عمل إضافي",
                  "إجمالي البدلات", "خصم الغياب", "خصم القرض", "الغرامة",
                  "خصم آخر", "إجمالي الخصومات", "صافي الراتب", "طريقة الدفع", "الحالة"]
    else:
        header = ["Month", "Staff No.", "Name", "Position", "Branch", "Days Worked",
                  "Basic Salary", "Incentive", "Bonus", "Leave Salary", "Ticket", "Overtime",
                  "Total Allowances", "Absence Deduction", "Loan Deduction", "Penalty",
                  "Other Deduction", "Total Deductions", "Net Salary", "Payment Method", "Status"]
    data = []
    # Accumulators for totals
    sum_basic = 0
    sum_incentive = 0
    sum_bonus = 0
    sum_leave_salary = 0
    sum_ticket = 0
    sum_overtime = 0
    sum_allowances = 0
    sum_absence_ded = 0
    sum_loan_ded = 0
    sum_penalty = 0
    sum_other_ded = 0
    sum_deductions = 0
    sum_net = 0
    sum_on_hold = 0
    sum_payable = 0
    # Filter out records for employees with 0 or null actual salary
    rows = [r for r in rows if emp_map.get(r.employee_id) and (emp_map[r.employee_id].actual_salary or 0) > 0]

    for r in rows:
        emp = emp_map.get(r.employee_id)
        incentive = r.incentive or 0
        bonus = r.bonus or 0
        leave_sal = r.leave_salary or 0
        ticket = r.ticket_payment or 0
        overtime = r.overtime or 0
        allowances = r.allowances or 0
        absence_ded = r.absence_deduction or 0
        loan_ded = r.loan_deduction or 0
        penalty = r.penalty or 0
        other_ded = r.other_deduction or 0
        deductions = r.deductions or 0
        net = r.net_salary or 0
        emp_name = ""
        if emp:
            emp_name = (emp.name_ar or emp.name) if is_ar else emp.name
        data.append([
            r.month, emp.staff_no if emp else "", emp_name,
            emp.position if emp else "", bmap.get(emp.branch_id, "") if emp else "",
            r.days_worked or 30, r.basic_salary,
            incentive, bonus, leave_sal, ticket, overtime,
            allowances, absence_ded, loan_ded, penalty,
            other_ded, deductions, net,
            r.payment_method or "", r.status,
        ])
        sum_basic += r.basic_salary or 0
        sum_incentive += incentive
        sum_bonus += bonus
        sum_leave_salary += leave_sal
        sum_ticket += ticket
        sum_overtime += overtime
        sum_allowances += allowances
        sum_absence_ded += absence_ded
        sum_loan_ded += loan_ded
        sum_penalty += penalty
        sum_other_ded += other_ded
        sum_deductions += deductions
        sum_net += net
        if r.status == "on_hold":
            sum_on_hold += net
        elif r.status == "pending":
            sum_payable += net

    # Append totals row
    total_label = "الإجمالي" if is_ar else "TOTAL / الإجمالي"
    payable_label = "المستحق الدفع" if is_ar else "PAYABLE / المستحق الدفع"
    hold_label = "معلق" if is_ar else "ON HOLD / معلق"
    if data:
        data.append([
            "", "", total_label, "", "", "",
            round(sum_basic, 3),
            round(sum_incentive, 3), round(sum_bonus, 3),
            round(sum_leave_salary, 3), round(sum_ticket, 3), round(sum_overtime, 3),
            round(sum_allowances, 3),
            round(sum_absence_ded, 3), round(sum_loan_ded, 3), round(sum_penalty, 3),
            round(sum_other_ded, 3), round(sum_deductions, 3), round(sum_net, 3),
            "", "",
        ])
        # Append on-hold and payable summary rows
        data.append([
            "", "", payable_label, "", "", "",
            "", "", "", "", "", "",
            "", "", "", "", "", "", round(sum_payable, 3),
            "", "pending",
        ])
        data.append([
            "", "", hold_label, "", "", "",
            "", "", "", "", "", "",
            "", "", "", "", "", "", round(sum_on_hold, 3),
            "", "on_hold",
        ])
    return header, data


# ── Unified endpoints: /api/export/{module}/{format} ────────────────

@router.get("/expenses/{fmt}")
def export_expenses(fmt: str, branch_id: Optional[int] = None, brand_id: Optional[int] = None,
                    date_from: Optional[str] = None, date_to: Optional[str] = None,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    header, data = _expenses_data(db, user, branch_id, brand_id=brand_id, date_from=date_from, date_to=date_to)
    return _respond(fmt, header, data, "expenses", "Expenses Report")


@router.get("/hr/{fmt}")
def export_hr(fmt: str, branch_id: Optional[int] = None, brand_id: Optional[int] = None,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    header, data = _hr_data(db, user, branch_id, brand_id=brand_id)
    return _respond(fmt, header, data, "employees", "Employees Report")


@router.get("/cash/{fmt}")
def export_cash(fmt: str, branch_id: Optional[int] = None, brand_id: Optional[int] = None,
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.routes.cash import PERSONNEL_ROLES, _guard_personnel
    if user.role in PERSONNEL_ROLES:
        if not branch_id:
            raise HTTPException(400, "branch_id required")
        _guard_personnel(db, user, branch_id)
    header, data = _cash_data(db, user, branch_id, brand_id=brand_id)
    return _respond(fmt, header, data, "cash_management", "Cash Management Report")


@router.get("/contracts/{fmt}")
def export_contracts(fmt: str, brand_id: Optional[int] = None,
                     db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models.hr import Contract
    q = db.query(Contract)
    if brand_id:
        q = q.filter(Contract.brand_id == brand_id)
    rows = q.order_by(Contract.id.desc()).all()
    header = ["Contract Name", "Type", "Period", "Value", "Start Date", "End Date",
              "Monthly Payment", "Status"]
    data = [[c.name, c.kind or "", c.period or "", f"{(c.value or 0):.3f}",
             str(c.start_date or ""), str(c.end_date or ""),
             f"{(c.monthly_payment or 0):.3f}", c.status or ""] for c in rows]
    return _respond(fmt, header, data, "contracts", "Contracts & Subscriptions")


@router.get("/contract-payments/{fmt}")
def export_contract_payments(fmt: str, contract_id: int,
                             db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models.hr import Contract, ContractPayment
    c = db.query(Contract).filter(Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "Contract not found")
    rows = db.query(ContractPayment).filter(ContractPayment.contract_id == contract_id)\
        .order_by(ContractPayment.due_date).all()
    header = ["Due Date", "Amount", "Status", "Paid Date", "Payment Method", "Reference", "Notes"]
    data = [[str(p.due_date or ""), f"{(p.amount or 0):.3f}", p.status or "",
             str(p.paid_date or ""), p.payment_method or "", p.reference or "",
             p.notes or ""] for p in rows]
    return _respond(fmt, header, data, f"contract_{contract_id}_ledger",
                    f"Payment Ledger - {c.name}")


@router.get("/salary/slips/pdf")
def export_salary_slips_pdf(
    month: Optional[str] = None,
    lang: Optional[str] = None,
    brand_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                     Paragraph, Spacer, PageBreak)
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import arabic_reshaper
    from bidi.algorithm import get_display

    # Register DejaVuSans – supports Arabic glyphs
    _dvs = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    _dvsb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if "DejaVuSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans", _dvs))
    if "DejaVuSans-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", _dvsb))

    def _ar(text: str) -> str:
        """Reshape and reorder Arabic text for PDF rendering."""
        if not text:
            return text
        reshaped = arabic_reshaper.reshape(text)
        return get_display(reshaped)

    is_ar = (lang or "en") == "ar"
    bmap = _branch_map_ar(db) if is_ar else _branch_map(db)
    emp_map = {e.id: e for e in db.query(Employee).all()}

    q = db.query(SalaryPayment)
    if month:
        q = q.filter(SalaryPayment.month == month)
    bb_ids = _brand_branch_ids(db, brand_id)
    if bb_ids is not None:
        q = q.filter(SalaryPayment.branch_id.in_(bb_ids))
    records = q.all()
    # Filter out employees with 0 actual salary
    records = [r for r in records if emp_map.get(r.employee_id) and (emp_map[r.employee_id].actual_salary or 0) > 0]
    # Sort by branch then staff_no within each branch
    records.sort(key=lambda r: (
        bmap.get(emp_map[r.employee_id].branch_id, "") or "",
        emp_map[r.employee_id].staff_no or "",
    ))

    if not records:
        raise HTTPException(404, "No salary records found")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm)

    # Styles – use DejaVuSans for Arabic glyph support
    FONT = "DejaVuSans"
    FONTB = "DejaVuSans-Bold"
    hdr_style = ParagraphStyle("hdr", fontSize=16, alignment=1, spaceAfter=2,
                                fontName=FONTB)
    hdr_ar_style = ParagraphStyle("hdr_ar", fontSize=14, alignment=1, spaceAfter=2,
                                   fontName=FONT)
    sub_style = ParagraphStyle("sub", fontSize=12, alignment=1, spaceAfter=6,
                                fontName=FONTB, textColor=colors.HexColor("#555"))
    month_style = ParagraphStyle("month", fontSize=10, alignment=1, spaceAfter=8,
                                  fontName=FONT)
    sect_style = ParagraphStyle("sect", fontSize=10, fontName=FONTB,
                                 backColor=colors.HexColor("#E8F5E9"),
                                 borderPadding=(4, 6, 4, 6), spaceAfter=4)
    lbl = ParagraphStyle("lbl", fontSize=9, fontName=FONT)
    val = ParagraphStyle("val", fontSize=9, fontName=FONTB, alignment=2)
    net_lbl = ParagraphStyle("net_lbl", fontSize=12, fontName=FONTB,
                              textColor=colors.HexColor("#1B5E20"))
    net_val = ParagraphStyle("net_val", fontSize=12, fontName=FONTB,
                              alignment=2, textColor=colors.HexColor("#1B5E20"))
    green_val = ParagraphStyle("green_val", fontSize=9, fontName=FONTB,
                                alignment=2, textColor=colors.HexColor("#2E7D32"))
    red_val = ParagraphStyle("red_val", fontSize=9, fontName=FONTB,
                              alignment=2, textColor=colors.HexColor("#C62828"))
    sig_style = ParagraphStyle("sig", fontSize=8, alignment=1, spaceBefore=4,
                                fontName=FONT)

    elements = []

    for idx, sp in enumerate(records):
        emp = emp_map.get(sp.employee_id)
        if not emp:
            continue
        branch_name = bmap.get(emp.branch_id, "")
        emp_name = (emp.name_ar or emp.name) if is_ar else emp.name

        # ── Header ──
        elements.append(Paragraph("WAHID MUDAWWARAH RESTAURANT", hdr_style))
        elements.append(Paragraph(_ar("مطعم واحد مدوّرة"), hdr_ar_style))
        elements.append(Paragraph(f"PAY SLIP / {_ar('قسيمة الراتب')}", sub_style))
        month_label = sp.month or ""
        if is_ar:
            elements.append(Paragraph(f"{_ar('الشهر')}: <b>{month_label}</b>", month_style))
        else:
            elements.append(Paragraph(f"Month: <b>{month_label}</b>", month_style))
        elements.append(Spacer(1, 4 * mm))

        # ── Employee Info ──
        elements.append(Paragraph(f"Employee Information / {_ar('معلومات الموظف')}", sect_style))
        _name_display = _ar(emp_name) if emp_name else "—"
        _pos_display = _ar(emp.position) if emp.position else "—"
        _branch_display = _ar(branch_name) if branch_name else "—"
        _bank_display = _ar(emp.bank_name) if emp.bank_name else "—"
        emp_info = [
            [Paragraph(f"Staff No. / {_ar('رقم الموظف')}", lbl), Paragraph(emp.staff_no or "—", val),
             Paragraph(f"Name / {_ar('الاسم')}", lbl), Paragraph(_name_display, val)],
            [Paragraph(f"Position / {_ar('المسمى الوظيفي')}", lbl), Paragraph(_pos_display, val),
             Paragraph(f"Branch / {_ar('الفرع')}", lbl), Paragraph(_branch_display, val)],
            [Paragraph(f"Civil ID / {_ar('الرقم المدني')}", lbl), Paragraph(emp.civil_id or "—", val),
             Paragraph("IBAN", lbl), Paragraph(emp.iban or "—", val)],
            [Paragraph(f"Bank / {_ar('البنك')}", lbl), Paragraph(_bank_display, val),
             Paragraph(f"Join Date / {_ar('تاريخ الالتحاق')}", lbl),
             Paragraph(str(emp.join_date) if emp.join_date else "—", val)],
        ]
        avail = A4[0] - 30 * mm
        emp_t = Table(emp_info, colWidths=[avail * 0.22, avail * 0.28, avail * 0.22, avail * 0.28])
        emp_t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FAFAFA")),
            ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#FAFAFA")),
        ]))
        elements.append(emp_t)
        elements.append(Spacer(1, 4 * mm))

        # ── Salary Details ──
        elements.append(Paragraph(f"Salary Details / {_ar('تفاصيل الراتب')}", sect_style))

        def _fmt(v):
            return f"{v:.3f}"

        salary_rows = [
            [Paragraph(f"Basic Salary / {_ar('الراتب الأساسي')}", lbl),
             Paragraph(f"KD {_fmt(sp.basic_salary)}", val)],
            [Paragraph(f"Days Worked / {_ar('أيام العمل')}", lbl),
             Paragraph(f"{sp.days_worked or 30} / {sp.total_days or 30}", val)],
            [Paragraph(f"Period / {_ar('الفترة')}", lbl),
             Paragraph(f"{sp.period_start or '—'}  to  {sp.period_end or '—'}", val)],
        ]
        sal_t = Table(salary_rows, colWidths=[avail * 0.6, avail * 0.4])
        sal_t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(sal_t)
        elements.append(Spacer(1, 3 * mm))

        # ── Earnings ──
        elements.append(Paragraph(f"Earnings / {_ar('المستحقات')}", sect_style))
        earn_rows = []
        earn_items = [
            (f"Overtime / {_ar('العمل الإضافي')}", sp.overtime or 0),
            (f"Bonus / {_ar('مكافأة')}", sp.bonus or 0),
            (f"Incentive / {_ar('حافز')}", sp.incentive or 0),
            (f"Leave Salary / {_ar('راتب الإجازة')}", sp.leave_salary or 0),
            (f"Ticket Payment / {_ar('تذكرة السفر')}", sp.ticket_payment or 0),
            (f"Housing Allowance / {_ar('بدل سكن')}", sp.housing_allowance or 0),
            (f"Transport Allowance / {_ar('بدل نقل')}", sp.transport_allowance or 0),
            (f"Food Allowance / {_ar('بدل طعام')}", sp.food_allowance or 0),
            (f"Other Allowance / {_ar('بدلات أخرى')}", sp.other_allowance or 0),
        ]
        for label_text, amount in earn_items:
            if amount > 0:
                earn_rows.append([
                    Paragraph(label_text, lbl),
                    Paragraph(f"+{_fmt(amount)}", green_val),
                ])
        total_earnings = sp.allowances or 0
        earn_rows.append([
            Paragraph(f"<b>Total Earnings / {_ar('إجمالي المستحقات')}</b>", lbl),
            Paragraph(f"<b>KD {_fmt(total_earnings)}</b>", green_val),
        ])
        earn_t = Table(earn_rows, colWidths=[avail * 0.6, avail * 0.4])
        earn_style = [
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E8F5E9")),
        ]
        earn_t.setStyle(TableStyle(earn_style))
        elements.append(earn_t)
        elements.append(Spacer(1, 3 * mm))

        # ── Deductions ──
        elements.append(Paragraph(f"Deductions / {_ar('الخصومات')}", sect_style))
        ded_rows = []
        ded_items = [
            (f"Absence Deduction / {_ar('خصم غياب')}", sp.absence_deduction or 0),
            (f"Loan Deduction / {_ar('خصم القرض')}", sp.loan_deduction or 0),
            (f"Penalty/Fine / {_ar('غرامة')}", sp.penalty or 0),
            (f"Late Deduction / {_ar('خصم تأخير')}", sp.late_deduction or 0),
            (f"Other Deduction / {_ar('خصومات أخرى')}", sp.other_deduction or 0),
            (f"Advance / {_ar('سلفة')}", sp.advance or 0),
        ]
        for label_text, amount in ded_items:
            if amount > 0:
                ded_rows.append([
                    Paragraph(label_text, lbl),
                    Paragraph(f"-{_fmt(amount)}", red_val),
                ])
        total_deductions = sp.deductions or 0
        ded_rows.append([
            Paragraph(f"<b>Total Deductions / {_ar('إجمالي الخصومات')}</b>", lbl),
            Paragraph(f"<b>KD {_fmt(total_deductions)}</b>", red_val),
        ])
        ded_t = Table(ded_rows, colWidths=[avail * 0.6, avail * 0.4])
        ded_style = [
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFEBEE")),
        ]
        ded_t.setStyle(TableStyle(ded_style))
        elements.append(ded_t)
        elements.append(Spacer(1, 4 * mm))

        # ── Net Salary ──
        net_rows = [
            [Paragraph(f"NET SALARY / {_ar('صافي الراتب')}", net_lbl),
             Paragraph(f"KD {_fmt(sp.net_salary or 0)}", net_val)],
            [Paragraph(f"Payment Method / {_ar('طريقة الدفع')}", lbl),
             Paragraph(f"Bank Transfer / {_ar('تحويل بنكي')}" if sp.payment_method == "bank_transfer" else f"Cash / {_ar('نقداً')}", val)],
            [Paragraph(f"Status / {_ar('الحالة')}", lbl),
             Paragraph(sp.status.upper() if sp.status else "PENDING", val)],
        ]
        if sp.status == "paid" and sp.paid_date:
            net_rows.append([
                Paragraph(f"Paid Date / {_ar('تاريخ الدفع')}", lbl),
                Paragraph(str(sp.paid_date), val),
            ])
        net_t = Table(net_rows, colWidths=[avail * 0.6, avail * 0.4])
        net_t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#1B5E20")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8F5E9")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(net_t)
        elements.append(Spacer(1, 10 * mm))

        # ── Signatures ──
        sig_rows = [[
            Paragraph(f"____________________________<br/>Employee Signature<br/>{_ar('توقيع الموظف')}", sig_style),
            Paragraph("", sig_style),
            Paragraph(f"____________________________<br/>Authorized Signature<br/>{_ar('التوقيع المعتمد')}", sig_style),
        ]]
        sig_t = Table(sig_rows, colWidths=[avail * 0.4, avail * 0.2, avail * 0.4])
        sig_t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("TOPPADDING", (0, 0), (-1, -1), 15),
        ]))
        elements.append(sig_t)

        # Page break between slips (not after the last one)
        if idx < len(records) - 1:
            elements.append(PageBreak())

    doc.build(elements)
    buf.seek(0)
    fname = f"payslips_{month or 'all'}"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fname}.pdf"},
    )


@router.get("/salary/{fmt}")
def export_salary(fmt: str, month: Optional[str] = None, lang: Optional[str] = None,
                  brand_id: Optional[int] = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in SALARY_VISIBLE_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")
    language = lang or "en"
    header, data = _salary_data(db, user, month, lang=language, brand_id=brand_id)
    title = f"كشف الرواتب - {month or 'الكل'}" if language == "ar" else f"Salary Sheet - {month or 'All'}"
    return _respond(fmt, header, data, f"salary_{month or 'all'}", title, summary_rows=3)


@router.get("/expense/{expense_id}/pdf")
def export_expense_pdf(expense_id: int, db: Session = Depends(get_db),
                       _=Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                    Paragraph, Spacer, HRFlowable)
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os
    import arabic_reshaper
    from bidi.algorithm import get_display
    from app.models.expense import ExpenseCategory

    def _ar(text: str) -> str:
        if not text:
            return ""
        return get_display(arabic_reshaper.reshape(text))

    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(404, "Expense not found")

    branch = db.query(Branch).filter(Branch.id == exp.branch_id).first()
    category = db.query(ExpenseCategory).filter(ExpenseCategory.id == exp.category_id).first() if exp.category_id else None

    brand = None
    if branch and branch.brand_id:
        brand = db.query(Brand).filter(Brand.id == branch.brand_id).first()

    # Register fonts
    _fonts_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "fonts")
    _amiri = os.path.join(_fonts_dir, "Amiri-Regular.ttf")
    _amiri_bold = os.path.join(_fonts_dir, "Amiri-Bold.ttf")
    if os.path.isfile(_amiri) and "Amiri" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri", _amiri))
    if os.path.isfile(_amiri_bold) and "Amiri-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri-Bold", _amiri_bold))
    _dvs = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    _dvsb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if os.path.isfile(_dvs) and "DejaVuSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans", _dvs))
    if os.path.isfile(_dvsb) and "DejaVuSans-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", _dvsb))

    font_en = "DejaVuSans" if "DejaVuSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    font_en_bold = "DejaVuSans-Bold" if "DejaVuSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    font_ar = "Amiri" if "Amiri" in pdfmetrics.getRegisteredFontNames() else font_en

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=20 * mm, bottomMargin=20 * mm)
    elements = []

    title_style = ParagraphStyle("ex_title", fontName=font_en_bold, fontSize=16, alignment=1, spaceAfter=2 * mm)
    title_ar_style = ParagraphStyle("ex_title_ar", fontName=font_ar, fontSize=16, alignment=1, spaceAfter=4 * mm)
    normal = ParagraphStyle("ex_normal", fontName=font_en, fontSize=10, spaceAfter=2 * mm)

    company_name = brand.name_en if brand else "HRM System"
    company_ar = _ar(brand.name_ar) if brand and brand.name_ar else _ar("مدورة")
    elements.append(Paragraph(company_name, title_style))
    elements.append(Paragraph(company_ar, title_ar_style))
    elements.append(Paragraph(f"EXPENSE RECEIPT / {_ar('إيصال مصروف')}", ParagraphStyle("sub", fontName=font_en_bold, fontSize=12, alignment=1, textColor=colors.HexColor("#2E7D32"), spaceAfter=4 * mm)))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2E7D32")))
    elements.append(Spacer(1, 5 * mm))

    info_data = [
        [f"Expense # / {_ar('رقم المصروف')}", f"EXP-{exp.id:04d}"],
        [f"Date / {_ar('التاريخ')}", str(exp.date)],
        [f"Branch / {_ar('الفرع')}", branch.name if branch else "N/A"],
        [f"Category / {_ar('الفئة')}", category.name if category else "N/A"],
        [f"Description / {_ar('الوصف')}", exp.description],
        [f"Amount / {_ar('المبلغ')}", f"KD {exp.amount:.3f}"],
        [f"Payment / {_ar('الدفع')}", exp.payment_method.title()],
    ]
    if exp.notes:
        info_data.append([f"Notes / {_ar('ملاحظات')}", exp.notes])

    info_table = Table(info_data, colWidths=[75 * mm, 95 * mm])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), font_en_bold),
        ("FONTNAME", (1, 0), (1, -1), font_en),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#E0E0E0")),
        ("LINEBELOW", (0, -1), (-1, -1), 1, colors.HexColor("#2E7D32")),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 15 * mm))

    sig_data = [[f"Prepared By / {_ar('إعداد')}", f"Approved By / {_ar('اعتماد')}"]]
    sig_table = Table(sig_data, colWidths=[85 * mm, 85 * mm])
    sig_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_en),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 30),
        ("LINEABOVE", (0, 0), (-1, -1), 0.5, colors.black),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    elements.append(sig_table)

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=EXP-{exp.id:04d}.pdf"},
    )
