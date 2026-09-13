import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "../contexts/api";

interface Employee { id: number; name: string; name_ar: string; branch_id: number; }
interface AttRecord { id: number; employee_id: number; date: string; check_in: string; check_out: string; status: string; }

export default function AttendancePage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    apiGet("/api/hr/employees").then(setEmployees);
    apiGet("/api/hr/attendance").then(setRecords);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    await apiPost("/api/hr/attendance", fd);
    setShowForm(false);
    apiGet("/api/hr/attendance").then(setRecords);
  };

  const empName = (id: number) => { const e = employees.find(x => x.id === id); return e ? (e.name_ar || e.name) : ""; };

  const statusColor = (s: string) => {
    switch (s) {
      case "absent": return "bg-red-100 text-red-700";
      case "late": return "bg-yellow-100 text-yellow-700";
      case "leave": return "bg-blue-100 text-blue-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{t("attendance")}</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm">
          {showForm ? t("cancel") : t("add_new")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("employees")}</label>
              <select name="employee_id" required className="w-full px-3 py-2 border rounded-lg text-sm">
                {employees.map(e => <option key={e.id} value={e.id}>{e.name_ar || e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("date")}</label>
              <input type="date" name="att_date" required className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("check_in")}</label>
              <input type="time" name="check_in" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("check_out")}</label>
              <input type="time" name="check_out" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("status")}</label>
            <select name="status" className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="absent">{t("absent")}</option>
              <option value="late">{t("late")}</option>
              <option value="leave">{t("leave")}</option>
            </select>
          </div>
          <button type="submit"
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm">
            {t("save")}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">{t("date")}</th>
              <th className="px-4 py-3 text-left">{t("name")}</th>
              <th className="px-4 py-3 text-left">{t("check_in")}</th>
              <th className="px-4 py-3 text-left">{t("check_out")}</th>
              <th className="px-4 py-3 text-left">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">{r.date}</td>
                <td className="px-4 py-3">{empName(r.employee_id)}</td>
                <td className="px-4 py-3">{r.check_in || "-"}</td>
                <td className="px-4 py-3">{r.check_out || "-"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${statusColor(r.status)}`}>
                    {t(r.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
