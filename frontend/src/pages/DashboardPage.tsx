import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { apiGet } from "../contexts/api";
import { useAuth } from "../contexts/AuthContext";
import { useBrand } from "../contexts/BrandContext";
import DateRangeFilter, { type DateRange, dateRangeParams } from "../components/DateRangeFilter";
import { Card, StatCard, StatGridSkeleton, Skeleton, EmptyState, Badge, type Tone } from "../components/ui";
import {
  Users, UserCheck, CalendarOff, Wallet, Receipt, IdCard, FileWarning, LogOut, ClipboardList,
  Banknote, ChevronRight, CheckCircle2, UserPlus, CalendarCheck, RefreshCw, type LucideIcon,
} from "lucide-react";
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

const COLORS = ["#334f8f", "#4565a8", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

type ActionItem = { count: number; text: string; to: string; tone: Tone; icon: LucideIcon };

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { selectedBrand, isGroupView } = useBrand();
  const navigate = useNavigate();
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
  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

  const chartData = data ? data.branch_data.map(b => ({ ...b, name: isAr && b.branch_name_ar ? b.branch_name_ar : b.branch_name })) : [];

  const actions: ActionItem[] = data ? ([
    { count: data.documents_expired, text: t("expired_docs_action"), to: "/renewals", tone: "red", icon: FileWarning },
    { count: data.documents_expiring, text: t("expiring_docs_action"), to: "/renewals", tone: "amber", icon: IdCard },
    { count: data.licenses_expiring, text: t("licenses_action"), to: "/renewals", tone: "amber", icon: FileWarning },
    { count: data.pending_leaves, text: t("leaves_action"), to: "/hr", tone: "blue", icon: ClipboardList },
    { count: data.pending_renewals, text: t("renewals_action"), to: "/renewals", tone: "purple", icon: RefreshCw },
    { count: data.open_resignations, text: t("resignations_action"), to: "/eos", tone: "gray", icon: LogOut },
  ] satisfies ActionItem[]).filter(a => a.count > 0) : [];

  const firstName = (user?.full_name || "").split(" ")[0];

  const quick = [
    { label: t("add_employee"), icon: UserPlus, to: "/hr" },
    { label: t("mark_attendance"), icon: CalendarCheck, to: "/attendance" },
    { label: t("run_payroll"), icon: Wallet, to: "/payroll" },
    { label: t("new_renewal_request"), icon: IdCard, to: "/renewals" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{t("welcome_back")}, {firstName}</p>
          <h1 className="page-title mt-0.5">{t("dashboard")}</h1>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {!data ? (
        <>
          <StatGridSkeleton count={6} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Skeleton className="h-80 lg:col-span-2 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <StatCard label={t("employee_count")} value={data.employee_count} icon={Users} tone="navy" onClick={() => navigate("/hr")} />
            <StatCard label={t("present_today")} value={data.present_today} icon={UserCheck} tone="green"
              hint={`${pct(data.present_today, data.employee_count)}% ${t("present_rate").toLowerCase()}`} onClick={() => navigate("/attendance")} />
            <StatCard label={t("on_leave_today")} value={data.on_leave_today} icon={CalendarOff} tone="blue" onClick={() => navigate("/hr")} />
            <StatCard label={t("pending_leaves")} value={data.pending_leaves} icon={ClipboardList} tone="amber" onClick={() => navigate("/hr")} />
            <StatCard label={t("documents_expiring")} value={data.documents_expiring} icon={IdCard} tone="amber" onClick={() => navigate("/renewals")} />
            <StatCard label={t("documents_expired")} value={data.documents_expired} icon={FileWarning} tone="red" onClick={() => navigate("/renewals")} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Payroll snapshot */}
            <Card className="lg:col-span-2" padded={false}
              title={<span className="flex items-center gap-2"><Wallet size={16} className="text-emerald-600" />{t("payroll_snapshot")} · {data.month}</span>}
              actions={<Link to="/payroll" className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-0.5">{t("view_all")} <ChevronRight size={14} className="rtl:-scale-x-100" /></Link>}>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="sm:col-span-1">
                  <p className="text-xs text-gray-500">{t("payroll")}</p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{kd(data.payroll_total)}</p>
                  <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${pct(data.payroll_paid, data.payroll_total)}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    <span className="font-medium text-gray-700">{pct(data.payroll_paid, data.payroll_total)}%</span> {t("paid_of_total")} {kd(data.payroll_total)}
                  </p>
                </div>
                <div className="rounded-xl bg-green-50/70 p-4">
                  <div className="flex items-center gap-2 text-green-700 text-xs font-medium"><CheckCircle2 size={14} />{t("payroll_paid")}</div>
                  <p className="text-lg font-bold text-green-800 tabular-nums mt-1">{kd(data.payroll_paid)}</p>
                </div>
                <div className="rounded-xl bg-amber-50/70 p-4">
                  <div className="flex items-center gap-2 text-amber-700 text-xs font-medium"><Banknote size={14} />{t("payroll_pending")}</div>
                  <p className="text-lg font-bold text-amber-800 tabular-nums mt-1">{kd(data.payroll_pending)}</p>
                </div>
              </div>
              <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Link to="/expenses" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-gray-50">
                  <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center"><Receipt size={16} /></span>
                  <span className="min-w-0"><span className="block text-[11px] text-gray-500">{t("total_expenses")}</span><span className="block font-semibold tabular-nums truncate">{kd(data.total_expenses)}</span></span>
                </Link>
                <Link to="/renewals" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-gray-50">
                  <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><RefreshCw size={16} /></span>
                  <span className="min-w-0"><span className="block text-[11px] text-gray-500">{t("pending_renewals")}</span><span className="block font-semibold tabular-nums">{data.pending_renewals}</span></span>
                </Link>
                <Link to="/eos" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-gray-50">
                  <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center"><LogOut size={16} /></span>
                  <span className="min-w-0"><span className="block text-[11px] text-gray-500">{t("open_resignations")}</span><span className="block font-semibold tabular-nums">{data.open_resignations}</span></span>
                </Link>
              </div>
            </Card>

            {/* Needs attention */}
            <Card padded={false}
              title={<span className="flex items-center gap-2">{t("needs_attention")}{actions.length > 0 && <Badge tone="red">{actions.length}</Badge>}</span>}>
              {actions.length === 0 ? (
                <EmptyState icon={CheckCircle2} title={t("all_clear")} />
              ) : (
                <ul className="divide-y">
                  {actions.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <li key={i}>
                        <Link to={a.to} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                          <Badge tone={a.tone} className="!px-2 min-w-[2rem] justify-center text-sm font-semibold">{a.count}</Badge>
                          <span className="flex-1 text-sm text-gray-700 leading-snug">{a.text}</span>
                          <Icon size={15} className="text-gray-300 group-hover:text-gray-500" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="border-t px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{t("quick_actions")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {quick.map(q => (
                    <Link key={q.to + q.label} to={q.to}
                      className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50">
                      <q.icon size={14} className="text-emerald-600 shrink-0" /><span className="truncate">{q.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2" title={t("branch_performance")}>
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f6f7fb" }} contentStyle={{ borderRadius: 10, border: "1px solid #e5e8ef", fontSize: 12 }}
                    formatter={(value) => `KD ${Number(value).toLocaleString()}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="payroll" name={t("payroll")} fill="#334f8f" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name={t("expenses")} fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="cash_balance" name={t("cash_balance")} fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </Card>

            <Card title={t("headcount_by_branch")}>
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f6f7fb" }} contentStyle={{ borderRadius: 10, border: "1px solid #e5e8ef", fontSize: 12 }} />
                  <Bar dataKey="employees" name={t("employees")} fill="#4565a8" radius={[0, 6, 6, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Branch table */}
          <Card padded={false} title={t("workforce_overview")}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-5 py-3 text-start">{t("branch")}</th>
                    <th className="px-5 py-3 text-end">{t("employees")}</th>
                    <th className="px-5 py-3 text-end">{t("payroll")}</th>
                    <th className="px-5 py-3 text-end">{t("total_expenses")}</th>
                    <th className="px-5 py-3 text-end">{t("cash_balance")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {chartData.length === 0 && (
                    <tr><td colSpan={5}><EmptyState title={t("no_data")} /></td></tr>
                  )}
                  {chartData.map((b, i) => (
                    <tr key={b.branch_id} className="hover:bg-gray-50/70">
                      <td className="px-5 py-3 font-medium text-gray-800">
                        <span className="inline-flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {b.name}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums">{b.employees}</td>
                      <td className="px-5 py-3 text-end tabular-nums">{kd(b.payroll)}</td>
                      <td className="px-5 py-3 text-end tabular-nums text-orange-700">{kd(b.expenses)}</td>
                      <td className={`px-5 py-3 text-end tabular-nums ${b.cash_balance >= 0 ? "text-green-700" : "text-red-600"}`}>{kd(b.cash_balance)}</td>
                    </tr>
                  ))}
                </tbody>
                {chartData.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-800 border-t">
                      <td className="px-5 py-3">{t("total")}</td>
                      <td className="px-5 py-3 text-end tabular-nums">{data.employee_count}</td>
                      <td className="px-5 py-3 text-end tabular-nums">{kd(data.payroll_total)}</td>
                      <td className="px-5 py-3 text-end tabular-nums text-orange-700">{kd(data.total_expenses)}</td>
                      <td className="px-5 py-3 text-end tabular-nums text-green-700">{kd(chartData.reduce((s, b) => s + b.cash_balance, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
