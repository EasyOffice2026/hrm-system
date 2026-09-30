import { useCallback, useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost, apiFetch } from "../contexts/api";
import { useAuth } from "../contexts/AuthContext";

interface Employee { id: number; name: string; name_ar: string; branch_id: number; }
interface AttRecord { id: number; employee_id: number; date: string; check_in: string; check_out: string; status: string; }
interface OtRecord {
  id: number; employee_id: number; date: string; month: string; hours: number; ot_type: string;
  rate_multiplier: number; hourly_rate: number; amount: number; notes: string; approval_status: string;
}

type Tab = "attendance" | "overtime";
const OT_TYPES = ["weekday", "night", "rest_day", "holiday"] as const;
const MANAGER_ROLES = ["owner", "manager", "accountant"];

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function AttendancePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes(user?.role || "");
  const isPersonnel = ["personnel", "personnel_manager"].includes(user?.role || "");
  const canEdit = !isPersonnel;

  const [tab, setTab] = useState<Tab>("attendance");
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [otMonth, setOtMonth] = useState(currentMonth());
  const [otEmployee, setOtEmployee] = useState("");
  const [otRecords, setOtRecords] = useState<OtRecord[]>([]);
  const [showOtForm, setShowOtForm] = useState(false);
  const [editingOt, setEditingOt] = useState<OtRecord | null>(null);

  useEffect(() => {
    apiGet("/api/hr/employees").then(setEmployees);
    apiGet("/api/hr/attendance").then(setRecords);
  }, []);

  const loadOvertime = useCallback(() => {
    const params = new URLSearchParams();
    if (otMonth) params.set("month", otMonth);
    if (otEmployee) params.set("employee_id", otEmployee);
    return apiGet(`/api/hr/overtime?${params.toString()}`).then(setOtRecords);
  }, [otMonth, otEmployee]);

  useEffect(() => { if (tab === "overtime") loadOvertime(); }, [tab, loadOvertime]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    await apiPost("/api/hr/attendance", fd);
    setShowForm(false);
    apiGet("/api/hr/attendance").then(setRecords);
  };

  const handleOtSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const otDate = String(fd.get("ot_date") || "");
    if (!fd.get("month")) fd.set("month", otDate.slice(0, 7));
    if (editingOt) {
      await apiFetch(`/api/hr/overtime/${editingOt.id}`, { method: "PUT", body: fd });
    } else {
      await apiPost("/api/hr/overtime", fd);
    }
    setShowOtForm(false);
    setEditingOt(null);
    loadOvertime();
  };

  const otAction = async (id: number, action: "approve" | "reject") => {
    await apiFetch(`/api/hr/overtime/${id}/${action}`, { method: "POST" });
    loadOvertime();
  };

  const deleteOt = async (id: number) => {
    if (!window.confirm(t("confirm_delete"))) return;
    await apiFetch(`/api/hr/overtime/${id}`, { method: "DELETE" });
    loadOvertime();
  };

  const empName = (id: number) => {
    const e = employees.find(x => x.id === id);
    if (!e) return "";
    return i18n.language === "ar" ? (e.name_ar || e.name) : e.name;
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "absent": return "bg-red-100 text-red-700";
      case "late": return "bg-yellow-100 text-yellow-700";
      case "leave": return "bg-blue-100 text-blue-700";
      case "approved": return "bg-green-100 text-green-700";
      case "rejected": return "bg-red-100 text-red-700";
      case "pending_approval": return "bg-yellow-100 text-yellow-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const otTotals = otRecords.reduce(
    (acc, r) => {
      acc.hours += r.hours;
      if (r.approval_status === "approved") acc.approved += r.amount;
      acc.amount += r.amount;
      return acc;
    },
    { hours: 0, amount: 0, approved: 0 },
  );

  const inputCls = "w-full px-3 py-2 border rounded-lg text-sm";

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-3"><div className="hidden sm:flex w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-700 items-center justify-center shrink-0"><CalendarCheck size={20} /></div><h2 className="page-title">{t("attendance")}</h2></div>
        {tab === "attendance" && canEdit && (
          <button onClick={() => setShowForm(!showForm)}
            className="btn btn-primary">
            {showForm ? t("cancel") : t("add_new")}
          </button>
        )}
        {tab === "overtime" && canEdit && (
          <button onClick={() => { setShowOtForm(!showOtForm); setEditingOt(null); }}
            className="btn btn-primary">
            {showOtForm ? t("cancel") : t("add_overtime")}
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100/80 p-1 rounded-xl w-fit flex-wrap">
        {(["attendance", "overtime"] as Tab[]).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === tb ? "bg-white shadow-sm text-emerald-700" : "text-gray-600 hover:text-gray-800"
            }`}>{t(tb === "attendance" ? "attendance" : "overtime_sheet")}</button>
        ))}
      </div>

      {tab === "attendance" && (
        <>
          {showForm && (
            <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("employees")}</label>
                  <select name="employee_id" required className={inputCls}>
                    {employees.map(e => <option key={e.id} value={e.id}>{empName(e.id)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("date")}</label>
                  <input type="date" name="att_date" required className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("check_in")}</label>
                  <input type="time" name="check_in" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("check_out")}</label>
                  <input type="time" name="check_out" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("status")}</label>
                <select name="status" className={inputCls}>
                  <option value="absent">{t("absent")}</option>
                  <option value="late">{t("late")}</option>
                  <option value="leave">{t("leave")}</option>
                </select>
              </div>
              <button type="submit"
                className="btn btn-primary">
                {t("save")}
              </button>
            </form>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="px-4 py-3 text-start">{t("date")}</th>
                  <th className="px-4 py-3 text-start">{t("name")}</th>
                  <th className="px-4 py-3 text-start">{t("check_in")}</th>
                  <th className="px-4 py-3 text-start">{t("check_out")}</th>
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : records.map(r => (
                  <tr key={r.id} className="border-b hover:bg-emerald-50/40">
                    <td className="px-4 py-3">{r.date}</td>
                    <td className="px-4 py-3">{empName(r.employee_id)}</td>
                    <td className="px-4 py-3">{r.check_in || "-"}</td>
                    <td className="px-4 py-3">{r.check_out || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                        {t(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "overtime" && (
        <>
          <p className="text-xs text-gray-500 mb-3">{t("overtime_law_note")}</p>

          <div className="flex gap-3 mb-4 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("month")}</label>
              <input type="month" value={otMonth} onChange={e => setOtMonth(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("employees")}</label>
              <select value={otEmployee} onChange={e => setOtEmployee(e.target.value)} className="px-3 py-2 border rounded-lg text-sm min-w-48">
                <option value="">{t("all")}</option>
                {employees.map(e => <option key={e.id} value={e.id}>{empName(e.id)}</option>)}
              </select>
            </div>
          </div>

          {showOtForm && (
            <form key={editingOt?.id ?? "new"} onSubmit={handleOtSubmit} className="card p-5 mb-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("employees")}</label>
                  <select name="employee_id" required defaultValue={editingOt?.employee_id ?? ""} className={inputCls}>
                    <option value="" disabled>{t("select_employee")}</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{empName(e.id)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("date")}</label>
                  <input type="date" name="ot_date" required defaultValue={editingOt?.date ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("payroll_month")}</label>
                  <input type="month" name="month" defaultValue={editingOt?.month ?? otMonth} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("overtime_hours")}</label>
                  <input type="number" name="hours" step="0.25" min="0.25" required defaultValue={editingOt?.hours ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("overtime_type")}</label>
                  <select name="ot_type" defaultValue={editingOt?.ot_type ?? "weekday"} className={inputCls}>
                    {OT_TYPES.map(k => <option key={k} value={k}>{t(`ot_${k}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("notes")}</label>
                  <input type="text" name="notes" defaultValue={editingOt?.notes ?? ""} className={inputCls} />
                </div>
              </div>
              <button type="submit"
                className="btn btn-primary">
                {t("save")}
              </button>
            </form>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="px-4 py-3 text-start">{t("date")}</th>
                  <th className="px-4 py-3 text-start">{t("name")}</th>
                  <th className="px-4 py-3 text-start">{t("overtime_type")}</th>
                  <th className="px-4 py-3 text-end">{t("overtime_hours")}</th>
                  {isManager && <th className="px-4 py-3 text-end">{t("hourly_rate")}</th>}
                  <th className="px-4 py-3 text-end">{t("rate")}</th>
                  {isManager && <th className="px-4 py-3 text-end">{t("amount")}</th>}
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                  <th className="px-4 py-3 text-start">{t("notes")}</th>
                  {canEdit && <th className="px-4 py-3 text-start">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {otRecords.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : otRecords.map(r => (
                  <tr key={r.id} className="border-b hover:bg-emerald-50/40">
                    <td className="px-4 py-3">{r.date}</td>
                    <td className="px-4 py-3">{empName(r.employee_id)}</td>
                    <td className="px-4 py-3">{t(`ot_${r.ot_type}`)}</td>
                    <td className="px-4 py-3 text-end">{r.hours}</td>
                    {isManager && <td className="px-4 py-3 text-end">{fmt(r.hourly_rate)}</td>}
                    <td className="px-4 py-3 text-end">x{r.rate_multiplier}</td>
                    {isManager && <td className="px-4 py-3 text-end font-medium">{fmt(r.amount)}</td>}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(r.approval_status)}`}>
                        {t(r.approval_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.notes || "-"}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          {isManager && r.approval_status === "pending_approval" && (
                            <>
                              <button onClick={() => otAction(r.id, "approve")} className="text-green-600 hover:underline text-xs">{t("approve")}</button>
                              <button onClick={() => otAction(r.id, "reject")} className="text-red-600 hover:underline text-xs">{t("reject")}</button>
                            </>
                          )}
                          {isManager && (
                            <>
                              <button onClick={() => { setEditingOt(r); setShowOtForm(true); }} className="text-blue-600 hover:underline text-xs">{t("edit")}</button>
                              <button onClick={() => deleteOt(r.id)} className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {otRecords.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-semibold">
                  <tr>
                    <td className="px-4 py-3" colSpan={3}>{t("total")}</td>
                    <td className="px-4 py-3 text-end">{otTotals.hours}</td>
                    {isManager && <td />}
                    <td />
                    {isManager && (
                      <td className="px-4 py-3 text-end">
                        {fmt(otTotals.approved)}
                        {otTotals.approved !== otTotals.amount && (
                          <span className="block text-xs font-normal text-gray-500">{t("approved")}: {fmt(otTotals.approved)} / {fmt(otTotals.amount)}</span>
                        )}
                      </td>
                    )}
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
