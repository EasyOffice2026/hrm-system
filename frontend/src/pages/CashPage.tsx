import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiFetch, apiDownload } from "../contexts/api";
import { useAuth } from "../contexts/AuthContext";

interface Branch { id: number; name: string; name_ar: string; }
interface CashSummary {
  date: string; branch_id: number;
  opening_balance: number; petty_cash_in: number;
  cash_expenses: number; cash_withdrawn: number;
  deposited: number; closing_balance: number; total_in: number; total_out: number;
}
interface CashTxn {
  id: number; branch_id: number; date: string;
  txn_type: string; category: string; amount: number;
  reference: string; notes: string; balance: number;
}

export default function CashPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [transactions, setTransactions] = useState<CashTxn[]>([]);
  const [tab, setTab] = useState<"summary" | "transactions">("summary");
  const [showTxnForm, setShowTxnForm] = useState(false);
  const [txnType, setTxnType] = useState<"cash_in" | "cash_out">("cash_in");

  const categoriesFor = (type: string) =>
    type === "cash_in"
      ? [{ value: "opening_balance", label: t("opening_balance") }, { value: "petty_cash", label: t("petty_cash") }]
      : [{ value: "deposit", label: t("bank_deposit") }, { value: "withdrawal", label: t("withdrawal") }];

  useEffect(() => {
    const scope = ["personnel", "personnel_manager"].includes(user?.role || "") ? "?scope=personnel" : "";
    apiGet(`/api/branches/${scope}`).then((bs: Branch[]) => {
      setBranches(bs);
      if (user?.branch_id) {
        setBranchId(String(user.branch_id));
      } else if (bs.length > 0) {
        setBranchId(String(bs[0].id));
      }
    });
  }, []);

  useEffect(() => {
    if (branchId) loadData();
  }, [branchId, selectedDate]);

  const loadData = () => {
    apiGet(`/api/cash/summary?branch_id=${branchId}&summary_date=${selectedDate}`).then(setSummary);
    apiGet(`/api/cash/transactions?branch_id=${branchId}`).then(setTransactions);
  };

  const handleAddTxn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams({
      branch_id: branchId,
      txn_date: fd.get("txn_date") as string || selectedDate,
      txn_type: fd.get("txn_type") as string,
      category: fd.get("category") as string,
      amount: fd.get("amount") as string,
      reference: fd.get("reference") as string || "",
      notes: fd.get("notes") as string || "",
    });
    await apiFetch(`/api/cash/transactions?${params}`, { method: "POST" });
    setShowTxnForm(false);
    loadData();
  };

  const branchName = (id: number) => {
    const b = branches.find(br => br.id === id);
    return b ? (i18n.language === "ar" ? b.name_ar || b.name : b.name) : "";
  };

  const exportData = (fmt: string) => {
    const ext = fmt === "excel" ? "xlsx" : fmt;
    apiDownload(`/api/export/cash/${fmt}?branch_id=${branchId}`, `cash_management.${ext}`);
  };

  const isStaff = user?.role === "staff";
  const readOnly = user?.role === "personnel";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gray-800">{t("cash_management")}</h2>
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
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap items-end">
        {!isStaff && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("branch")}</label>
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm">
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {i18n.language === "ar" ? b.name_ar || b.name : b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("date")}</label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button onClick={() => setTab("summary")}
          className={`px-4 py-2 text-sm rounded-t-lg ${tab === "summary" ? "bg-emerald-600 text-white" : "bg-gray-200"}`}>
          {t("summary")}
        </button>
        {!readOnly && <button onClick={() => setTab("transactions")}
          className={`px-4 py-2 text-sm rounded-t-lg ${tab === "transactions" ? "bg-emerald-600 text-white" : "bg-gray-200"}`}>
          {t("transactions")}
        </button>}
      </div>
      {readOnly && (
        <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          {t("cash_view_only")}
        </div>
      )}

      {tab === "summary" && summary && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-lg mb-4">
            {t("cash_sheet")} - {branchName(parseInt(branchId))} - {selectedDate}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cash In */}
            <div className="border rounded-lg p-4 bg-green-50">
              <h4 className="font-semibold text-green-700 mb-3">{t("total_in")}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{t("opening_balance")}</span>
                  <span className="font-medium">KD {summary.opening_balance.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("petty_cash_in")}</span>
                  <span className="font-medium text-green-600">KD {summary.petty_cash_in.toFixed(3)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>{t("total_in")}</span>
                  <span className="text-green-700">KD {summary.total_in.toFixed(3)}</span>
                </div>
              </div>
            </div>

            {/* Cash Out */}
            <div className="border rounded-lg p-4 bg-red-50">
              <h4 className="font-semibold text-red-700 mb-3">{t("total_out")}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{t("cash_expenses")}</span>
                  <span className="font-medium text-red-600">KD {summary.cash_expenses.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("cash_withdrawn")}</span>
                  <span className="font-medium text-red-600">KD {summary.cash_withdrawn.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("deposited")}</span>
                  <span className="font-medium text-red-600">KD {summary.deposited.toFixed(3)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>{t("total_out")}</span>
                  <span className="text-red-700">KD {summary.total_out.toFixed(3)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Closing Balance */}
          <div className="mt-4 p-4 bg-blue-50 border rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">{t("closing_balance")}</span>
              <span className="font-bold text-xl text-blue-700">
                KD {summary.closing_balance.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "transactions" && !readOnly && (
        <div>
          <div className="mb-4">
            <button onClick={() => setShowTxnForm(!showTxnForm)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
              {showTxnForm ? t("cancel") : t("add_transaction")}
            </button>
          </div>

          {showTxnForm && (
            <form onSubmit={handleAddTxn} className="bg-white p-6 rounded-xl shadow-sm border mb-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("date")}</label>
                  <input type="date" name="txn_date" defaultValue={selectedDate}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("type")}</label>
                  <select name="txn_type" value={txnType}
                    onChange={e => setTxnType(e.target.value as "cash_in" | "cash_out")}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="cash_in">{t("cash_in")}</option>
                    <option value="cash_out">{t("cash_out")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("category")}</label>
                  <select name="category" key={txnType} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {categoriesFor(txnType).map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("amount")}</label>
                  <input type="number" step="0.001" name="amount" required
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("reference")}</label>
                  <input name="reference" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("notes")}</label>
                  <input name="notes" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <button type="submit"
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                {t("save")}
              </button>
            </form>
          )}

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">{t("date")}</th>
                  <th className="px-4 py-3 text-left">{t("type")}</th>
                  <th className="px-4 py-3 text-left">{t("category")}</th>
                  <th className="px-4 py-3 text-right">{t("cash_in")}</th>
                  <th className="px-4 py-3 text-right">{t("cash_out")}</th>
                  <th className="px-4 py-3 text-right font-bold">{t("balance")}</th>
                  <th className="px-4 py-3 text-left">{t("reference")}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : transactions.map(txn => (
                  <tr key={txn.id} className={`border-b hover:bg-gray-50 ${txn.txn_type === "opening_balance" ? "bg-blue-50" : ""}`}>
                    <td className="px-4 py-3">{txn.date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        txn.txn_type === "cash_out" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      }`}>
                        {txn.txn_type === "cash_out" ? t("cash_out") : t("cash_in")}
                      </span>
                    </td>
                    <td className="px-4 py-3">{txn.category === "deposit" ? t("bank_deposit") : (t(txn.category) || txn.category)}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {(txn.txn_type === "cash_in" || txn.txn_type === "opening_balance") ? `KD ${txn.amount.toFixed(3)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">
                      {txn.txn_type === "cash_out" ? `KD ${txn.amount.toFixed(3)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      KD {txn.balance.toFixed(3)}
                    </td>
                    <td className="px-4 py-3">{txn.reference || txn.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
