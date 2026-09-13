import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost, apiFetch, apiDownload } from "../contexts/api";
import { useBrand } from "../contexts/BrandContext";

interface Branch { id: number; name: string; name_ar?: string; }
interface Employee {
  id: number; staff_no: string; branch_id: number; name: string; name_ar: string;
  civil_id: string; position: string; phone: string; salary: number;
  work_permit_salary: number; actual_salary: number;
  iban: string; bank_name: string; salary_transfer_method: string; employer: string;
  join_date: string; termination_date: string | null; last_working_date: string | null;
  residency_expiry: string | null; health_card_expiry: string | null; is_active: boolean;
}
interface SalaryRecord {
  id: number; employee_id: number; staff_no: string; name: string; name_ar: string;
  designation: string; current_actual_salary: number;
  branch_id: number; month: string;
  basic_salary: number; total_days: number; days_worked: number;
  period_start: string; period_end: string; last_workplace: string;
  housing_allowance: number; transport_allowance: number;
  food_allowance: number; other_allowance: number; allowances: number;
  overtime: number; bonus: number; incentive: number;
  leave_salary: number; ticket_payment: number;
  absence_deduction: number; late_deduction: number;
  other_deduction: number; loan_deduction: number; penalty: number;
  deductions: number; advance: number; net_salary: number;
  payment_method: string; status: string; notes: string | null; paid_date: string | null;
  approval_status?: string;
}
interface Transfer {
  id: number; employee_id: number; from_branch_id: number; to_branch_id: number;
  transfer_date: string; requested_by: number | null; approved_by: number | null;
  status: string; notes: string | null;
}
interface Loan {
  id: number; employee_id: number; loan_type: string;
  amount: number; balance: number; monthly_deduction: number;
  deduction_month: string | null;
  date: string; notes: string | null; status: string;
  approval_status?: string;
}
interface BenefitDeduction {
  id: number; employee_id: number; category: string;
  amount: number; date: string; month: string | null; notes: string | null;
  frequency?: string; end_month?: string | null;
  approval_status?: string;
}
interface LoanTxn {
  id: number;
  kind: "disbursement" | "repayment";
  type: string; loan_id: number; date: string;
  amount: number; notes: string; status: string;
  running_balance: number;
}
interface LoanStatement {
  employee: { id: number; name: string; name_ar: string; staff_no: string };
  totals: { total_taken: number; total_repaid: number; outstanding: number; loan_count: number };
  transactions: LoanTxn[];
}

interface LeaveRec {
  id: number; employee_id: number; leave_type: string;
  start_date: string; end_date: string; days: number;
  is_paid: boolean; month: string; notes: string;
  approval_status?: string;
}
interface BrandItem { id: number; name_en: string; name_ar: string; }

type Tab = "employees" | "salary" | "transfers" | "loans" | "benefits" | "deductions" | "leaves";

const HR_TABS: Tab[] = ["employees", "transfers", "loans", "benefits", "deductions", "leaves"];
const PAYROLL_TABS: Tab[] = ["salary"];

export default function HRPage({ mode = "hr" }: { mode?: "hr" | "payroll" }) {
  const { t, i18n } = useTranslation();
  const { selectedBrand } = useBrand();
  const companyEn = selectedBrand?.name_en || "HRM System";
  const companyAr = selectedBrand?.name_ar || companyEn;
  const visibleTabs = mode === "payroll" ? PAYROLL_TABS : HR_TABS;
  const [tab, setTab] = useState<Tab>(visibleTabs[0]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);

  // Salary state
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [salaryMonth, setSalaryMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [salaryMsg, setSalaryMsg] = useState("");
  const [salaryMsgType, setSalaryMsgType] = useState<"success" | "error">("success");
  const [editingRecord, setEditingRecord] = useState<SalaryRecord | null>(null);

  // Edit salary fields
  const [editBasicSalary, setEditBasicSalary] = useState("0");
  const [editTotalDays, setEditTotalDays] = useState("30");
  const [editDaysWorked, setEditDaysWorked] = useState("30");
  const [editPeriodStart, setEditPeriodStart] = useState("");
  const [editPeriodEnd, setEditPeriodEnd] = useState("");
  const [editLastWorkplace, setEditLastWorkplace] = useState("");
  const [editHousing, setEditHousing] = useState("0");
  const [editTransport, setEditTransport] = useState("0");
  const [editFood, setEditFood] = useState("0");
  const [editOtherAllow, setEditOtherAllow] = useState("0");
  const [editAbsence, setEditAbsence] = useState("0");
  const [editLate, setEditLate] = useState("0");
  const [editOtherDed, setEditOtherDed] = useState("0");
  const [editAdvance, setEditAdvance] = useState("0");
  const [editOvertime, setEditOvertime] = useState("0");
  const [editBonus, setEditBonus] = useState("0");
  const [editIncentive, setEditIncentive] = useState("0");
  const [editLeaveSalary, setEditLeaveSalary] = useState("0");
  const [editTicket, setEditTicket] = useState("0");
  const [editLoanDed, setEditLoanDed] = useState("0");
  const [editPenalty, setEditPenalty] = useState("0");
  const [editMethod, setEditMethod] = useState("cash");
  const [editNotes, setEditNotes] = useState("");

  // Search state
  const [empSearch, setEmpSearch] = useState("");
  const [salarySearch, setSalarySearch] = useState("");

  // Pay Slip state
  const [payslipData, setPayslipData] = useState<any>(null);
  const [showPayslip, setShowPayslip] = useState(false);

  // Transfer state
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [showTransferForm, setShowTransferForm] = useState(false);

  // Loan state
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [payingLoan, setPayingLoan] = useState<Loan | null>(null);
  const [statementEmpId, setStatementEmpId] = useState<string>("");
  const [statement, setStatement] = useState<LoanStatement | null>(null);

  // Benefits state (incentive, bonus, leave_salary, ticket)
  const [benefits, setBenefits] = useState<BenefitDeduction[]>([]);
  const [showBenefitForm, setShowBenefitForm] = useState(false);
  const [editingBenefit, setEditingBenefit] = useState<BenefitDeduction | null>(null);
  const [benefitFreq, setBenefitFreq] = useState("one_time");

  // Deductions state (fine, penalty)
  const [deductionItems, setDeductionItems] = useState<BenefitDeduction[]>([]);
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [editingDeduction, setEditingDeduction] = useState<BenefitDeduction | null>(null);
  const [dedSelectedEmpId, setDedSelectedEmpId] = useState<number | null>(null);
  const [dedDays, setDedDays] = useState<number>(0);
  const [dedAmount, setDedAmount] = useState<number>(0);

  // Leave/Absence state
  const [leaveRecords, setLeaveRecords] = useState<LeaveRec[]>([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRec | null>(null);

  // Employer list (unique, no duplicates)
  const [employers, setEmployers] = useState<{ id: number; name: string; name_ar: string }[]>([]);
  const [showEmployerMgr, setShowEmployerMgr] = useState(false);
  const [newEmployerName, setNewEmployerName] = useState("");
  const [newEmployerNameAr, setNewEmployerNameAr] = useState("");

  const loadEmployers = () => apiGet("/api/hr/employers").then(setEmployers);
  const loadEmployees = () => apiGet(`/api/hr/employees${showLeft ? "?include_left=true" : ""}`).then(setEmployees);

  // Brands for cross-brand transfers
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [transferToBrandId, setTransferToBrandId] = useState<number | null>(null);
  const [allBranches, setAllBranches] = useState<(Branch & { brand_id?: number })[]>([]);

  const [branchFilter, setBranchFilter] = useState<string>("");
  const [showLeft, setShowLeft] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isManager = currentUser.role === "owner" || currentUser.role === "manager" || currentUser.role === "accountant";
  const isPersonnel = ["personnel", "personnel_manager"].includes(currentUser.role);
  const canViewSalary = ["owner", "manager", "accountant"].includes(currentUser.role);

  useEffect(() => {
    apiGet("/api/branches/").then((b: any[]) => setBranches(b));
    // Fetch ALL branches (no brand filter) for cross-brand transfers
    fetch("/api/branches/", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then(r => r.json()).then((b: any[]) => setAllBranches(b));
    loadEmployers();
    apiGet("/api/hr/brands?all=1").then(setBrands);
  }, []);

  useEffect(() => { loadEmployees(); }, [showLeft]);

  useEffect(() => {
    if (tab === "salary") loadSalary();
    if (tab === "transfers") apiGet("/api/hr/transfers").then(setTransfers);
    if (tab === "loans") apiGet("/api/hr/loans").then(setLoans);
    if (tab === "benefits") apiGet("/api/hr/benefits-deductions").then((data: BenefitDeduction[]) => {
      setBenefits(data.filter(d => ["incentive", "bonus", "leave_salary", "ticket", "other_benefit"].includes(d.category)));
    });
    if (tab === "deductions") apiGet("/api/hr/benefits-deductions").then((data: BenefitDeduction[]) => {
      setDeductionItems(data.filter(d => ["fine", "penalty", "other_deduction"].includes(d.category)));
    });
    if (tab === "leaves") apiGet("/api/hr/leaves").then(setLeaveRecords);
  }, [tab, salaryMonth]);

  const loadSalary = () => {
    apiGet(`/api/hr/salary?month=${salaryMonth}`).then((data) => {
      if (Array.isArray(data)) setSalaryRecords(data);
    });
  };

  // Approval workflow helper
  const handleApproval = async (txnType: string, txnId: number, action: "approve" | "reject") => {
    if (action === "reject" && !confirm(t("confirm_reject"))) return;
    const res = await apiFetch(`/api/hr/${action}/${txnType}/${txnId}`, { method: "POST" });
    if (res.ok) {
      // Reload the relevant tab data
      if (tab === "salary") loadSalary();
      if (tab === "loans") apiGet("/api/hr/loans").then(setLoans);
      if (tab === "benefits") apiGet("/api/hr/benefits-deductions").then((data: BenefitDeduction[]) => {
        setBenefits(data.filter(d => ["incentive", "bonus", "leave_salary", "ticket", "other_benefit"].includes(d.category)));
      });
      if (tab === "deductions") apiGet("/api/hr/benefits-deductions").then((data: BenefitDeduction[]) => {
        setDeductionItems(data.filter(d => ["fine", "penalty", "other_deduction"].includes(d.category)));
      });
      if (tab === "leaves") apiGet("/api/hr/leaves").then(setLeaveRecords);
    } else {
      const d = await res.json();
      alert(d.detail || "Error");
    }
  };

  // Approval badge component
  const ApprovalBadge = ({ status, type, id }: { status?: string; type: string; id: number }) => {
    const s = status || "approved";
    const badge = s === "approved" ? "bg-green-100 text-green-700"
      : s === "rejected" ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
    return (
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
          {s === "pending_approval" ? t("pending_approval") : t(s)}
        </span>
        {isManager && s === "pending_approval" && (
          <div className="flex gap-1">
            <button onClick={() => handleApproval(type, id, "approve")}
              className="px-2 py-0.5 bg-green-500 text-white rounded text-xs hover:bg-green-600">{t("approve")}</button>
            <button onClick={() => handleApproval(type, id, "reject")}
              className="px-2 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600">{t("reject")}</button>
          </div>
        )}
      </div>
    );
  };

  // Filter branches by brand for transfer form
  const toBranches = transferToBrandId
    ? allBranches.filter((b: any) => b.brand_id === transferToBrandId)
    : allBranches;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    try {
      if (editingEmp) {
        const res = await apiFetch(`/api/hr/employees/${editingEmp.id}`, { method: "PUT", body: fd });
        if (!res.ok) { const d = await res.json(); alert(d.detail || "Error"); return; }
      } else {
        const res = await apiFetch("/api/hr/employees", { method: "POST", body: fd });
        if (!res.ok) { const d = await res.json(); alert(d.detail || "Error"); return; }
      }
      setShowForm(false);
      setEditingEmp(null);
      loadEmployees();
      loadEmployers();
    } catch (err: unknown) { alert((err as Error).message); }
  };

  const startEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setShowForm(true);
  };

  const handleDeleteEmp = async (emp: Employee) => {
    if (!confirm(`${t("delete")} ${emp.name_ar || emp.name}?`)) return;
    try {
      const res = await apiFetch(`/api/hr/employees/${emp.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      loadEmployees();
    } catch (err: unknown) { alert((err as Error).message); }
  };

  const branchName = (id: number) => { const b = allBranches.find(x => x.id === id) || branches.find(x => x.id === id); return b ? (i18n.language === "ar" ? (b.name_ar || b.name) : b.name) : ""; };
  const empName = (id: number) => { const e = employees.find(x => x.id === id); return e ? (e.name_ar || e.name) : "-"; };
  const empStaffNo = (id: number) => employees.find(e => e.id === id)?.staff_no || "";

  const inBranchFilter = (emp: { branch_id: number }) =>
    !branchFilter || emp.branch_id === Number(branchFilter);
  const inEmpBranchFilter = (rec: { employee_id: number }) =>
    !branchFilter || employees.find(e => e.id === rec.employee_id)?.branch_id === Number(branchFilter);

  const exportData = (fmt: string) => {
    const params = branchFilter ? `?branch_id=${branchFilter}` : "";
    const ext = fmt === "excel" ? "xlsx" : fmt;
    apiDownload(`/api/export/hr/${fmt}${params}`, `employees.${ext}`);
  };

  const showSalaryMsg = (text: string, type: "success" | "error") => {
    setSalaryMsg(text);
    setSalaryMsgType(type);
    setTimeout(() => setSalaryMsg(""), 5000);
  };

  const handleGeneratePayroll = async () => {
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new URLSearchParams();
    fd.append("month", salaryMonth);
    try {
      const res = await apiFetch("/api/hr/salary/generate", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error");
      showSalaryMsg(t("payroll_generated"), "success");
      loadSalary();
    } catch (err: unknown) {
      showSalaryMsg((err as Error).message, "error");
    }
  };

  const handleEditSalary = (r: SalaryRecord) => {
    setEditingRecord(r);
    // Sync basic salary from employee's current actual salary if available
    const emp = employees.find(e => e.id === r.employee_id);
    const syncedSalary = emp && emp.actual_salary > 0 ? emp.actual_salary : r.basic_salary;
    setEditBasicSalary(String(syncedSalary));
    setEditTotalDays(String(r.total_days));
    setEditDaysWorked(String(r.days_worked));
    setEditPeriodStart(r.period_start || "");
    setEditPeriodEnd(r.period_end || "");
    // Sync last workplace from employee's current branch
    const empBranch = emp ? branchName(emp.branch_id) : "";
    setEditLastWorkplace(r.last_workplace || empBranch);
    setEditHousing(String(r.housing_allowance));
    setEditTransport(String(r.transport_allowance));
    setEditFood(String(r.food_allowance));
    setEditOtherAllow(String(r.other_allowance));
    setEditAbsence(String(r.absence_deduction));
    setEditLate(String(r.late_deduction));
    setEditOtherDed(String(r.other_deduction));
    setEditAdvance(String(r.advance));
    setEditOvertime(String(r.overtime));
    setEditBonus(String(r.bonus));
    setEditIncentive(String(r.incentive));
    setEditLeaveSalary(String(r.leave_salary));
    setEditTicket(String(r.ticket_payment));
    setEditLoanDed(String(r.loan_deduction));
    setEditPenalty(String(r.penalty));
    // Sync payment method from employee's current transfer method
    setEditMethod(emp ? emp.salary_transfer_method || "cash" : r.payment_method);
    setEditNotes(r.notes || "");
  };

  const calcNet = () => {
    const basic = Number(editBasicSalary);
    const tDays = Number(editTotalDays) || 30;
    const dWorked = Number(editDaysWorked);
    const perDay = basic / tDays;
    const earned = perDay * dWorked;
    const totalAllow = Number(editHousing) + Number(editTransport) + Number(editFood) + Number(editOtherAllow);
    const totalAdditions = Number(editOvertime) + Number(editBonus) + Number(editIncentive) + Number(editLeaveSalary) + Number(editTicket);
    const totalDed = Number(editAbsence) + Number(editLate) + Number(editOtherDed) + Number(editLoanDed) + Number(editPenalty);
    return earned + totalAllow + totalAdditions - totalDed - Number(editAdvance);
  };

  const calcDailyRate = () => {
    return Number(editBasicSalary) / (Number(editTotalDays) || 30);
  };

  const handleSaveSalary = async () => {
    if (!editingRecord) return;
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new URLSearchParams();
    fd.append("basic_salary", editBasicSalary);
    fd.append("total_days", editTotalDays);
    fd.append("days_worked", editDaysWorked);
    fd.append("period_start", editPeriodStart);
    fd.append("period_end", editPeriodEnd);
    fd.append("last_workplace", editLastWorkplace);
    fd.append("housing_allowance", editHousing);
    fd.append("transport_allowance", editTransport);
    fd.append("food_allowance", editFood);
    fd.append("other_allowance", editOtherAllow);
    fd.append("absence_deduction", editAbsence);
    fd.append("late_deduction", editLate);
    fd.append("other_deduction", editOtherDed);
    fd.append("advance", editAdvance);
    fd.append("overtime", editOvertime);
    fd.append("bonus", editBonus);
    fd.append("incentive", editIncentive);
    fd.append("leave_salary", editLeaveSalary);
    fd.append("ticket_payment", editTicket);
    fd.append("loan_deduction", editLoanDed);
    fd.append("penalty", editPenalty);
    fd.append("payment_method", editMethod);
    fd.append("notes", editNotes);
    try {
      const res = await apiFetch(`/api/hr/salary/${editingRecord.id}`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error("Error");
      showSalaryMsg(t("salary_updated"), "success");
      setEditingRecord(null);
      loadSalary();
    } catch (err: unknown) {
      showSalaryMsg((err as Error).message, "error");
    }
  };

  const handleMarkPaid = async (id: number) => {
    try {
      const res = await apiFetch(`/api/hr/salary/${id}/pay`, { method: "POST" });
      if (!res.ok) throw new Error("Error");
      showSalaryMsg(t("salary_marked_paid"), "success");
      loadSalary();
    } catch (err: unknown) {
      showSalaryMsg((err as Error).message, "error");
    }
  };

  const handleHoldSalary = async (id: number) => {
    try {
      const res = await apiFetch(`/api/hr/salary/${id}/hold`, { method: "POST" });
      if (!res.ok) throw new Error("Error");
      showSalaryMsg(t("salary_held"), "success");
      loadSalary();
    } catch (err: unknown) {
      showSalaryMsg((err as Error).message, "error");
    }
  };

  const handleReleaseSalary = async (id: number) => {
    try {
      const res = await apiFetch(`/api/hr/salary/${id}/release`, { method: "POST" });
      if (!res.ok) throw new Error("Error");
      showSalaryMsg(t("salary_released"), "success");
      loadSalary();
    } catch (err: unknown) {
      showSalaryMsg((err as Error).message, "error");
    }
  };

  const handleViewPayslip = async (id: number) => {
    try {
      const data = await apiGet(`/api/hr/salary/${id}/payslip`);
      setPayslipData(data);
      setShowPayslip(true);
    } catch (err: unknown) {
      showSalaryMsg((err as Error).message, "error");
    }
  };

  const printEmployeeForm = (emp: Employee) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const branch = branchName(emp.branch_id);
    w.document.write(`<html><head><title>Employee Form - ${emp.name_ar || emp.name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; direction: rtl; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h1 { font-size: 20px; margin: 4px 0; }
        .header h2 { font-size: 16px; margin: 4px 0; color: #444; }
        .header p { font-size: 12px; color: #666; }
        .section { margin: 20px 0; }
        .section h3 { font-size: 14px; font-weight: bold; background: #f0f0f0; padding: 6px 10px; margin-bottom: 10px; }
        .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field { display: flex; gap: 8px; font-size: 13px; padding: 4px 0; border-bottom: 1px dotted #ccc; }
        .field-label { font-weight: bold; min-width: 140px; }
        .field-value { flex: 1; }
        .photo-box { border: 1px solid #ccc; width: 100px; height: 120px; float: left; text-align: center; line-height: 120px; font-size: 11px; color: #999; }
        .signature-area { margin-top: 40px; display: flex; justify-content: space-between; }
        .sig-box { text-align: center; width: 200px; }
        .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 5px; font-size: 12px; }
        @media print { body { padding: 15px; } }
      </style></head><body>
      <div class="header">
        <h1>${companyAr}</h1>
        <h1>${companyEn}</h1>
        <h2>نموذج بيانات الموظف / Employee Information Form</h2>
      </div>
      <div class="photo-box">صورة<br>Photo</div>
      <div class="section">
        <h3>البيانات الشخصية / Personal Information</h3>
        <div class="fields">
          <div class="field"><span class="field-label">رقم الموظف / Staff No:</span><span class="field-value">${emp.staff_no || "—"}</span></div>
          <div class="field"><span class="field-label">الاسم بالعربي / Name (AR):</span><span class="field-value">${emp.name_ar || "—"}</span></div>
          <div class="field"><span class="field-label">الاسم بالانجليزي / Name (EN):</span><span class="field-value">${emp.name || "—"}</span></div>
          <div class="field"><span class="field-label">رقم المدني / Civil ID:</span><span class="field-value">${emp.civil_id || "—"}</span></div>
          <div class="field"><span class="field-label">الهاتف / Phone:</span><span class="field-value">${emp.phone || "—"}</span></div>
          <div class="field"><span class="field-label">الجنسية / Nationality:</span><span class="field-value">—</span></div>
        </div>
      </div>
      <div class="section">
        <h3>بيانات العمل / Employment Information</h3>
        <div class="fields">
          <div class="field"><span class="field-label">المسمى الوظيفي / Position:</span><span class="field-value">${emp.position || "—"}</span></div>
          <div class="field"><span class="field-label">الفرع / Branch:</span><span class="field-value">${branch}</span></div>
          <div class="field"><span class="field-label">جهة العمل / Employer:</span><span class="field-value">${emp.employer || "—"}</span></div>
          <div class="field"><span class="field-label">تاريخ الالتحاق / Join Date:</span><span class="field-value">${emp.join_date || "—"}</span></div>
          <div class="field"><span class="field-label">تاريخ الاستقالة / Resignation Date:</span><span class="field-value">${emp.termination_date || "—"}</span></div>
          <div class="field"><span class="field-label">آخر يوم عمل / Last Working Date:</span><span class="field-value">${emp.last_working_date || "—"}</span></div>
          <div class="field"><span class="field-label">انتهاء الإقامة / Residency Expiry:</span><span class="field-value">${emp.residency_expiry || "—"}</span></div>
          <div class="field"><span class="field-label">انتهاء البطاقة الصحية / Health Card Expiry:</span><span class="field-value">${emp.health_card_expiry || "—"}</span></div>
        </div>
      </div>
      <div class="section">
        <h3>البيانات المالية / Financial Information</h3>
        <div class="fields">
          <div class="field"><span class="field-label">راتب تصريح العمل / Work Permit Salary:</span><span class="field-value">${emp.work_permit_salary || 0} KD</span></div>
          <div class="field"><span class="field-label">الراتب الفعلي / Actual Salary:</span><span class="field-value">${emp.actual_salary || 0} KD</span></div>
          <div class="field"><span class="field-label">رقم الحساب / IBAN:</span><span class="field-value">${emp.iban || "—"}</span></div>
          <div class="field"><span class="field-label">اسم البنك / Bank Name:</span><span class="field-value">${emp.bank_name || "—"}</span></div>
          <div class="field"><span class="field-label">طريقة التحويل / Transfer Method:</span><span class="field-value">${emp.salary_transfer_method === "bank" ? "تحويل بنكي / Bank" : "نقداً / Cash"}</span></div>
        </div>
      </div>
      <div class="signature-area">
        <div class="sig-box"><div class="sig-line">توقيع الموظف / Employee Signature</div></div>
        <div class="sig-box"><div class="sig-line">توقيع المدير / Manager Signature</div></div>
        <div class="sig-box"><div class="sig-line">التاريخ / Date</div></div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const handlePrintPayslip = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const slip = payslipData;
    const emp = slip.employee;
    const monthLabel = slip.month;
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pay Slip - ${emp.name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;padding:20px;font-size:12px;direction:ltr}
.container{max-width:700px;margin:0 auto;border:2px solid #333;padding:20px}
.header{text-align:center;border-bottom:2px solid #333;padding-bottom:15px;margin-bottom:15px}
.header h1{font-size:18px;margin-bottom:4px}
.header h2{font-size:14px;color:#555}
.header .ar{font-family:'Arial',sans-serif;direction:rtl}
.section{margin-bottom:12px}
.section-title{font-weight:bold;font-size:13px;background:#f0f0f0;padding:5px 8px;border:1px solid #ccc;margin-bottom:8px}
.row{display:flex;justify-content:space-between;padding:3px 8px;border-bottom:1px dotted #ddd}
.row .label{font-weight:500}
.row .label-ar{font-family:'Arial',sans-serif;direction:rtl;color:#555;font-size:11px}
.row .value{font-weight:bold;font-family:monospace}
.emp-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;padding:0 8px;margin-bottom:10px}
.emp-grid .item{display:flex;justify-content:space-between;border-bottom:1px dotted #eee;padding:3px 0}
.totals{background:#f8f8f8;border:1px solid #333;padding:8px;margin-top:10px}
.totals .row{border-bottom:none;font-size:13px}
.net-row{font-size:16px;font-weight:bold;color:#1a5f1a;border-top:2px solid #333;padding-top:8px;margin-top:8px}
.footer{margin-top:20px;display:flex;justify-content:space-between;padding-top:15px;border-top:1px solid #ccc}
.sig-box{text-align:center;width:45%}
.sig-line{border-bottom:1px solid #333;height:40px;margin-bottom:5px}
@media print{body{padding:0}.container{border:none}}
</style></head><body>
<div class="container">
<div class="header">
<h1>${companyEn}</h1>
<h1 class="ar">${companyAr}</h1>
<h2>PAY SLIP / قسيمة الراتب</h2>
<p style="margin-top:8px;font-size:11px">Month / الشهر: <strong>${monthLabel}</strong></p>
</div>

<div class="section">
<div class="section-title">Employee Information / معلومات الموظف</div>
<div class="emp-grid">
<div class="item"><span>Staff No. / رقم الموظف</span><span style="font-weight:bold">${emp.staff_no || '—'}</span></div>
<div class="item"><span>Name / الاسم</span><span style="font-weight:bold">${emp.name || '—'}</span></div>
<div class="item"><span>Position / المسمى الوظيفي</span><span style="font-weight:bold">${emp.position || '—'}</span></div>
<div class="item"><span>Branch / الفرع</span><span style="font-weight:bold">${emp.branch || '—'}</span></div>
<div class="item"><span>Civil ID / الرقم المدني</span><span style="font-weight:bold">${emp.civil_id || '—'}</span></div>
<div class="item"><span>IBAN</span><span style="font-weight:bold">${emp.iban || '—'}</span></div>
<div class="item"><span>Bank / البنك</span><span style="font-weight:bold">${emp.bank_name || '—'}</span></div>
<div class="item"><span>Join Date / تاريخ الالتحاق</span><span style="font-weight:bold">${emp.join_date || '—'}</span></div>
</div>
</div>

<div class="section">
<div class="section-title">Salary Details / تفاصيل الراتب</div>
<div class="row"><span class="label">Basic Salary / الراتب الأساسي</span><span class="value">KD ${slip.basic_salary.toFixed(3)}</span></div>
<div class="row"><span class="label">Days Worked / أيام العمل</span><span class="value">${slip.days_worked} / ${slip.total_days}</span></div>
<div class="row"><span class="label">Period / الفترة</span><span class="value">${slip.period_start || '—'} to ${slip.period_end || '—'}</span></div>
</div>

<div class="section">
<div class="section-title">Earnings / المستحقات</div>
${slip.overtime > 0 ? `<div class="row"><span class="label">Overtime / العمل الإضافي</span><span class="value" style="color:green">+${slip.overtime.toFixed(3)}</span></div>` : ''}
${slip.bonus > 0 ? `<div class="row"><span class="label">Bonus / مكافأة</span><span class="value" style="color:green">+${slip.bonus.toFixed(3)}</span></div>` : ''}
${slip.incentive > 0 ? `<div class="row"><span class="label">Incentive / حافز</span><span class="value" style="color:green">+${slip.incentive.toFixed(3)}</span></div>` : ''}
${slip.leave_salary > 0 ? `<div class="row"><span class="label">Leave Salary / راتب الإجازة</span><span class="value" style="color:green">+${slip.leave_salary.toFixed(3)}</span></div>` : ''}
${slip.ticket_payment > 0 ? `<div class="row"><span class="label">Ticket Payment / تذكرة السفر</span><span class="value" style="color:green">+${slip.ticket_payment.toFixed(3)}</span></div>` : ''}
${slip.housing_allowance > 0 ? `<div class="row"><span class="label">Housing Allowance / بدل سكن</span><span class="value" style="color:green">+${slip.housing_allowance.toFixed(3)}</span></div>` : ''}
${slip.transport_allowance > 0 ? `<div class="row"><span class="label">Transport Allowance / بدل نقل</span><span class="value" style="color:green">+${slip.transport_allowance.toFixed(3)}</span></div>` : ''}
${slip.food_allowance > 0 ? `<div class="row"><span class="label">Food Allowance / بدل طعام</span><span class="value" style="color:green">+${slip.food_allowance.toFixed(3)}</span></div>` : ''}
${slip.other_allowance > 0 ? `<div class="row"><span class="label">Other Allowance / بدلات أخرى</span><span class="value" style="color:green">+${slip.other_allowance.toFixed(3)}</span></div>` : ''}
<div class="row" style="font-weight:bold;border-top:1px solid #ccc"><span class="label">Total Earnings / إجمالي المستحقات</span><span class="value" style="color:green">KD ${slip.allowances.toFixed(3)}</span></div>
</div>

<div class="section">
<div class="section-title">Deductions / الخصومات</div>
${slip.loan_deduction > 0 ? `<div class="row"><span class="label">Loan Deduction / خصم القرض</span><span class="value" style="color:red">-${slip.loan_deduction.toFixed(3)}</span></div>` : ''}
${slip.penalty > 0 ? `<div class="row"><span class="label">Penalty/Fine / غرامة</span><span class="value" style="color:red">-${slip.penalty.toFixed(3)}</span></div>` : ''}
${slip.absence_deduction > 0 ? `<div class="row"><span class="label">Absence Deduction / خصم غياب</span><span class="value" style="color:red">-${slip.absence_deduction.toFixed(3)}</span></div>` : ''}
${slip.late_deduction > 0 ? `<div class="row"><span class="label">Late Deduction / خصم تأخير</span><span class="value" style="color:red">-${slip.late_deduction.toFixed(3)}</span></div>` : ''}
${slip.other_deduction > 0 ? `<div class="row"><span class="label">Other Deduction / خصومات أخرى</span><span class="value" style="color:red">-${slip.other_deduction.toFixed(3)}</span></div>` : ''}
${slip.advance > 0 ? `<div class="row"><span class="label">Advance / سلفة</span><span class="value" style="color:red">-${slip.advance.toFixed(3)}</span></div>` : ''}
<div class="row" style="font-weight:bold;border-top:1px solid #ccc"><span class="label">Total Deductions / إجمالي الخصومات</span><span class="value" style="color:red">KD ${slip.deductions.toFixed(3)}</span></div>
</div>

<div class="totals">
<div class="row net-row"><span class="label">NET SALARY / صافي الراتب</span><span class="value">KD ${slip.net_salary.toFixed(3)}</span></div>
<div class="row"><span class="label">Payment Method / طريقة الدفع</span><span class="value">${slip.payment_method === 'bank_transfer' ? 'Bank Transfer / تحويل بنكي' : 'Cash / نقداً'}</span></div>
${slip.status === 'paid' ? `<div class="row"><span class="label">Paid Date / تاريخ الدفع</span><span class="value">${slip.paid_date || '—'}</span></div>` : ''}
</div>

<div class="footer">
<div class="sig-box"><div class="sig-line"></div><p>Employee Signature<br/>توقيع الموظف</p></div>
<div class="sig-box"><div class="sig-line"></div><p>Authorized Signature<br/>التوقيع المعتمد</p></div>
</div>
</div>
</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const handlePrintAllPayslips = async () => {
    if (salaryRecords.length === 0) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>All Pay Slips - ${salaryMonth}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;padding:5mm;font-size:9px;direction:ltr}
.page{width:100%;height:auto;display:flex;flex-direction:column;gap:3mm;page-break-after:always}
.page:last-child{page-break-after:auto}
.slip{border:1.5px solid #333;padding:8px;flex:1;max-height:48%}
.header{text-align:center;border-bottom:1.5px solid #333;padding-bottom:4px;margin-bottom:4px}
.header h1{font-size:11px;margin:0}
.header h2{font-size:9px;color:#555;margin:0}
.section{margin-bottom:4px}
.section-title{font-weight:bold;font-size:9px;background:#f0f0f0;padding:2px 4px;border:1px solid #ccc;margin-bottom:3px}
.row{display:flex;justify-content:space-between;padding:1px 4px;border-bottom:1px dotted #ddd;font-size:9px}
.row .value{font-weight:bold;font-family:monospace}
.emp-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px 10px;padding:0 4px;margin-bottom:4px;font-size:9px}
.emp-grid .item{display:flex;justify-content:space-between;border-bottom:1px dotted #eee;padding:1px 0}
.totals{background:#f8f8f8;border:1px solid #333;padding:4px;margin-top:4px}
.net-row{font-size:11px;font-weight:bold;color:#1a5f1a;border-top:1.5px solid #333;padding-top:3px;margin-top:3px}
.footer{margin-top:6px;display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid #ccc}
.sig-box{text-align:center;width:45%;font-size:8px}
.sig-line{border-bottom:1px solid #333;height:20px;margin-bottom:2px}
@media print{body{padding:3mm}@page{size:A4;margin:5mm}}
</style></head><body>`);

    const slips: string[] = [];
    for (const rec of salaryRecords) {
      try {
        const slip = await apiGet(`/api/hr/salary/${rec.id}/payslip`);
        const emp = slip.employee;
        slips.push(`<div class="slip">
<div class="header">
<h1>${companyEn} / ${companyAr}</h1>
<h2>PAY SLIP / قسيمة الراتب — ${slip.month}</h2>
</div>
<div class="section">
<div class="section-title">Employee / الموظف</div>
<div class="emp-grid">
<div class="item"><span>Staff No.</span><span style="font-weight:bold">${emp.staff_no || '—'}</span></div>
<div class="item"><span>Name / الاسم</span><span style="font-weight:bold">${emp.name || '—'}</span></div>
<div class="item"><span>Position</span><span style="font-weight:bold">${emp.position || '—'}</span></div>
<div class="item"><span>Branch</span><span style="font-weight:bold">${emp.branch || '—'}</span></div>
<div class="item"><span>IBAN</span><span style="font-weight:bold">${emp.iban || '—'}</span></div>
<div class="item"><span>Bank</span><span style="font-weight:bold">${emp.bank_name || '—'}</span></div>
</div></div>
<div class="section">
<div class="section-title">Salary / الراتب</div>
<div class="row"><span>Basic Salary / الراتب الأساسي</span><span class="value">KD ${slip.basic_salary.toFixed(3)}</span></div>
<div class="row"><span>Days Worked / أيام العمل</span><span class="value">${slip.days_worked} / ${slip.total_days}</span></div>
${slip.overtime > 0 ? `<div class="row"><span>Overtime / إضافي</span><span class="value" style="color:green">+${slip.overtime.toFixed(3)}</span></div>` : ''}
${slip.bonus > 0 ? `<div class="row"><span>Bonus / مكافأة</span><span class="value" style="color:green">+${slip.bonus.toFixed(3)}</span></div>` : ''}
${slip.incentive > 0 ? `<div class="row"><span>Incentive / حافز</span><span class="value" style="color:green">+${slip.incentive.toFixed(3)}</span></div>` : ''}
${slip.leave_salary > 0 ? `<div class="row"><span>Leave Salary</span><span class="value" style="color:green">+${slip.leave_salary.toFixed(3)}</span></div>` : ''}
${slip.ticket_payment > 0 ? `<div class="row"><span>Ticket</span><span class="value" style="color:green">+${slip.ticket_payment.toFixed(3)}</span></div>` : ''}
${slip.other_allowance > 0 ? `<div class="row"><span>Other Allowance</span><span class="value" style="color:green">+${slip.other_allowance.toFixed(3)}</span></div>` : ''}
${slip.loan_deduction > 0 ? `<div class="row"><span>Loan / قرض</span><span class="value" style="color:red">-${slip.loan_deduction.toFixed(3)}</span></div>` : ''}
${slip.penalty > 0 ? `<div class="row"><span>Penalty / غرامة</span><span class="value" style="color:red">-${slip.penalty.toFixed(3)}</span></div>` : ''}
${slip.absence_deduction > 0 ? `<div class="row"><span>Absence / غياب</span><span class="value" style="color:red">-${slip.absence_deduction.toFixed(3)}</span></div>` : ''}
${slip.advance > 0 ? `<div class="row"><span>Advance / سلفة</span><span class="value" style="color:red">-${slip.advance.toFixed(3)}</span></div>` : ''}
</div>
<div class="totals">
<div class="row net-row"><span>NET SALARY / صافي الراتب</span><span class="value">KD ${slip.net_salary.toFixed(3)}</span></div>
<div class="row"><span>Payment / طريقة الدفع</span><span class="value">${slip.payment_method === 'bank_transfer' ? 'Bank' : 'Cash'}</span></div>
</div>
<div class="footer">
<div class="sig-box"><div class="sig-line"></div><p>Employee / الموظف</p></div>
<div class="sig-box"><div class="sig-line"></div><p>Authorized / المعتمد</p></div>
</div>
</div>`);
      } catch { /* skip if error */ }
    }
    for (let i = 0; i < slips.length; i += 2) {
      w.document.write(`<div class="page">`);
      w.document.write(slips[i]);
      if (i + 1 < slips.length) w.document.write(slips[i + 1]);
      w.document.write(`</div>`);
    }
    w.document.write("</body></html>");
    w.document.close();
    setTimeout(() => w.print(), 1000);
  };

  const totalPayroll = salaryRecords.reduce((s, r) => s + r.net_salary, 0);
  const totalPaid = salaryRecords.filter(r => r.status === "paid").reduce((s, r) => s + r.net_salary, 0);
  const totalPending = salaryRecords.filter(r => r.status === "pending").reduce((s, r) => s + r.net_salary, 0);
  const totalOnHold = salaryRecords.filter(r => r.status === "on_hold").reduce((s, r) => s + r.net_salary, 0);

  const _recDailyRate = (r: SalaryRecord) => r.basic_salary / (r.total_days || 30);
  void _recDailyRate;

  // Transfer handlers
  const handleTransferSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    await apiPost("/api/hr/transfers", fd);
    setShowTransferForm(false);
    apiGet("/api/hr/transfers").then(setTransfers);
  };
  const handleTransferAction = async (id: number, action: "approve" | "reject") => {
    await apiFetch(`/api/hr/transfers/${id}/${action}`, { method: "POST" });
    apiGet("/api/hr/transfers").then(setTransfers);
    loadEmployees();
  };

  // Loan handlers
  const handleLoanSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    if (editingLoan) {
      await apiFetch(`/api/hr/loans/${editingLoan.id}`, { method: "PUT", body: fd });
      setEditingLoan(null);
    } else {
      await apiPost("/api/hr/loans", fd);
    }
    setShowLoanForm(false);
    refreshLoans();
  };

  const loadStatement = (empId: string) => {
    if (!empId) { setStatement(null); return; }
    apiGet(`/api/hr/loans/statement?employee_id=${empId}`).then(setStatement);
  };

  const refreshLoans = () => {
    apiGet("/api/hr/loans").then(setLoans);
    if (statementEmpId) loadStatement(statementEmpId);
  };

  const handleDeleteLoan = async (id: number) => {
    if (!confirm(t("confirm_delete"))) return;
    await apiFetch(`/api/hr/loans/${id}`, { method: "DELETE" });
    refreshLoans();
  };

  const handleRepaymentSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!payingLoan) return;
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    await apiPost(`/api/hr/loans/${payingLoan.id}/repayments`, fd);
    setPayingLoan(null);
    refreshLoans();
  };

  const handleDeleteRepayment = async (repId: number) => {
    if (!confirm(t("confirm_delete"))) return;
    await apiFetch(`/api/hr/loans/repayments/${repId}`, { method: "DELETE" });
    refreshLoans();
  };

  // Benefit handlers
  const loadBenefits = () => {
    apiGet("/api/hr/benefits-deductions").then((data: BenefitDeduction[]) => {
      setBenefits(data.filter(d => ["incentive", "bonus", "leave_salary", "ticket", "other_benefit"].includes(d.category)));
    });
  };

  const handleBenefitSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    if (editingBenefit) {
      await apiFetch(`/api/hr/benefits-deductions/${editingBenefit.id}`, { method: "PUT", body: fd });
      setEditingBenefit(null);
    } else {
      await apiPost("/api/hr/benefits-deductions", fd);
    }
    setShowBenefitForm(false);
    loadBenefits();
  };

  const handleDeleteBenefit = async (id: number) => {
    if (!confirm(t("confirm_delete"))) return;
    await apiFetch(`/api/hr/benefits-deductions/${id}`, { method: "DELETE" });
    loadBenefits();
  };

  // Deduction handlers
  const loadDeductions = () => {
    apiGet("/api/hr/benefits-deductions").then((data: BenefitDeduction[]) => {
      setDeductionItems(data.filter(d => ["fine", "penalty", "other_deduction"].includes(d.category)));
    });
  };

  const handleDeductionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    if (editingDeduction) {
      await apiFetch(`/api/hr/benefits-deductions/${editingDeduction.id}`, { method: "PUT", body: fd });
      setEditingDeduction(null);
    } else {
      await apiPost("/api/hr/benefits-deductions", fd);
    }
    setShowDeductionForm(false);
    loadDeductions();
  };

  const handleDeleteDeduction = async (id: number) => {
    if (!confirm(t("confirm_delete"))) return;
    await apiFetch(`/api/hr/benefits-deductions/${id}`, { method: "DELETE" });
    loadDeductions();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gray-800">{t(mode === "payroll" ? "payroll" : "hr")}</h2>
        <div className="flex gap-2">
          <button onClick={() => exportData("csv")}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700">
            {t("export_csv")}
          </button>
          <button onClick={() => exportData("excel")}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
            {t("export_excel")}
          </button>
          <button onClick={() => exportData("pdf")}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700">
            {t("export_pdf")}
          </button>
          {tab === "employees" && !isPersonnel && (
            <button onClick={() => { setShowForm(!showForm); setEditingEmp(null); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm">
              {showForm ? t("cancel") : t("add_new")}
            </button>
          )}
        </div>
      </div>

      {(isManager || isPersonnel) && (
        <div className="mb-4">
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm">
            <option value="">{t("all_branches")}</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {i18n.language === "ar" ? (b.name_ar || b.name) : b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isManager && tab === "employees" && (
        <label className="flex items-center gap-2 mb-4 text-sm text-gray-700 w-fit">
          <input type="checkbox" checked={showLeft} onChange={e => setShowLeft(e.target.checked)} />
          {t("show_left_staff")}
        </label>
      )}

      {/* Tabs */}
      <div className={`flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit flex-wrap ${visibleTabs.length < 2 ? "hidden" : ""}`}>
        {visibleTabs.filter(tb => {
          if (currentUser.role === "owner") return true;
          const restrictedTabs: Tab[] = ["salary", "loans", "deductions"];
          if (restrictedTabs.includes(tb) && !canViewSalary) return false;
          const userTabs: string[] | null = currentUser.allowed_tabs || null;
          if (userTabs) {
            const hrSubKey = "hr_" + tb;
            if (!userTabs.includes(hrSubKey)) return false;
          }
          return true;
        }).map(tb => {
          const label = tb === "benefits" ? "benefits_tab" : tb === "deductions" ? "deductions_tab" : tb === "loans" ? "advance_loan" : tb === "transfers" ? "staff_transfers" : tb === "leaves" ? "leaves_absences" : tb;
          return (
            <button key={tb} onClick={() => setTab(tb)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === tb ? "bg-white shadow text-emerald-700" : "text-gray-600 hover:text-gray-800"
              }`}>{t(label)}</button>
          );
        })}
      </div>

      {/* Employees Tab */}
      {tab === "employees" && (
        <>
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border mb-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {editingEmp && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t("staff_no")}</label>
                  <input name="staff_no" readOnly value={editingEmp?.staff_no || ""} className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100" />
                </div>
                )}
                {isManager ? (
                <div>
                  <label className="block text-sm font-medium mb-1">{t("branch")}</label>
                  <select name="branch_id" required defaultValue={editingEmp?.branch_id || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {branches.map(b => <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name) : b.name}</option>)}
                  </select>
                </div>
                ) : (
                  <input type="hidden" name="branch_id" value={currentUser.branch_id || editingEmp?.branch_id || ""} />
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t("name")} (EN)</label>
                  <input name="name" required defaultValue={editingEmp?.name || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("name")} (AR)</label>
                  <input name="name_ar" defaultValue={editingEmp?.name_ar || ""} className="w-full px-3 py-2 border rounded-lg text-sm" dir="rtl" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("civil_id")}</label>
                  <input name="civil_id" pattern="\d{12}" maxLength={12} title={t("civil_id_validation")}
                    placeholder="12 digits" defaultValue={editingEmp?.civil_id || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("position")}</label>
                  <input name="position" defaultValue={editingEmp?.position || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("phone")}</label>
                  <input name="phone" pattern="\d{8}" maxLength={8} title={t("phone_validation")}
                    placeholder="8 digits" defaultValue={editingEmp?.phone || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("work_permit_salary")}</label>
                  <input type="number" step="0.001" name="work_permit_salary" defaultValue={editingEmp?.work_permit_salary || 0} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                {canViewSalary && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t("actual_salary")}</label>
                  <input type="number" step="0.001" name="actual_salary" defaultValue={editingEmp?.actual_salary || 0} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t("iban_no")}</label>
                  <input name="iban" defaultValue={editingEmp?.iban || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("bank_name_label")}</label>
                  <input name="bank_name" defaultValue={editingEmp?.bank_name || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("salary_transfer")}</label>
                  <select name="salary_transfer_method" defaultValue={editingEmp?.salary_transfer_method || "cash"} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="cash">{t("cash")}</option>
                    <option value="bank">{t("bank_transfer")}</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium">{t("employer_label")}</label>
                    {canViewSalary && (
                    <button type="button" onClick={() => setShowEmployerMgr(true)}
                      className="text-emerald-600 hover:underline text-xs">{t("manage")}</button>
                    )}
                  </div>
                  <select name="employer" defaultValue={editingEmp?.employer || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">{t("select")}</option>
                    {employers.map(e => <option key={e.id} value={e.name}>{i18n.language === "ar" ? (e.name_ar || e.name) : e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("join_date")}</label>
                  <input type="date" name="join_date" defaultValue={editingEmp?.join_date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("termination_date")}</label>
                  <input type="date" name="termination_date" defaultValue={editingEmp?.termination_date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("last_working_date")}</label>
                  <input type="date" name="last_working_date" defaultValue={editingEmp?.last_working_date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("residency_expiry")}</label>
                  <input type="date" name="residency_expiry" defaultValue={editingEmp?.residency_expiry || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("health_card_expiry")}</label>
                  <input type="date" name="health_card_expiry" defaultValue={editingEmp?.health_card_expiry || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <button type="submit"
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm">
                {t("save")}
              </button>
            </form>
          )}

          <div className="mb-3">
            <input type="text" placeholder={t("search") + "..."} value={empSearch} onChange={e => setEmpSearch(e.target.value)}
              className="w-full md:w-72 px-3 py-2 border rounded-lg text-sm" dir="auto" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left">{t("staff_no")}</th>
                  <th className="px-3 py-3 text-left">{t("name")}</th>
                  {isManager && <th className="px-3 py-3 text-left">{t("branch")}</th>}
                  <th className="px-3 py-3 text-left">{t("position")}</th>
                  <th className="px-3 py-3 text-left">{t("civil_id")}</th>
                  {isManager && <th className="px-3 py-3 text-left">{t("phone")}</th>}
                  <th className="px-3 py-3 text-left">{t("employer_label")}</th>
                  <th className="px-3 py-3 text-left">{t("residency_expiry")}</th>
                  <th className="px-3 py-3 text-left">{t("health_card_expiry")}</th>
                  <th className="px-3 py-3 text-center">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={isManager ? 10 : 8} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : employees.filter(inBranchFilter).filter(emp => {
                  if (!empSearch) return true;
                  const q = empSearch.toLowerCase();
                  return (emp.name_ar || "").includes(q) || (emp.name || "").toLowerCase().includes(q) || (emp.staff_no || "").includes(q) || (emp.civil_id || "").includes(q);
                }).map(emp => (
                  <tr key={emp.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-3">{emp.staff_no || "—"}</td>
                    <td className="px-3 py-3" dir="rtl">{emp.name_ar || emp.name}</td>
                    {isManager && <td className="px-3 py-3">{branchName(emp.branch_id)}</td>}
                    <td className="px-3 py-3">{emp.position}</td>
                    <td className="px-3 py-3">{emp.civil_id}</td>
                    {isManager && <td className="px-3 py-3">{emp.phone}</td>}
                    <td className="px-3 py-3">{(() => {
                      if (!emp.employer) return "—";
                      const match = employers.find(e => e.name === emp.employer);
                      return i18n.language === "ar" && match?.name_ar ? match.name_ar : emp.employer;
                    })()}</td>
                    <td className="px-3 py-3">{emp.residency_expiry || "—"}</td>
                    <td className="px-3 py-3">{emp.health_card_expiry || "—"}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        {!isPersonnel && <button onClick={() => startEditEmp(emp)} className="text-blue-600 hover:underline text-xs">{t("edit")}</button>}
                        <button onClick={() => printEmployeeForm(emp)} className="text-purple-600 hover:underline text-xs">PDF</button>
                        {isManager && (
                          <button onClick={() => handleDeleteEmp(emp)} className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Employer Manager Modal */}
      {showEmployerMgr && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowEmployerMgr(false)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t("employer_label")}</h3>
              <button onClick={() => setShowEmployerMgr(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input value={newEmployerName} onChange={e => setNewEmployerName(e.target.value)}
                placeholder={t("name") + " (EN)"} className="px-3 py-2 border rounded-lg text-sm" />
              <input value={newEmployerNameAr} onChange={e => setNewEmployerNameAr(e.target.value)}
                placeholder={t("name") + " (AR)"} dir="rtl" className="px-3 py-2 border rounded-lg text-sm" />
            </div>
            <button onClick={async () => {
              if (!newEmployerName.trim()) return;
              const fd = new FormData();
              fd.append("name", newEmployerName.trim());
              fd.append("name_ar", newEmployerNameAr.trim());
              const res = await apiFetch("/api/hr/employers", { method: "POST", body: fd });
              if (!res.ok) { const d = await res.json(); alert(d.detail || "Error"); return; }
              setNewEmployerName(""); setNewEmployerNameAr("");
              loadEmployers();
            }} className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm mb-4">
              {t("add")}
            </button>
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              {employers.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400 text-center">{t("no_data")}</div>
              ) : employers.map(e => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{e.name}{e.name_ar ? <span className="text-gray-400" dir="rtl"> — {e.name_ar}</span> : null}</span>
                  <button onClick={async () => {
                    if (!confirm(t("confirm_delete"))) return;
                    await apiFetch(`/api/hr/employers/${e.id}`, { method: "DELETE" });
                    loadEmployers();
                  }} className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Salary Management Tab */}
      {tab === "salary" && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("select_month")}</label>
              <input type="month" value={salaryMonth} onChange={e => setSalaryMonth(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm" />
            </div>

            {isManager && (
              <>
                <button onClick={handleGeneratePayroll}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm mt-5">
                  {t("generate_payroll")}
                </button>
                <button onClick={() => apiDownload(`/api/export/salary/csv?month=${salaryMonth}&lang=${i18n.language}`, `salary_${salaryMonth}.csv`)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm mt-5">
                  {t("export_csv")}
                </button>
                <button onClick={() => apiDownload(`/api/export/salary/excel?month=${salaryMonth}&lang=${i18n.language}`, `salary_${salaryMonth}.xlsx`)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm mt-5">
                  {t("export_excel")}
                </button>
                <button onClick={() => apiDownload(`/api/export/salary/pdf?month=${salaryMonth}&lang=${i18n.language}`, `salary_${salaryMonth}.pdf`)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm mt-5">
                  {t("export_pdf")}
                </button>
                <button onClick={handlePrintAllPayslips}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm mt-5">
                  {t("print_all_payslips")}
                </button>
                <button onClick={() => apiDownload(`/api/export/salary/slips/pdf?month=${salaryMonth}&lang=${i18n.language}`, `payslips_${salaryMonth}.pdf`)}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm mt-5">
                  {t("download_payslips_pdf")}
                </button>
              </>
            )}
          </div>

          {salaryMsg && (
            <div className={`p-3 rounded mb-4 text-sm ${
              salaryMsgType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>{salaryMsg}</div>
          )}

          {salaryRecords.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <p className="text-xs text-blue-600 font-medium">{t("total_payroll")}</p>
                <p className="text-xl font-bold text-blue-800">KD {totalPayroll.toFixed(3)}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                <p className="text-xs text-green-600 font-medium">{t("total_paid")}</p>
                <p className="text-xl font-bold text-green-800">KD {totalPaid.toFixed(3)}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <p className="text-xs text-amber-600 font-medium">{t("total_payable")}</p>
                <p className="text-xl font-bold text-amber-800">KD {totalPending.toFixed(3)}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                <p className="text-xs text-red-600 font-medium">{t("total_on_hold")}</p>
                <p className="text-xl font-bold text-red-800">KD {totalOnHold.toFixed(3)}</p>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {editingRecord && (
            <div className="bg-gray-50 p-5 rounded-xl border mb-4 space-y-4">
              <h4 className="font-semibold text-sm text-gray-800">{t("edit")} — {empName(editingRecord.employee_id)} ({editingRecord.month})</h4>

              {/* Salary & Days */}
              <div>
                <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("salary_details")}</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("basic_salary")}</label>
                    <input type="number" step="0.001" value={editBasicSalary}
                      onChange={e => setEditBasicSalary(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("total_days")}</label>
                    <input type="number" min="1" max="31" value={editTotalDays}
                      onChange={e => setEditTotalDays(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("days_worked")}</label>
                    <input type="number" min="0" max="31" value={editDaysWorked}
                      onChange={e => setEditDaysWorked(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("daily_rate")}</label>
                    <input disabled value={`KD ${calcDailyRate().toFixed(3)}`}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("period_start")}</label>
                    <input type="date" value={editPeriodStart}
                      onChange={e => {
                        const newStart = e.target.value;
                        setEditPeriodStart(newStart);
                        if (newStart && editPeriodEnd) {
                          const d1 = new Date(newStart);
                          const d2 = new Date(editPeriodEnd);
                          const diff = Math.floor((d2.getTime() - d1.getTime()) / (1000*60*60*24)) + 1;
                          if (diff > 0) setEditDaysWorked(String(Math.min(diff, 30)));
                        }
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("period_end")}</label>
                    <input type="date" value={editPeriodEnd}
                      onChange={e => {
                        const newEnd = e.target.value;
                        setEditPeriodEnd(newEnd);
                        if (editPeriodStart && newEnd) {
                          const d1 = new Date(editPeriodStart);
                          const d2 = new Date(newEnd);
                          const diff = Math.floor((d2.getTime() - d1.getTime()) / (1000*60*60*24)) + 1;
                          if (diff > 0) setEditDaysWorked(String(Math.min(diff, 30)));
                        }
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("last_workplace")}</label>
                    <input value={editLastWorkplace}
                      onChange={e => setEditLastWorkplace(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              {/* Allowances */}
              <div>
                <h5 className="text-xs font-semibold text-green-600 uppercase mb-2">{t("allowance_details")}</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("housing_allowance")}</label>
                    <input type="number" step="0.001" value={editHousing}
                      onChange={e => setEditHousing(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("transport_allowance")}</label>
                    <input type="number" step="0.001" value={editTransport}
                      onChange={e => setEditTransport(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("food_allowance")}</label>
                    <input type="number" step="0.001" value={editFood}
                      onChange={e => setEditFood(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("other_allowance")}</label>
                    <input type="number" step="0.001" value={editOtherAllow}
                      onChange={e => setEditOtherAllow(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              {/* Additions (OT, Bonus, Incentive, Leave, Ticket) */}
              <div>
                <h5 className="text-xs font-semibold text-blue-600 uppercase mb-2">{t("additions")}</h5>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("overtime")}</label>
                    <input type="number" step="0.001" value={editOvertime}
                      onChange={e => setEditOvertime(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("bonus_label")}</label>
                    <input type="number" step="0.001" value={editBonus}
                      onChange={e => setEditBonus(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("incentive_label")}</label>
                    <input type="number" step="0.001" value={editIncentive}
                      onChange={e => setEditIncentive(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("leave_salary_label")}</label>
                    <input type="number" step="0.001" value={editLeaveSalary}
                      onChange={e => setEditLeaveSalary(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("ticket_payment_label")}</label>
                    <input type="number" step="0.001" value={editTicket}
                      onChange={e => setEditTicket(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <h5 className="text-xs font-semibold text-red-600 uppercase mb-2">{t("deduction_details")}</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("absence_deduction")}</label>
                    <input type="number" step="0.001" value={editAbsence}
                      onChange={e => setEditAbsence(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("late_deduction")}</label>
                    <input type="number" step="0.001" value={editLate}
                      onChange={e => setEditLate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("other_deduction")}</label>
                    <input type="number" step="0.001" value={editOtherDed}
                      onChange={e => setEditOtherDed(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("advance")}</label>
                    <input type="number" step="0.001" value={editAdvance}
                      onChange={e => setEditAdvance(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("loan_deduction_label")}</label>
                    <input type="number" step="0.001" value={editLoanDed}
                      onChange={e => setEditLoanDed(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t("penalty_label")}</label>
                    <input type="number" step="0.001" value={editPenalty}
                      onChange={e => setEditPenalty(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              {/* Payment & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">{t("payment_method")}</label>
                  <select value={editMethod} onChange={e => setEditMethod(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="cash">{t("cash")}</option>
                    <option value="bank_transfer">{t("bank_transfer")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{t("notes")}</label>
                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              {/* Net Salary Calculation */}
              <div className="bg-white p-3 rounded-lg border text-sm space-y-1">
                <div className="flex justify-between">
                  <span>{t("earned_basic")} ({calcDailyRate().toFixed(3)} × {editDaysWorked})</span>
                  <span className="font-mono">KD {(calcDailyRate() * Number(editDaysWorked)).toFixed(3)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>+ {t("allowances")}</span>
                  <span className="font-mono">+{(Number(editHousing) + Number(editTransport) + Number(editFood) + Number(editOtherAllow)).toFixed(3)}</span>
                </div>
                <div className="flex justify-between text-blue-600">
                  <span>+ {t("additions")} (OT + Bonus + Incentive + Leave + Ticket)</span>
                  <span className="font-mono">+{(Number(editOvertime) + Number(editBonus) + Number(editIncentive) + Number(editLeaveSalary) + Number(editTicket)).toFixed(3)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>- {t("deductions")} (Absence + Late + Other + Loan + Penalty)</span>
                  <span className="font-mono">-{(Number(editAbsence) + Number(editLate) + Number(editOtherDed) + Number(editLoanDed) + Number(editPenalty)).toFixed(3)}</span>
                </div>
                <div className="flex justify-between text-orange-600">
                  <span>- {t("advance")}</span>
                  <span className="font-mono">-{Number(editAdvance).toFixed(3)}</span>
                </div>
                <div className="border-t pt-1 flex justify-between font-bold text-base">
                  <span>{t("net_salary")}</span>
                  <span className="font-mono">KD {calcNet().toFixed(3)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSaveSalary}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
                  {t("save")}
                </button>
                <button onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Salary Search */}
          <div className="mb-3">
            <input type="text" placeholder={t("search") + "..."} value={salarySearch} onChange={e => setSalarySearch(e.target.value)}
              className="w-full md:w-72 px-3 py-2 border rounded-lg text-sm" dir="auto" />
          </div>

          {/* Salary Summary Table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left">{t("staff_no")}</th>
                  <th className="px-3 py-3 text-left">{t("name")}</th>
                  <th className="px-3 py-3 text-left">{t("position")}</th>
                  <th className="px-3 py-3 text-center">{t("days_worked")}</th>
                  <th className="px-3 py-3 text-right">{t("basic_salary")}</th>
                  <th className="px-3 py-3 text-right text-green-600">{t("total_allowances")}</th>
                  <th className="px-3 py-3 text-right text-red-600">{t("total_deductions")}</th>
                  <th className="px-3 py-3 text-right font-bold">{t("net_salary")}</th>
                  <th className="px-3 py-3 text-left">{t("approval")}</th>
                  <th className="px-3 py-3 text-left">{t("status")}</th>
                  {isManager && <th className="px-3 py-3 text-left">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {salaryRecords.length === 0 ? (
                  <tr><td colSpan={isManager ? 11 : 10} className="px-4 py-8 text-center text-gray-400">
                    {t("no_data")} — {t("generate_payroll")}
                  </td></tr>
                ) : salaryRecords.filter(inEmpBranchFilter).filter(r => {
                  if (!salarySearch) return true;
                  const q = salarySearch.toLowerCase();
                  const name = r.name_ar || r.name || empName(r.employee_id);
                  return name.includes(q) || (r.staff_no || "").includes(q);
                }).map(r => {
                  const totalAllowances = r.allowances + r.overtime + r.bonus + r.incentive + r.leave_salary + r.ticket_payment;
                  const totalDeductions = r.deductions + r.advance + r.loan_deduction + r.penalty;
                  return (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-3">{r.staff_no || empStaffNo(r.employee_id) || "—"}</td>
                      <td className="px-3 py-3 font-medium">{r.name_ar || r.name || empName(r.employee_id)}</td>
                      <td className="px-3 py-3">{r.designation || "—"}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={r.days_worked < r.total_days ? "text-orange-600 font-semibold" : ""}>
                          {r.days_worked}/{r.total_days}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{r.basic_salary.toFixed(3)}</td>
                      <td className="px-3 py-3 text-right font-mono text-green-600">
                        {totalAllowances > 0 ? `+${totalAllowances.toFixed(3)}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-red-600">
                        {totalDeductions > 0 ? `-${totalDeductions.toFixed(3)}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold">{r.net_salary.toFixed(3)}</td>
                      <td className="px-3 py-3">
                        <ApprovalBadge status={r.approval_status} type="salary" id={r.id} />
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.status === "paid" ? "bg-green-100 text-green-700"
                          : r.status === "on_hold" ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                        }`}>{r.status === "paid" ? t("paid") : r.status === "on_hold" ? t("on_hold") : t("pending")}</span>
                      </td>
                      {isManager && (
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => handleViewPayslip(r.id)}
                              className="text-purple-600 hover:underline text-xs">{t("pay_slip")}</button>
                            {r.status === "pending" && (
                              <>
                                <button onClick={() => handleEditSalary(r)}
                                  className="text-blue-600 hover:underline text-xs">{t("edit")}</button>
                                <button onClick={() => handleMarkPaid(r.id)}
                                  className="text-green-600 hover:underline text-xs">{t("mark_paid")}</button>
                                <button onClick={() => handleHoldSalary(r.id)}
                                  className="text-red-600 hover:underline text-xs">{t("hold_salary")}</button>
                              </>
                            )}
                            {r.status === "on_hold" && (
                              <button onClick={() => handleReleaseSalary(r.id)}
                                className="text-orange-600 hover:underline text-xs">{t("release_salary")}</button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pay Slip Modal */}
          {showPayslip && payslipData && (
            <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 my-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold">{t("pay_slip")} — {payslipData.employee?.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={handlePrintPayslip}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                      {t("print")}
                    </button>
                    <button onClick={() => setShowPayslip(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">
                      {t("close")}
                    </button>
                  </div>
                </div>

                {/* Employee Info */}
                <div className="border rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-sm mb-2 text-gray-600">{t("employee_information")} / معلومات الموظف</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">{t("staff_no")}:</span> <strong>{payslipData.employee?.staff_no || "—"}</strong></div>
                    <div><span className="text-gray-500">{t("name")}:</span> <strong>{payslipData.employee?.name || "—"}</strong></div>
                    <div><span className="text-gray-500">{t("position")}:</span> <strong>{payslipData.employee?.position || "—"}</strong></div>
                    <div><span className="text-gray-500">{t("branch")}:</span> <strong>{payslipData.employee?.branch || "—"}</strong></div>
                    <div><span className="text-gray-500">{t("civil_id")}:</span> <strong>{payslipData.employee?.civil_id || "—"}</strong></div>
                    <div><span className="text-gray-500">IBAN:</span> <strong>{payslipData.employee?.iban || "—"}</strong></div>
                  </div>
                </div>

                {/* Salary Details */}
                <div className="border rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-sm mb-2 text-gray-600">{t("salary_details")} / تفاصيل الراتب</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>{t("basic_salary")} / الراتب الأساسي</span><span className="font-bold">KD {payslipData.basic_salary?.toFixed(3)}</span></div>
                    <div className="flex justify-between"><span>{t("days_worked")} / أيام العمل</span><span className="font-bold">{payslipData.days_worked} / {payslipData.total_days}</span></div>
                    <div className="flex justify-between"><span>{t("period")} / الفترة</span><span className="font-bold">{payslipData.period_start || "—"} → {payslipData.period_end || "—"}</span></div>
                  </div>
                </div>

                {/* Earnings */}
                <div className="border rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-sm mb-2 text-green-700">{t("earnings")} / المستحقات</h4>
                  <div className="space-y-1 text-xs">
                    {payslipData.overtime > 0 && <div className="flex justify-between"><span>{t("overtime")} / العمل الإضافي</span><span className="text-green-600 font-bold">+{payslipData.overtime.toFixed(3)}</span></div>}
                    {payslipData.bonus > 0 && <div className="flex justify-between"><span>{t("bonus")} / مكافأة</span><span className="text-green-600 font-bold">+{payslipData.bonus.toFixed(3)}</span></div>}
                    {payslipData.incentive > 0 && <div className="flex justify-between"><span>{t("incentive")} / حافز</span><span className="text-green-600 font-bold">+{payslipData.incentive.toFixed(3)}</span></div>}
                    {payslipData.leave_salary > 0 && <div className="flex justify-between"><span>{t("leave_salary")} / راتب الإجازة</span><span className="text-green-600 font-bold">+{payslipData.leave_salary.toFixed(3)}</span></div>}
                    {payslipData.ticket_payment > 0 && <div className="flex justify-between"><span>{t("ticket_payment")} / تذكرة السفر</span><span className="text-green-600 font-bold">+{payslipData.ticket_payment.toFixed(3)}</span></div>}
                    {payslipData.housing_allowance > 0 && <div className="flex justify-between"><span>{t("housing_allowance")} / بدل سكن</span><span className="text-green-600 font-bold">+{payslipData.housing_allowance.toFixed(3)}</span></div>}
                    {payslipData.transport_allowance > 0 && <div className="flex justify-between"><span>{t("transport_allowance")} / بدل نقل</span><span className="text-green-600 font-bold">+{payslipData.transport_allowance.toFixed(3)}</span></div>}
                    <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>{t("total_allowances")} / إجمالي المستحقات</span><span className="text-green-700">KD {((payslipData.allowances || 0) + (payslipData.overtime || 0) + (payslipData.bonus || 0) + (payslipData.incentive || 0) + (payslipData.leave_salary || 0) + (payslipData.ticket_payment || 0)).toFixed(3)}</span></div>
                  </div>
                </div>

                {/* Deductions */}
                <div className="border rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-sm mb-2 text-red-700">{t("deductions_label")} / الخصومات</h4>
                  <div className="space-y-1 text-xs">
                    {payslipData.loan_deduction > 0 && <div className="flex justify-between"><span>{t("loan_deduction")} / خصم القرض</span><span className="text-red-600 font-bold">-{payslipData.loan_deduction.toFixed(3)}</span></div>}
                    {payslipData.penalty > 0 && <div className="flex justify-between"><span>{t("penalty")} / غرامة</span><span className="text-red-600 font-bold">-{payslipData.penalty.toFixed(3)}</span></div>}
                    {payslipData.absence_deduction > 0 && <div className="flex justify-between"><span>{t("absence")} / غياب</span><span className="text-red-600 font-bold">-{payslipData.absence_deduction.toFixed(3)}</span></div>}
                    {payslipData.late_deduction > 0 && <div className="flex justify-between"><span>{t("late")} / تأخير</span><span className="text-red-600 font-bold">-{payslipData.late_deduction.toFixed(3)}</span></div>}
                    {payslipData.other_deduction > 0 && <div className="flex justify-between"><span>{t("other_deduction")} / خصومات أخرى</span><span className="text-red-600 font-bold">-{payslipData.other_deduction.toFixed(3)}</span></div>}
                    <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>{t("total_deductions")} / إجمالي الخصومات</span><span className="text-red-700">KD {payslipData.deductions?.toFixed(3)}</span></div>
                  </div>
                </div>

                {/* Net Salary */}
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 text-center">
                  <p className="text-sm text-green-700 font-medium">{t("net_salary")} / صافي الراتب</p>
                  <p className="text-2xl font-bold text-green-800">KD {payslipData.net_salary?.toFixed(3)}</p>
                  <p className="text-xs text-gray-500 mt-1">{t("payment_method")}: {payslipData.payment_method === "bank_transfer" ? t("bank_transfer") + " / تحويل بنكي" : t("cash") + " / نقداً"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Staff Transfers Tab */}
      {tab === "transfers" && (
        <div>
          <button onClick={() => setShowTransferForm(!showTransferForm)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm mb-4">
            {showTransferForm ? t("cancel") : (isManager ? t("new_transfer") : t("request_transfer"))}
          </button>

          {showTransferForm && (
            <form onSubmit={handleTransferSubmit} className="bg-white p-6 rounded-xl shadow-sm border mb-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("employee")}</label>
                  <select name="employee_id" required className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">{t("select_employee")}</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name_ar || e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("from_branch")}</label>
                  <select name="from_branch_id" required className="w-full px-3 py-2 border rounded-lg text-sm">
                    {allBranches.map(b => <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name) : b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("transfer_date")}</label>
                  <input type="date" name="transfer_date" required className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("to_brand")}</label>
                  <select className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={transferToBrandId || ""}
                    onChange={e => setTransferToBrandId(e.target.value ? parseInt(e.target.value) : null)}>
                    <option value="">{t("all_brands")}</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name_en) : b.name_en}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("to_branch")}</label>
                  <select name="to_branch_id" required className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">{t("select_branch")}</option>
                    {toBranches.map(b => <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name) : b.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("notes")}</label>
                <textarea name="notes" className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
              </div>
              <button type="submit"
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
                {t("submit_transfer")}
              </button>
            </form>
          )}

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">{t("staff_no")}</th>
                  <th className="px-4 py-3 text-left">{t("employee")}</th>
                  <th className="px-4 py-3 text-left">{t("from_branch")}</th>
                  <th className="px-4 py-3 text-left">{t("to_branch")}</th>
                  <th className="px-4 py-3 text-left">{t("transfer_date")}</th>
                  <th className="px-4 py-3 text-left">{t("status")}</th>
                  {isManager && <th className="px-4 py-3 text-center">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr><td colSpan={isManager ? 7 : 6} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : transfers.filter(inEmpBranchFilter).map(tr => (
                  <tr key={tr.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{empStaffNo(tr.employee_id) || "—"}</td>
                    <td className="px-4 py-3">{empName(tr.employee_id)}</td>
                    <td className="px-4 py-3">{branchName(tr.from_branch_id)}</td>
                    <td className="px-4 py-3">{branchName(tr.to_branch_id)}</td>
                    <td className="px-4 py-3">{tr.transfer_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        tr.status === "approved" ? "bg-green-100 text-green-700"
                        : tr.status === "rejected" ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                      }`}>{t(tr.status)}</span>
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 text-center">
                        {tr.status === "pending" && (
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => handleTransferAction(tr.id, "approve")}
                              className="text-green-600 hover:underline text-xs">{t("approve")}</button>
                            <button onClick={() => handleTransferAction(tr.id, "reject")}
                              className="text-red-600 hover:underline text-xs">{t("reject")}</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advance / Loan Tab */}
      {tab === "loans" && (
        <div>
          {isManager && (
            <button onClick={() => { setShowLoanForm(!showLoanForm); setEditingLoan(null); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm mb-4">
              {showLoanForm ? t("cancel") : t("add_new")}
            </button>
          )}

          {showLoanForm && (
            <form onSubmit={handleLoanSubmit} className="bg-white p-6 rounded-xl shadow-sm border mb-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("employee")}</label>
                  <select name="employee_id" required defaultValue={editingLoan?.employee_id || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">{t("select_employee")}</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name_ar || e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("loan_type_label")}</label>
                  <select name="loan_type" defaultValue={editingLoan?.loan_type || "advance"} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="advance">{t("advance")}</option>
                    <option value="loan">{t("loan_label")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("amount")}</label>
                  <input type="number" step="0.001" name="amount" required defaultValue={editingLoan?.amount || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                {editingLoan && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("balance")}</label>
                    <input type="number" step="0.001" name="balance" required defaultValue={editingLoan.balance} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t("date")}</label>
                  <input type="date" name="loan_date" required defaultValue={editingLoan?.date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                {editingLoan && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("status")}</label>
                    <select name="status" defaultValue={editingLoan.status} className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="active">{t("active")}</option>
                      <option value="paid_off">{t("paid_off")}</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("notes")}</label>
                <textarea name="notes" defaultValue={editingLoan?.notes || ""} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
              </div>
              <button type="submit"
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
                {editingLoan ? t("update") : t("save")}
              </button>
            </form>
          )}

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">{t("staff_no")}</th>
                  <th className="px-4 py-3 text-left">{t("employee")}</th>
                  <th className="px-4 py-3 text-left">{t("loan_type_label")}</th>
                  <th className="px-4 py-3 text-right">{t("amount")}</th>
                  <th className="px-4 py-3 text-right">{t("paid")}</th>
                  <th className="px-4 py-3 text-right">{t("balance")}</th>
                  <th className="px-4 py-3 text-left">{t("date")}</th>
                  <th className="px-4 py-3 text-left">{t("status")}</th>
                  <th className="px-4 py-3 text-left">{t("approval")}</th>
                  {isManager && <th className="px-4 py-3">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : loans.filter(inEmpBranchFilter).map(l => {
                  const paid = Math.max(0, l.amount - l.balance);
                  return (
                  <tr key={l.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{empStaffNo(l.employee_id) || "—"}</td>
                    <td className="px-4 py-3">{empName(l.employee_id)}</td>
                    <td className="px-4 py-3">{t(l.loan_type === "loan" ? "loan_label" : "advance")}</td>
                    <td className="px-4 py-3 text-right font-mono">KD {l.amount.toFixed(3)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{paid > 0 ? `KD ${paid.toFixed(3)}` : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{l.balance > 0 ? `KD ${l.balance.toFixed(3)}` : "—"}</td>
                    <td className="px-4 py-3">{l.date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        l.status === "paid_off" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>{l.status === "paid_off" ? t("paid_off") : t("active")}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ApprovalBadge status={l.approval_status} type="advance_loan" id={l.id} />
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                        {l.balance > 0 && (
                          <button onClick={() => setPayingLoan(l)}
                            className="text-emerald-600 hover:underline text-xs font-medium">{t("record_payment")}</button>
                        )}
                        <button onClick={() => { setEditingLoan(l); setShowLoanForm(true); }}
                          className="text-blue-600 hover:underline text-xs">{t("edit")}</button>
                        <button onClick={() => handleDeleteLoan(l.id)}
                          className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Transaction statement — pick any staff with advances/loans */}
          <div className="bg-white rounded-xl shadow-sm border mt-6 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <label className="text-sm font-semibold">{t("loan_statement")}</label>
              <select value={statementEmpId}
                onChange={e => { setStatementEmpId(e.target.value); loadStatement(e.target.value); }}
                className="px-3 py-2 border rounded-lg text-sm sm:w-80">
                <option value="">{t("select_employee")}</option>
                {Array.from(new Set(loans.map(l => l.employee_id))).map(eid => (
                  <option key={eid} value={eid}>{empStaffNo(eid) ? `${empStaffNo(eid)} — ` : ""}{empName(eid)}</option>
                ))}
              </select>
            </div>

            {statement && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{t("total_taken")}</div>
                    <div className="font-mono font-bold">KD {statement.totals.total_taken.toFixed(3)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{t("total_repaid")}</div>
                    <div className="font-mono font-bold text-green-700">KD {statement.totals.total_repaid.toFixed(3)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{t("outstanding")}</div>
                    <div className="font-mono font-bold text-amber-700">KD {statement.totals.outstanding.toFixed(3)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{t("advance_loan")}</div>
                    <div className="font-mono font-bold">{statement.totals.loan_count}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">{t("date")}</th>
                        <th className="px-3 py-2 text-left">{t("type")}</th>
                        <th className="px-3 py-2 text-right">{t("amount")}</th>
                        <th className="px-3 py-2 text-right">{t("balance")}</th>
                        <th className="px-3 py-2 text-left">{t("notes")}</th>
                        {isManager && <th className="px-3 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {statement.transactions.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">{t("no_data")}</td></tr>
                      ) : statement.transactions.map((tx, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2">{tx.date}</td>
                          <td className="px-3 py-2">
                            {tx.kind === "repayment" ? (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">{t("repayment")}</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                {t(tx.type === "loan" ? "loan_label" : "advance")}
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${tx.kind === "repayment" ? "text-green-700" : "text-blue-700"}`}>
                            {tx.kind === "repayment" ? "-" : "+"}KD {tx.amount.toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">KD {tx.running_balance.toFixed(3)}</td>
                          <td className="px-3 py-2 text-gray-600">{tx.notes || "—"}</td>
                          {isManager && (
                            <td className="px-3 py-2 text-right">
                              {tx.kind === "repayment" && (
                                <button onClick={() => handleDeleteRepayment(tx.id)}
                                  className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {payingLoan && (
            <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
              <form onSubmit={handleRepaymentSubmit} className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto my-auto">
                <h3 className="font-semibold">{t("record_payment")} — {empName(payingLoan.employee_id)}</h3>
                <div className="text-xs text-gray-500">
                  {t("balance")}: <span className="font-mono font-bold">KD {payingLoan.balance.toFixed(3)}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("amount")}</label>
                  <input type="number" step="0.001" min="0.001" max={payingLoan.balance} name="amount" required
                    defaultValue={payingLoan.balance}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("date")}</label>
                  <input type="date" name="repayment_date" required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("payroll_month")}</label>
                  <input type="month" name="month" defaultValue={new Date().toISOString().slice(0, 7)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                  <p className="text-xs text-gray-500 mt-1">{t("payroll_month_hint")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("notes")}</label>
                  <input name="notes" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setPayingLoan(null)}
                    className="px-4 py-2 bg-gray-200 rounded-lg text-sm">{t("cancel")}</button>
                  <button type="submit"
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">{t("save")}</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Benefits Tab (Incentive, Bonus, Leave Salary, Ticket) */}
      {tab === "benefits" && (
        <div>
          <button onClick={() => { setShowBenefitForm(!showBenefitForm); setEditingBenefit(null); setBenefitFreq("one_time"); }}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm mb-4">
            {showBenefitForm ? t("cancel") : (isManager ? t("add_new") : t("request_new"))}
          </button>

          {showBenefitForm && (
            <form onSubmit={handleBenefitSubmit} className="bg-white p-6 rounded-xl shadow-sm border mb-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("employee")}</label>
                  <select name="employee_id" required defaultValue={editingBenefit?.employee_id || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">{t("select_employee")}</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name_ar || e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("category")}</label>
                  <select name="category" required defaultValue={editingBenefit?.category || "incentive"} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="incentive">{t("incentive_label")}</option>
                    <option value="bonus">{t("bonus_label")}</option>
                    <option value="leave_salary">{t("leave_salary_label")}</option>
                    <option value="ticket">{t("ticket_payment_label")}</option>
                    <option value="other_benefit">{t("other_benefit")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("amount")}</label>
                  <input type="number" step="0.001" name="amount" required defaultValue={editingBenefit?.amount || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("frequency")}</label>
                  <select name="frequency" value={benefitFreq} onChange={e => setBenefitFreq(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="one_time">{t("one_time")}</option>
                    <option value="monthly">{t("monthly_recurring")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("date")}</label>
                  <input type="date" name="bd_date" required defaultValue={editingBenefit?.date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{benefitFreq === "monthly" ? t("start_month") : t("salary_month")}</label>
                  <input type="month" name="month" defaultValue={editingBenefit?.month || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                {benefitFreq === "monthly" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("end_month")} ({t("optional")})</label>
                    <input type="month" name="end_month" defaultValue={editingBenefit?.end_month || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                    <p className="text-xs text-gray-400 mt-1">{t("end_month_hint")}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("notes")}</label>
                <textarea name="notes" defaultValue={editingBenefit?.notes || ""} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
              </div>
              <button type="submit"
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
                {editingBenefit ? t("update") : t("save")}
              </button>
            </form>
          )}

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">{t("staff_no")}</th>
                  <th className="px-4 py-3 text-left">{t("employee")}</th>
                  <th className="px-4 py-3 text-left">{t("category")}</th>
                  <th className="px-4 py-3 text-right">{t("amount")}</th>
                  <th className="px-4 py-3 text-left">{t("frequency")}</th>
                  <th className="px-4 py-3 text-left">{t("salary_month")}</th>
                  <th className="px-4 py-3 text-left">{t("notes")}</th>
                  <th className="px-4 py-3 text-left">{t("approval")}</th>
                  {isManager && <th className="px-4 py-3">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {benefits.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : benefits.filter(inEmpBranchFilter).map(b => (
                  <tr key={b.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{empStaffNo(b.employee_id) || "—"}</td>
                    <td className="px-4 py-3">{empName(b.employee_id)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        {t(b.category + "_label") || b.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">KD {b.amount.toFixed(3)}</td>
                    <td className="px-4 py-3">
                      {b.frequency === "monthly" ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          {t("monthly_recurring")}{b.end_month ? ` → ${b.end_month}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">{t("one_time")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{b.month || "—"}{b.frequency === "monthly" && b.month ? "+" : ""}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{b.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <ApprovalBadge status={b.approval_status} type="benefit_deduction" id={b.id} />
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 space-x-2">
                        <button onClick={() => { setEditingBenefit(b); setBenefitFreq(b.frequency || "one_time"); setShowBenefitForm(true); }}
                          className="text-blue-600 hover:underline text-xs">{t("edit")}</button>
                        <button onClick={() => handleDeleteBenefit(b.id)}
                          className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deductions Tab (Fine, Penalty) */}
      {tab === "deductions" && (
        <div>
          {isManager && (
            <button onClick={() => { setShowDeductionForm(!showDeductionForm); setEditingDeduction(null); setDedSelectedEmpId(null); setDedDays(0); setDedAmount(0); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm mb-4">
              {showDeductionForm ? t("cancel") : t("add_new")}
            </button>
          )}

          {showDeductionForm && (() => {
            const dedEmp = employees.find(e => e.id === dedSelectedEmpId);
            const dedSalary = dedEmp?.actual_salary || 0;
            const dedDailyRate = dedSalary / 30;
            return (
            <form onSubmit={handleDeductionSubmit} className="bg-white p-6 rounded-xl shadow-sm border mb-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("employee")}</label>
                  <select name="employee_id" required defaultValue={editingDeduction?.employee_id || ""}
                    onChange={(e) => {
                      const empId = Number(e.target.value);
                      setDedSelectedEmpId(empId || null);
                      setDedDays(0);
                      setDedAmount(0);
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">{t("select_employee")}</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name_ar || e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("category")}</label>
                  <select name="category" required defaultValue={editingDeduction?.category || "fine"} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="fine">{t("fine_label")}</option>
                    <option value="penalty">{t("penalty_label")}</option>
                    <option value="other_deduction">{t("other_deduction")}</option>
                  </select>
                </div>
                {dedSelectedEmpId && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("salary")}</label>
                    <input type="text" readOnly value={`KD ${dedSalary.toFixed(3)}`}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100 font-mono" />
                    <span className="text-xs text-gray-500">{t("daily_rate")}: KD {dedDailyRate.toFixed(3)}</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t("days")}</label>
                  <input type="number" min="0" max="30" step="1" value={dedDays}
                    onChange={(e) => {
                      const d = Number(e.target.value) || 0;
                      setDedDays(d);
                      setDedAmount(Number((dedDailyRate * d).toFixed(3)));
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                  <span className="text-xs text-gray-500">{t("salary")} / 30 × {t("days")}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("amount")}</label>
                  <input type="number" step="0.001" name="amount" required value={dedAmount}
                    onChange={(e) => setDedAmount(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("date")}</label>
                  <input type="date" name="bd_date" required defaultValue={editingDeduction?.date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("salary_month")}</label>
                  <input type="month" name="month" defaultValue={editingDeduction?.month || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("notes")}</label>
                <textarea name="notes" defaultValue={editingDeduction?.notes || ""} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
              </div>
              <button type="submit"
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
                {editingDeduction ? t("update") : t("save")}
              </button>
            </form>
            );
          })()}

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">{t("staff_no")}</th>
                  <th className="px-4 py-3 text-left">{t("employee")}</th>
                  <th className="px-4 py-3 text-left">{t("category")}</th>
                  <th className="px-4 py-3 text-right">{t("amount")}</th>
                  <th className="px-4 py-3 text-left">{t("date")}</th>
                  <th className="px-4 py-3 text-left">{t("salary_month")}</th>
                  <th className="px-4 py-3 text-left">{t("notes")}</th>
                  <th className="px-4 py-3 text-left">{t("approval")}</th>
                  {isManager && <th className="px-4 py-3">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {deductionItems.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : deductionItems.filter(inEmpBranchFilter).map(d => (
                  <tr key={d.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{empStaffNo(d.employee_id) || "—"}</td>
                    <td className="px-4 py-3">{empName(d.employee_id)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        {t(d.category + "_label") || d.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">KD {d.amount.toFixed(3)}</td>
                    <td className="px-4 py-3">{d.date}</td>
                    <td className="px-4 py-3">{d.month || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{d.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <ApprovalBadge status={d.approval_status} type="benefit_deduction" id={d.id} />
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 space-x-2">
                        <button onClick={() => { setEditingDeduction(d); setShowDeductionForm(true); setDedSelectedEmpId(d.employee_id); setDedAmount(d.amount); setDedDays(0); }}
                          className="text-blue-600 hover:underline text-xs">{t("edit")}</button>
                        <button onClick={() => handleDeleteDeduction(d.id)}
                          className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave / Absence Tab */}
      {tab === "leaves" && (
        <div>
          <button onClick={() => { setShowLeaveForm(!showLeaveForm); setEditingLeave(null); }}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm mb-4">
            {showLeaveForm ? t("cancel") : (isManager ? t("add_leave") : t("request_leave"))}
          </button>

          {showLeaveForm && (
            <form className="bg-white rounded-xl shadow p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!window.confirm(t("confirm_transaction"))) return;
                const fd = new FormData(e.currentTarget);
                if (editingLeave) {
                  await apiFetch(`/api/hr/leaves/${editingLeave.id}`, { method: "PUT", body: fd });
                  setEditingLeave(null);
                } else {
                  await apiPost("/api/hr/leaves", fd);
                }
                setShowLeaveForm(false);
                apiGet("/api/hr/leaves").then(setLeaveRecords);
              }}>
              <div>
                <label className="block text-xs mb-1">{t("employee")}</label>
                <select name="employee_id" required defaultValue={editingLeave?.employee_id || ""} className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">{t("select")}</option>
                  {employees.map(em => (
                    <option key={em.id} value={em.id}>{em.name_ar || em.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1">{t("leave_type")}</label>
                <select name="leave_type" required defaultValue={editingLeave?.leave_type || "absent"} className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="absent">{t("absent")}</option>
                  <option value="annual_leave">{t("annual_leave")}</option>
                  <option value="sick_leave">{t("sick_leave")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1">{t("start_date")}</label>
                <input type="date" name="start_date" required defaultValue={editingLeave?.start_date || ""} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs mb-1">{t("end_date")}</label>
                <input type="date" name="end_date" required defaultValue={editingLeave?.end_date || ""} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs mb-1">{t("salary_month")}</label>
                <input type="month" name="month" defaultValue={editingLeave?.month || ""} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" name="is_paid" id="is_paid_check" value="true" defaultChecked={editingLeave?.is_paid || false} className="rounded" />
                <label htmlFor="is_paid_check" className="text-sm">{t("paid_leave")}</label>
              </div>
              <div className="col-span-full">
                <label className="block text-xs mb-1">{t("notes")}</label>
                <input type="text" name="notes" defaultValue={editingLeave?.notes || ""} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  {editingLeave ? t("update") : t("save")}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">{t("staff_no")}</th>
                  <th className="px-4 py-3 text-left">{t("name")}</th>
                  <th className="px-4 py-3 text-left">{t("leave_type")}</th>
                  <th className="px-4 py-3 text-left">{t("start_date")}</th>
                  <th className="px-4 py-3 text-left">{t("end_date")}</th>
                  <th className="px-4 py-3 text-right">{t("days")}</th>
                  <th className="px-4 py-3 text-left">{t("paid_unpaid")}</th>
                  <th className="px-4 py-3 text-left">{t("salary_month")}</th>
                  <th className="px-4 py-3 text-left">{t("notes")}</th>
                  <th className="px-4 py-3 text-left">{t("approval")}</th>
                  {isManager && <th className="px-4 py-3">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {leaveRecords.filter(inEmpBranchFilter).map(lr => {
                  const empStaff = employees.find(e => e.id === lr.employee_id);
                  const leaveLabel = lr.leave_type === "annual_leave" ? t("annual_leave")
                    : lr.leave_type === "sick_leave" ? t("sick_leave") : t("absent");
                  const typeColor = lr.leave_type === "sick_leave" ? "bg-orange-100 text-orange-700"
                    : lr.leave_type === "annual_leave" ? "bg-blue-100 text-blue-700"
                    : "bg-red-100 text-red-700";
                  return (
                    <tr key={lr.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">{empStaff?.staff_no || "—"}</td>
                      <td className="px-4 py-3" dir="rtl">{empStaff?.name_ar || empStaff?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor}`}>{leaveLabel}</span>
                      </td>
                      <td className="px-4 py-3">{lr.start_date}</td>
                      <td className="px-4 py-3">{lr.end_date}</td>
                      <td className="px-4 py-3 text-right font-mono">{lr.days}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${lr.is_paid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {lr.is_paid ? t("paid") : t("unpaid")}
                        </span>
                      </td>
                      <td className="px-4 py-3">{lr.month || "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{lr.notes || "—"}</td>
                      <td className="px-4 py-3">
                        <ApprovalBadge status={lr.approval_status} type="leave" id={lr.id} />
                      </td>
                      {isManager && (
                        <td className="px-4 py-3 space-x-2">
                          <button onClick={() => { setEditingLeave(lr); setShowLeaveForm(true); }}
                            className="text-blue-600 hover:underline text-xs">{t("edit")}</button>
                          <button onClick={async () => {
                            if (!confirm(t("confirm_delete"))) return;
                            await apiFetch(`/api/hr/leaves/${lr.id}`, { method: "DELETE" });
                            apiGet("/api/hr/leaves").then(setLeaveRecords);
                          }} className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


    </div>
  );
}
