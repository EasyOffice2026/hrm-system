import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { apiGet } from "../contexts/api";
import { useBrand } from "../contexts/BrandContext";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Receipt, AlertTriangle, Clock, CalendarClock, FileText, IdCard, Banknote } from "lucide-react";

interface Req {
  id: number; request_no: string; group: string; subject_name: string; subject_name_ar: string; subject_id_no: string;
  branch_name: string; status: string; status_label: string; total: number; requested_at: string; line_count: number;
}
interface BoardRow {
  kind: string; ref_id: number; name: string; id_no: string; branch_name: string; type_name: string;
  expiry_date: string; days_remaining: number | null;
}
interface CashRow { id: number; date: string; txn_type: string; category: string; amount: number; reference: string; notes: string; }
interface Data {
  petty_cash_branch_name: string; petty_cash_balance: number; cash_in_month: number; cash_out_month: number;
  renewal_spend_month: number; expired: number; due_30: number; due_90: number; documents_total: number;
  requests: Record<string, number>; recent_requests: Req[]; upcoming: BoardRow[]; recent_cash: CashRow[];
  spend_by_branch: { branch_id: number; branch_name: string; amount: number }[];
}

const STATUS_CLS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", pending: "bg-amber-100 text-amber-800", approved: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800", closed: "bg-green-200 text-green-900", returned: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800", cancelled: "bg-gray-200 text-gray-600",
};
const kd = (v: number | null | undefined) => `KD ${(v || 0).toFixed(3)}`;

function Card({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: typeof Wallet; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
      <div className={`${color} text-white rounded-lg p-3 shrink-0`}><Icon size={22} /></div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 uppercase tracking-wide truncate">{label}</div>
        <div className="text-xl font-bold truncate">{value}</div>
        {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
      </div>
    </div>
  );
}

function Panel({ title, icon, link, children }: { title: string; icon: React.ReactNode; link?: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 font-semibold text-gray-700">{icon}{title}</div>
        {link && <Link to={link} className="text-xs text-emerald-700 hover:underline">{t("view_all")}</Link>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function PersonnelDashboardPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language === "ar";
  const { selectedBrand } = useBrand();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    apiGet("/api/renewals/dashboard").then(setData).catch(() => setData(null));
  }, [selectedBrand?.id]);

  if (!data) return <div className="p-6 text-gray-500">{t("loading")}</div>;

  const openCount = (data.requests.draft || 0) + (data.requests.pending || 0) + (data.requests.approved || 0) + (data.requests.completed || 0) + (data.requests.returned || 0);
  const daysCls = (d: number | null) =>
    d === null ? "bg-gray-100 text-gray-600" : d < 0 ? "bg-red-100 text-red-700" : d <= 30 ? "bg-amber-100 text-amber-800" : "bg-yellow-50 text-yellow-800";
  const daysLabel = (d: number | null) =>
    d === null ? "—" : d < 0 ? `${Math.abs(d)} ${t("rn_days_overdue")}` : `${d} ${t("rn_days")}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t("pd_title")}</h1>
          <p className="text-sm text-gray-500">{selectedBrand ? (ar && selectedBrand.name_ar ? selectedBrand.name_ar : selectedBrand.name_en) : ""} · {t("pd_subtitle")}</p>
        </div>
        <Link to="/renewals" className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <FileText size={16} /> {t("rn_new_request")}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card label={t("rn_petty_cash")} value={kd(data.petty_cash_balance)} sub={data.petty_cash_branch_name} icon={Wallet} color="bg-emerald-600" />
        <Card label={t("pd_cash_in_month")} value={kd(data.cash_in_month)} icon={ArrowDownCircle} color="bg-teal-500" />
        <Card label={t("pd_cash_out_month")} value={kd(data.cash_out_month)} icon={ArrowUpCircle} color="bg-orange-500" />
        <Card label={t("pd_spend_month")} value={kd(data.renewal_spend_month)} sub={t("pd_spend_hint")} icon={Receipt} color="bg-violet-500" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { l: t("rn_expired"), v: data.expired, c: "border-red-200 bg-red-50 text-red-700" },
          { l: t("rn_due_30"), v: data.due_30, c: "border-amber-200 bg-amber-50 text-amber-800" },
          { l: t("rn_due_90"), v: data.due_90, c: "border-yellow-200 bg-yellow-50 text-yellow-800" },
          { l: t("rn_pending_approval"), v: data.requests.pending || 0, c: "border-amber-200 bg-white text-amber-800" },
          { l: t("rn_approved_unpaid"), v: data.requests.approved || 0, c: "border-blue-200 bg-white text-blue-800" },
          { l: t("rn_completed_unpaid"), v: data.requests.completed || 0, c: "border-purple-200 bg-white text-purple-800" },
          { l: t("pd_open_requests"), v: openCount, c: "border-gray-200 bg-white text-gray-800" },
        ].map((x, i) => (
          <div key={i} className={`rounded-lg border p-3 ${x.c}`}>
            <div className="text-2xl font-bold">{x.v}</div>
            <div className="text-xs">{x.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title={t("pd_upcoming")} icon={<CalendarClock size={16} />} link="/renewals">
          {data.upcoming.length === 0 ? <div className="text-sm text-gray-500">{t("pd_nothing_due")}</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 text-start">
                <th className="text-start py-1">{t("name")}</th><th className="text-start py-1">{t("rn_group")}</th>
                <th className="text-start py-1">{t("branch")}</th><th className="text-start py-1">{t("rn_expiry_date")}</th><th className="text-end py-1">{t("rn_days_remaining")}</th>
              </tr></thead>
              <tbody>
                {data.upcoming.map(r => (
                  <tr key={`${r.kind}-${r.ref_id}`} className="border-t">
                    <td className="py-1.5"><div className="font-medium truncate max-w-[180px]">{r.name}</div><div className="text-xs text-gray-500 font-mono">{r.id_no}</div></td>
                    <td className="py-1.5 text-gray-700">{r.type_name}</td>
                    <td className="py-1.5 text-gray-700">{r.branch_name}</td>
                    <td className="py-1.5 font-mono text-xs">{r.expiry_date || "—"}</td>
                    <td className="py-1.5 text-end"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${daysCls(r.days_remaining)}`}>{daysLabel(r.days_remaining)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title={t("pd_recent_requests")} icon={<IdCard size={16} />} link="/renewals">
          {data.recent_requests.length === 0 ? <div className="text-sm text-gray-500">{t("pd_no_requests")}</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500">
                <th className="text-start py-1">{t("rn_request_no")}</th><th className="text-start py-1">{t("name")}</th>
                <th className="text-start py-1">{t("branch")}</th><th className="text-end py-1">{t("rn_total")}</th><th className="text-end py-1">{t("rn_status")}</th>
              </tr></thead>
              <tbody>
                {data.recent_requests.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1.5 font-mono text-xs">{r.request_no}<div className="text-gray-400">{r.requested_at.slice(0, 10)}</div></td>
                    <td className="py-1.5"><div className="font-medium truncate max-w-[180px]">{ar && r.subject_name_ar ? r.subject_name_ar : r.subject_name}</div><div className="text-xs text-gray-500 font-mono">{r.subject_id_no}</div></td>
                    <td className="py-1.5 text-gray-700">{r.branch_name}</td>
                    <td className="py-1.5 text-end font-semibold">{kd(r.total)}</td>
                    <td className="py-1.5 text-end"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_CLS[r.status] || ""}`}>{r.status_label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title={t("pd_recent_cash")} icon={<Banknote size={16} />} link="/cash">
          {data.recent_cash.length === 0 ? <div className="text-sm text-gray-500">{t("pd_no_cash")}</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500">
                <th className="text-start py-1">{t("date")}</th><th className="text-start py-1">{t("description")}</th><th className="text-end py-1">{t("cash_in")}</th><th className="text-end py-1">{t("cash_out")}</th>
              </tr></thead>
              <tbody>
                {data.recent_cash.map(c => {
                  const isIn = c.txn_type === "cash_in" || c.txn_type === "opening_balance";
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="py-1.5 font-mono text-xs">{c.date}</td>
                      <td className="py-1.5 text-gray-700 truncate max-w-[220px]">{c.reference || c.notes || c.category}</td>
                      <td className="py-1.5 text-end text-emerald-700">{isIn ? kd(c.amount) : ""}</td>
                      <td className="py-1.5 text-end text-red-600">{!isIn ? kd(c.amount) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title={t("pd_spend_by_branch")} icon={<Receipt size={16} />} link="/expenses">
          {data.spend_by_branch.length === 0 ? <div className="text-sm text-gray-500">{t("pd_no_spend")}</div> : (
            <div className="space-y-2">
              {(() => {
                const max = Math.max(...data.spend_by_branch.map(b => b.amount), 1);
                return data.spend_by_branch.map(b => (
                  <div key={b.branch_id}>
                    <div className="flex justify-between text-sm"><span>{b.branch_name}</span><span className="font-semibold">{kd(b.amount)}</span></div>
                    <div className="h-2 bg-gray-100 rounded"><div className="h-2 bg-violet-500 rounded" style={{ width: `${(b.amount / max) * 100}%` }} /></div>
                  </div>
                ));
              })()}
            </div>
          )}
        </Panel>
      </div>

      <div className="text-xs text-gray-400 flex items-center gap-1"><AlertTriangle size={12} /> {t("pd_footer")} <Clock size={12} className="ms-2" /> {data.documents_total} {t("pd_docs_tracked")}</div>
    </div>
  );
}
