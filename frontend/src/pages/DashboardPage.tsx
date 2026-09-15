import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { apiGet } from "../contexts/api";
import { useAuth } from "../contexts/AuthContext";
import { useBrand } from "../contexts/BrandContext";
import DateRangeFilter, { type DateRange, dateRangeParams } from "../components/DateRangeFilter";
import { Users, UserCheck, CalendarOff, Wallet, Receipt, IdCard, FileWarning, LogOut, ClipboardList, Banknote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface BranchData {
  branch_id: number; branch_name: string; branch_name_ar: string;
  employees: number; payroll: number; expenses: number; cash_balance: number;
}

interface DashboardData {
  month: string;
  employee_count: number;
  present_today: number;
  on_leave_today: number;
  pending_leaves: number;
  payroll_total: number;
  payroll_paid: number;
  payroll_pending: number;
  total_expenses: number;
  open_resignations: number;
  documents_expiring: number;
  documents_expired: number;
  licenses_expiring: number;
  pending_renewals: number;
  branch_data: BranchData[];
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { selectedBrand, isGroupView } = useBrand();
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const isAr = i18n.language === "ar";

  useEffect(() => {
    const parts = [...dateRangeParams(range)];
    if (selectedBrand && !isGroupView) parts.push(`brand_id=${selectedBrand.id}`);
    const qs = parts.join("&");
    apiGet(`/api/dashboard/${qs ? `?${qs}` : ""}`).then(setData);
  }, [range, selectedBrand, isGroupView]);

  const kd = (v: number) => `KD ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

  const cards = data ? [
    { label: t("employee_count"), value: data.employee_count.toString(), icon: Users, color: "bg-emerald-500", to: "/hr" },
    { label: t("present_today"), value: data.present_today.toString(), icon: UserCheck, color: "bg-teal-500", to: "/attendance" },
    { label: t("on_leave_today"), value: data.on_leave_today.toString(), icon: CalendarOff, color: "bg-sky-500", to: "/hr" },
    { label: t("pending_leaves"), value: data.pending_leaves.toString(), icon: ClipboardList, color: "bg-amber-500", to: "/hr" },
    { label: `${t("payroll")} (${data.month})`, value: kd(data.payroll_total), icon: Wallet, color: "bg-blue-500", to: "/payroll" },
    { label: t("payroll_pending"), value: kd(data.payroll_pending), icon: Banknote, color: "bg-indigo-500", to: "/payroll" },
    { label: t("total_expenses"), value: kd(data.total_expenses), icon: Receipt, color: "bg-orange-500", to: "/expenses" },
    { label: t("documents_expiring"), value: data.documents_expiring.toString(), icon: IdCard, color: "bg-yellow-500", to: "/renewals" },
    { label: t("documents_expired"), value: data.documents_expired.toString(), icon: FileWarning, color: "bg-red-500", to: "/renewals" },
    { label: t("licenses_expiring"), value: data.licenses_expiring.toString(), icon: FileWarning, color: "bg-rose-500", to: "/renewals" },
    { label: t("pending_renewals"), value: data.pending_renewals.toString(), icon: ClipboardList, color: "bg-purple-500", to: "/renewals" },
    { label: t("open_resignations"), value: data.open_resignations.toString(), icon: LogOut, color: "bg-gray-500", to: "/eos" },
  ] : [];

  const chartData = data ? data.branch_data.map(b => ({ ...b, name: isAr && b.branch_name_ar ? b.branch_name_ar : b.branch_name })) : [];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-0.5">{t("dashboard")}</h2>
      <p className="text-gray-500 text-sm mb-3">{t("welcome_back")}, {user?.full_name}</p>
      <div className="mb-4"><DateRangeFilter value={range} onChange={setRange} /></div>

      {!data ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
            {cards.map(({ label, value, icon: Icon, color, to }) => (
              <Link to={to} key={label} className="bg-white rounded-lg shadow-sm border p-3 hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-lg font-bold text-gray-800 mt-0.5">{value}</p>
                  </div>
                  <div className={`${color} p-2 rounded-lg text-white`}>
                    <Icon size={18} />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-4">
              <h3 className="font-semibold text-gray-700 mb-3">{t("branch_performance")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => `KD ${Number(value).toLocaleString()}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="payroll" name={t("payroll")} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name={t("expenses")} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cash_balance" name={t("cash_balance")} fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-4">
              <h3 className="font-semibold text-gray-700 mb-3">{t("headcount_by_branch")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="employees" name={t("employees")} fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">{t("branch")}</th>
                  <th className="px-4 py-3 text-right">{t("employees")}</th>
                  <th className="px-4 py-3 text-right">{t("payroll")}</th>
                  <th className="px-4 py-3 text-right">{t("total_expenses")}</th>
                  <th className="px-4 py-3 text-right">{t("cash_balance")}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((b, i) => (
                  <tr key={b.branch_id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {b.name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{b.employees}</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-600">{kd(b.payroll)}</td>
                    <td className="px-4 py-3 text-right font-mono text-orange-600">{kd(b.expenses)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${b.cash_balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>{kd(b.cash_balance)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-4 py-3">{t("total")}</td>
                  <td className="px-4 py-3 text-right font-mono">{data.employee_count}</td>
                  <td className="px-4 py-3 text-right font-mono text-blue-700">{kd(data.payroll_total)}</td>
                  <td className="px-4 py-3 text-right font-mono text-orange-700">{kd(data.total_expenses)}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">{kd(chartData.reduce((s, b) => s + b.cash_balance, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
