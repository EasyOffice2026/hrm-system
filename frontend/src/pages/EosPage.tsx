import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiFetch } from "../contexts/api";
import { useAuth } from "../contexts/AuthContext";

interface Employee { id: number; name: string; name_ar: string; branch_id: number; staff_no: string; join_date: string | null; }
interface Branch { id: number; name: string; name_ar: string; }

interface EosForm {
  employee_id: string;
  join_date: string;
  last_working_date: string;
  termination_type: string;
  contract_type: string;
  pay_basis: string;
  is_kuwaiti: boolean;
  monthly_wage: string;
  days_divisor: string;
  unpaid_leave_days: string;
  leave_balance_days: string;
  notice_days_due: string;
  notice_days_short: string;
  pending_salary: string;
  other_earnings: string;
  ticket_amount: string;
  loan_balance: string;
  pifss_adjustment: string;
  other_deductions: string;
  notes: string;
}

interface EosCalc {
  service_days: number; service_years: number; daily_rate: number;
  gratuity_first5_days: number; gratuity_after5_days: number; gratuity_gross: number;
  entitlement_fraction: number; entitlement_rule: string; gratuity_capped: boolean; cap_amount: number;
  gratuity_amount: number; leave_encashment: number; notice_pay: number; notice_deduction: number;
  total_earnings: number; total_deductions: number; net_settlement: number;
}

interface Settlement extends EosCalc {
  id: number; ref_no: string; employee_id: number; employee_name: string; employee_name_ar: string;
  staff_no: string; branch_id: number; branch_name: string; branch_name_ar: string;
  join_date: string; last_working_date: string; termination_type: string; contract_type: string;
  pay_basis: string; is_kuwaiti: boolean; monthly_wage: number; days_divisor: number;
  unpaid_leave_days: number; leave_balance_days: number; notice_days_due: number;
  pending_salary: number; other_earnings: number; ticket_amount: number; loan_balance: number;
  pifss_adjustment: number; other_deductions: number; status: string; paid_date: string | null;
  payment_method: string | null; notes: string | null;
}

const TERMINATION_TYPES = ["resignation", "termination", "contract_expiry", "retirement", "death", "disability", "art48_resignation", "art41_dismissal"];

const emptyForm = (): EosForm => ({
  employee_id: "", join_date: "", last_working_date: new Date().toISOString().split("T")[0],
  termination_type: "resignation", contract_type: "indefinite", pay_basis: "monthly", is_kuwaiti: false,
  monthly_wage: "", days_divisor: "26", unpaid_leave_days: "0", leave_balance_days: "", notice_days_due: "0",
  notice_days_short: "0", pending_salary: "0", other_earnings: "0", ticket_amount: "0", loan_balance: "",
  pifss_adjustment: "0", other_deductions: "0", notes: "",
});

const num = (v: string) => (v === "" ? null : Number(v));

export default function EosPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isAr = i18n.language === "ar";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Settlement | null>(null);
  const [form, setForm] = useState<EosForm>(emptyForm());
  const [calc, setCalc] = useState<EosCalc | null>(null);
  const [viewing, setViewing] = useState<Settlement | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const canEdit = ["owner", "manager", "accountant", "personnel_manager"].includes(user?.role || "");

  const load = useCallback(() => apiGet(`/api/eos/${statusFilter ? `?status=${statusFilter}` : ""}`).then(setSettlements), [statusFilter]);

  useEffect(() => {
    apiGet("/api/hr/employees?include_left=true").then((d: Employee[]) => setEmployees(Array.isArray(d) ? d : []));
    apiGet("/api/branches/").then((d: Branch[]) => setBranches(Array.isArray(d) ? d : []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const empName = (e?: { name: string; name_ar?: string }) => e ? (isAr && e.name_ar ? e.name_ar : e.name) : "";
  const branchName = (id: number) => { const b = branches.find(x => x.id === id); return b ? (isAr && b.name_ar ? b.name_ar : b.name) : ""; };
  const kd = (v: number | null | undefined) => `KD ${Number(v || 0).toFixed(3)}`;

  const set = (k: keyof EosForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const loadDefaults = async (employeeId: string, lastWorking: string) => {
    if (!employeeId) return;
    const d = await apiGet(`/api/eos/defaults/${employeeId}?last_working_date=${lastWorking}`);
    if (d && !d.detail) {
      setForm(f => ({
        ...f,
        join_date: d.join_date || f.join_date,
        monthly_wage: d.monthly_wage != null ? String(d.monthly_wage) : f.monthly_wage,
        loan_balance: d.loan_balance != null ? String(d.loan_balance) : f.loan_balance,
        leave_balance_days: d.leave_balance_days != null ? String(d.leave_balance_days) : f.leave_balance_days,
      }));
    }
  };

  const payload = () => ({
    employee_id: Number(form.employee_id),
    join_date: form.join_date || null,
    last_working_date: form.last_working_date,
    termination_type: form.termination_type,
    contract_type: form.contract_type,
    pay_basis: form.pay_basis,
    is_kuwaiti: form.is_kuwaiti,
    monthly_wage: num(form.monthly_wage),
    days_divisor: Number(form.days_divisor) || 26,
    unpaid_leave_days: Number(form.unpaid_leave_days) || 0,
    leave_balance_days: num(form.leave_balance_days),
    notice_days_due: Number(form.notice_days_due) || 0,
    notice_days_short: Number(form.notice_days_short) || 0,
    pending_salary: Number(form.pending_salary) || 0,
    other_earnings: Number(form.other_earnings) || 0,
    ticket_amount: Number(form.ticket_amount) || 0,
    loan_balance: num(form.loan_balance),
    pifss_adjustment: Number(form.pifss_adjustment) || 0,
    other_deductions: Number(form.other_deductions) || 0,
    notes: form.notes || null,
  });

  const jsonReq = (path: string, method: string, body?: unknown) =>
    apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  const doCalc = async () => {
    if (!form.employee_id) { setMsg(t("select_employee")); return; }
    setBusy(true);
    const res = await jsonReq("/api/eos/calculate", "POST", payload());
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(d.detail || "Error"); setCalc(null); return; }
    setMsg(""); setCalc(d);
  };

  const doSave = async () => {
    if (!form.employee_id) { setMsg(t("select_employee")); return; }
    setBusy(true);
    const res = editing
      ? await jsonReq(`/api/eos/${editing.id}`, "PUT", payload())
      : await jsonReq("/api/eos/", "POST", payload());
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(d.detail || "Error"); return; }
    setShowForm(false); setEditing(null); setForm(emptyForm()); setCalc(null); setMsg("");
    load();
  };

  const action = async (s: Settlement, act: "approve" | "pay" | "cancel" | "delete") => {
    if (!window.confirm(t(act === "delete" ? "confirm_delete" : "confirm_transaction"))) return;
    const res = act === "delete"
      ? await apiFetch(`/api/eos/${s.id}`, { method: "DELETE" })
      : await jsonReq(`/api/eos/${s.id}/${act}`, "POST");
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || "Error"); return; }
    setViewing(null);
    load();
  };

  const startEdit = (s: Settlement) => {
    setEditing(s);
    setForm({
      employee_id: String(s.employee_id), join_date: s.join_date || "", last_working_date: s.last_working_date,
      termination_type: s.termination_type, contract_type: s.contract_type, pay_basis: s.pay_basis,
      is_kuwaiti: !!s.is_kuwaiti, monthly_wage: String(s.monthly_wage), days_divisor: String(s.days_divisor || 26),
      unpaid_leave_days: String(s.unpaid_leave_days || 0), leave_balance_days: String(s.leave_balance_days ?? ""),
      notice_days_due: String(s.notice_days_due || 0), notice_days_short: "0",
      pending_salary: String(s.pending_salary || 0), other_earnings: String(s.other_earnings || 0),
      ticket_amount: String(s.ticket_amount || 0), loan_balance: String(s.loan_balance ?? ""),
      pifss_adjustment: String(s.pifss_adjustment || 0), other_deductions: String(s.other_deductions || 0),
      notes: s.notes || "",
    });
    setCalc(s); setViewing(null); setShowForm(true);
  };

  const statusBadge = (s: string) => {
    const c = s === "paid" ? "bg-green-100 text-green-700" : s === "approved" ? "bg-blue-100 text-blue-700"
      : s === "cancelled" ? "bg-gray-200 text-gray-600" : "bg-amber-100 text-amber-700";
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c}`}>{t(`eos_status_${s}`)}</span>;
  };

  const field = (label: string, k: keyof EosForm, type = "number", extra: Record<string, unknown> = {}) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} step={type === "number" ? "0.001" : undefined} value={form[k] as string}
        onChange={e => set(k, e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" {...extra} />
    </div>
  );

  const breakdown = (c: EosCalc) => (
    <div className="bg-slate-50 border rounded-lg p-4 text-sm space-y-1">
      <h4 className="font-semibold mb-2">{t("eos_breakdown")}</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <span>{t("service_period")}</span><span className="text-right font-mono">{c.service_years.toFixed(2)} {t("years")} ({c.service_days} {t("days")})</span>
        <span>{t("daily_rate")}</span><span className="text-right font-mono">{kd(c.daily_rate)}</span>
        <span>{t("gratuity_days_first5")}</span><span className="text-right font-mono">{c.gratuity_first5_days.toFixed(2)}</span>
        <span>{t("gratuity_days_after5")}</span><span className="text-right font-mono">{c.gratuity_after5_days.toFixed(2)}</span>
        <span>{t("gratuity_gross")}{c.gratuity_capped ? ` (${t("capped_at")} ${kd(c.cap_amount)})` : ""}</span><span className="text-right font-mono">{kd(c.gratuity_gross)}</span>
        <span>{t("entitlement")} — {t(`eos_rule_${c.entitlement_rule}`)}</span><span className="text-right font-mono">{(c.entitlement_fraction * 100).toFixed(1)}%</span>
        <span className="font-semibold">{t("gratuity_amount")}</span><span className="text-right font-mono font-semibold">{kd(c.gratuity_amount)}</span>
        <span>{t("leave_encashment")}</span><span className="text-right font-mono">{kd(c.leave_encashment)}</span>
        <span>{t("notice_pay")}</span><span className="text-right font-mono">{kd(c.notice_pay)}</span>
        <span className="font-semibold text-green-700">{t("total_earnings")}</span><span className="text-right font-mono font-semibold text-green-700">{kd(c.total_earnings)}</span>
        <span>{t("notice_deduction")}</span><span className="text-right font-mono">{kd(c.notice_deduction)}</span>
        <span className="font-semibold text-red-700">{t("total_deductions")}</span><span className="text-right font-mono font-semibold text-red-700">{kd(c.total_deductions)}</span>
      </div>
      <div className="flex justify-between border-t mt-2 pt-2 text-base font-bold">
        <span>{t("net_settlement")}</span><span className="font-mono text-blue-700">{kd(c.net_settlement)}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{t("eos")}</h2>
          <p className="text-xs text-gray-500">{t("eos_law_note")}</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">{t("all")}</option>
            {["draft", "approved", "paid", "cancelled"].map(s => <option key={s} value={s}>{t(`eos_status_${s}`)}</option>)}
          </select>
          {canEdit && (
            <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm(emptyForm()); setCalc(null); setMsg(""); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
              {showForm ? t("cancel") : t("new_settlement")}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6 space-y-4">
          <h3 className="font-semibold">{editing ? `${t("edit")} ${editing.ref_no}` : t("new_settlement")}</h3>
          {msg && <div className="p-2 bg-red-50 text-red-700 text-sm rounded">{msg}</div>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">{t("employee")}</label>
              <select value={form.employee_id} disabled={!!editing}
                onChange={e => { set("employee_id", e.target.value); loadDefaults(e.target.value, form.last_working_date); }}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">-- {t("select_employee")} --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.staff_no ? `${e.staff_no} - ` : ""}{empName(e)} ({branchName(e.branch_id)})</option>)}
              </select>
            </div>
            {field(t("join_date"), "join_date", "date")}
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("last_working_date")}</label>
              <input type="date" value={form.last_working_date}
                onChange={e => { set("last_working_date", e.target.value); loadDefaults(form.employee_id, e.target.value); }}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("termination_type")}</label>
              <select value={form.termination_type} onChange={e => set("termination_type", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                {TERMINATION_TYPES.map(x => <option key={x} value={x}>{t(`term_${x}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("contract_type")}</label>
              <select value={form.contract_type} onChange={e => set("contract_type", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="indefinite">{t("contract_indefinite")}</option>
                <option value="fixed">{t("contract_fixed")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("pay_basis")}</label>
              <select value={form.pay_basis} onChange={e => set("pay_basis", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="monthly">{t("pay_monthly")}</option>
                <option value="daily">{t("pay_daily")}</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_kuwaiti} onChange={e => set("is_kuwaiti", e.target.checked)} />
                {t("is_kuwaiti")}
              </label>
            </div>
            {field(t("monthly_wage"), "monthly_wage")}
            {field(t("days_divisor"), "days_divisor", "number", { step: "1" })}
            {field(t("unpaid_leave_days"), "unpaid_leave_days", "number", { step: "1" })}
            {field(t("leave_balance_days"), "leave_balance_days")}
            {field(t("notice_days_due"), "notice_days_due", "number", { step: "1" })}
            {field(t("notice_days_short"), "notice_days_short", "number", { step: "1" })}
            {field(t("pending_salary"), "pending_salary")}
            {field(t("other_earnings"), "other_earnings")}
            {field(t("ticket_amount"), "ticket_amount")}
            {field(t("loan_balance"), "loan_balance")}
            {form.is_kuwaiti && field(t("pifss_adjustment"), "pifss_adjustment")}
            {field(t("other_deductions"), "other_deductions")}
            <div className="col-span-2 md:col-span-4">{field(t("notes"), "notes", "text")}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={doCalc} disabled={busy}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">{t("calculate")}</button>
            <button type="button" onClick={doSave} disabled={busy}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">{t("save")}</button>
          </div>
          {calc && breakdown(calc)}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-6 my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-lg">{viewing.ref_no} — {isAr && viewing.employee_name_ar ? viewing.employee_name_ar : viewing.employee_name}</h3>
                <p className="text-xs text-gray-500">{viewing.staff_no} · {isAr ? viewing.branch_name_ar || viewing.branch_name : viewing.branch_name} · {t(`term_${viewing.termination_type}`)} · {viewing.join_date} → {viewing.last_working_date}</p>
              </div>
              {statusBadge(viewing.status)}
            </div>
            {breakdown(viewing)}
            {viewing.notes && <p className="text-sm text-gray-600 mt-3">{viewing.notes}</p>}
            {canEdit && (
              <div className="flex gap-2 mt-4 flex-wrap">
                {viewing.status === "draft" && <>
                  <button onClick={() => startEdit(viewing)} className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs">{t("edit")}</button>
                  <button onClick={() => action(viewing, "approve")} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs">{t("approve")}</button>
                  <button onClick={() => action(viewing, "delete")} className="px-3 py-1.5 bg-red-500 text-white rounded text-xs">{t("delete")}</button>
                </>}
                {viewing.status === "approved" && <>
                  <button onClick={() => action(viewing, "pay")} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs">{t("mark_paid")}</button>
                  <button onClick={() => action(viewing, "cancel")} className="px-3 py-1.5 bg-gray-500 text-white rounded text-xs">{t("cancel")}</button>
                </>}
                <button onClick={() => window.print()} className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs">{t("print")}</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">{t("reference")}</th>
              <th className="px-4 py-3 text-left">{t("employee")}</th>
              <th className="px-4 py-3 text-left">{t("branch")}</th>
              <th className="px-4 py-3 text-left">{t("termination_type")}</th>
              <th className="px-4 py-3 text-left">{t("last_working_date")}</th>
              <th className="px-4 py-3 text-right">{t("service_period")}</th>
              <th className="px-4 py-3 text-right">{t("gratuity_amount")}</th>
              <th className="px-4 py-3 text-right">{t("net_settlement")}</th>
              <th className="px-4 py-3 text-left">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
            ) : settlements.map(s => (
              <tr key={s.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setViewing(s)}>
                <td className="px-4 py-3 font-mono text-xs">{s.ref_no}</td>
                <td className="px-4 py-3 font-medium">{isAr && s.employee_name_ar ? s.employee_name_ar : s.employee_name}</td>
                <td className="px-4 py-3">{isAr && s.branch_name_ar ? s.branch_name_ar : s.branch_name}</td>
                <td className="px-4 py-3">{t(`term_${s.termination_type}`)}</td>
                <td className="px-4 py-3">{s.last_working_date}</td>
                <td className="px-4 py-3 text-right font-mono">{Number(s.service_years).toFixed(2)} {t("years")}</td>
                <td className="px-4 py-3 text-right font-mono">{kd(s.gratuity_amount)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{kd(s.net_settlement)}</td>
                <td className="px-4 py-3">{statusBadge(s.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
