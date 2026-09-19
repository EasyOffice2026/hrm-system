import { toastError } from "../components/toastStore";
import { Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost, apiDownload, apiFetch } from "../contexts/api";
import { useAuth } from "../contexts/AuthContext";
import DateRangeFilter, { type DateRange, dateRangeParams } from "../components/DateRangeFilter";

interface Branch { id: number; name: string; name_ar?: string; }
interface Category { id: number; name: string; name_ar: string; }
interface Expense {
  id: number; branch_id: number; category_id: number; date: string;
  description: string; amount: number; payment_method: string;
  attachment_path?: string | null;
  contract_payment_id?: number | null;
  salary_payment_id?: number | null;
}

export default function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatNameAr, setNewCatNameAr] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });

  const isManager = user?.role === "owner" || user?.role === "manager" || user?.role === "accountant";
  const isStaff = user?.role === "staff";

  const loadCategories = () => apiGet("/api/expenses/categories").then(setCategories);

  const listParams = (bid: string) => {
    const parts = [...(bid ? [`branch_id=${bid}`] : []), ...dateRangeParams(range)];
    return parts.length ? `?${parts.join("&")}` : "";
  };

  const loadExpenses = (bid: string = branchFilter) =>
    apiGet(`/api/expenses/${listParams(bid)}`).then(setExpenses);

  useEffect(() => { loadExpenses(); }, [range]);

  useEffect(() => {
    apiGet("/api/branches/").then(setBranches);
    loadCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm(t("confirm_transaction"))) return;
    const fd = new FormData(e.currentTarget);
    if (editingExpense) {
      await apiFetch(`/api/expenses/${editingExpense.id}`, { method: "PUT", body: fd });
      setEditingExpense(null);
    } else {
      await apiPost("/api/expenses/", fd);
    }
    setShowForm(false);
    loadExpenses();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("confirm_delete"))) return;
    await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
    loadExpenses();
  };

  const handlePrint = (exp: Expense) => {
    apiDownload(`/api/export/expense/${exp.id}/pdf`, `expense-${exp.id}.pdf`);
  };

  const branchName = (id: number) => { const b = branches.find(x => x.id === id); return b ? (i18n.language === "ar" ? (b.name_ar || b.name) : b.name) : ""; };
  const catName = (id: number) => {
    const c = categories.find(cat => cat.id === id);
    return c ? (i18n.language === "ar" ? c.name_ar || c.name : c.name) : "";
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const fd = new FormData();
    fd.append("name", newCatName.trim());
    fd.append("name_ar", newCatNameAr.trim());
    const res = await apiFetch("/api/expenses/categories", { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toastError(d.detail || "Error"); return; }
    setNewCatName(""); setNewCatNameAr("");
    loadCategories();
  };

  const exportData = (fmt: string) => {
    const ext = fmt === "excel" ? "xlsx" : fmt;
    apiDownload(`/api/export/expenses/${fmt}${listParams(branchFilter)}`, `expenses.${ext}`);
  };

  const deleteCategory = async (id: number) => {
    if (!confirm(t("confirm_delete"))) return;
    const res = await apiFetch(`/api/expenses/categories/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toastError(d.detail || "Error"); return; }
    loadCategories();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3"><div className="hidden sm:flex w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-700 items-center justify-center shrink-0"><Receipt size={20} /></div><h2 className="page-title">{t("expenses")}</h2></div>
        {(
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
            <button onClick={() => { setShowForm(!showForm); setEditingExpense(null); }}
              className="btn btn-primary">
              {showForm ? t("cancel") : t("add_new")}
            </button>
          </div>
        )}
      </div>

      {(
        <div className="mb-4 flex items-center gap-4 flex-wrap">
          {!isStaff && (
            <select value={branchFilter}
              onChange={e => { setBranchFilter(e.target.value); loadExpenses(e.target.value); }}
              className="px-3 py-2 border rounded-lg text-sm">
              <option value="">{t("all_branches")}</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {i18n.language === "ar" ? (b.name_ar || b.name) : b.name}
                </option>
              ))}
            </select>
          )}
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      )}

      {(
        <>
          {(showForm || editingExpense) && (
            <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
              <h3 className="font-semibold">{editingExpense ? t("edit") : t("add_new")}</h3>
              <div className="grid grid-cols-2 gap-4">
                {user?.branch_id ? (
                  <input type="hidden" name="branch_id" value={user.branch_id} />
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("branch")}</label>
                    <select name="branch_id" required defaultValue={editingExpense?.branch_id || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                      {branches.map(b => <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name) : b.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium">{t("category")}</label>
                    {isManager && (
                      <button type="button" onClick={() => setShowCatMgr(true)}
                        className="text-xs text-emerald-600 hover:underline">
                        + {t("manage_categories")}
                      </button>
                    )}
                  </div>
                  <select name="category_id" defaultValue={editingExpense?.category_id || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">--</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{i18n.language === "ar" ? (c.name_ar || c.name) : c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("date")}</label>
                  <input type="date" name="expense_date" required defaultValue={editingExpense?.date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("amount")}</label>
                  <input type="number" step="0.001" name="amount" required defaultValue={editingExpense?.amount || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("payment_type")}</label>
                  <select name="payment_method" defaultValue={editingExpense?.payment_method || "cash"} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="cash">{t("cash")}</option>
                    <option value="credit">{t("credit")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("description")}</label>
                <input name="description" required className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("notes")}</label>
                  <input name="notes" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("attachment")}</label>
                  <div className="flex gap-2">
                    <input type="file" name="attachment" accept="image/*,.pdf" className="text-sm" />
                    <button type="button" onClick={() => {
                      const inp = document.createElement("input");
                      inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment";
                      inp.onchange = () => {
                        const f = inp.files?.[0];
                        if (f) {
                          const dt = new DataTransfer(); dt.items.add(f);
                          const target = document.querySelector('input[name="attachment"]') as HTMLInputElement;
                          if (target) target.files = dt.files;
                        }
                      };
                      inp.click();
                    }} className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 whitespace-nowrap">
                      {t("take_picture")}
                    </button>
                  </div>
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
                  <th className="px-4 py-3 text-left">{t("date")}</th>
                  <th className="px-4 py-3 text-left">{t("branch")}</th>
                  <th className="px-4 py-3 text-left">{t("category")}</th>
                  <th className="px-4 py-3 text-left">{t("description")}</th>
                  <th className="px-4 py-3 text-right">{t("amount")}</th>
                  <th className="px-4 py-3 text-left">{t("payment_type")}</th>
                  <th className="px-4 py-3 text-center">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{t("no_data")}</td></tr>
                ) : expenses.map(exp => (
                  <tr key={exp.id} className="border-b hover:bg-emerald-50/40">
                    <td className="px-4 py-3">{exp.date}</td>
                    <td className="px-4 py-3">{branchName(exp.branch_id)}</td>
                    <td className="px-4 py-3">{catName(exp.category_id)}</td>
                    <td className="px-4 py-3">{exp.description}</td>
                    <td className="px-4 py-3 text-right font-mono">KD {exp.amount.toFixed(3)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        exp.payment_method === "cash" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                      }`}>
                        {t(exp.payment_method)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center flex-wrap">
                        {exp.contract_payment_id ? (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{t("contracts_tab")}</span>
                        ) : exp.salary_payment_id ? (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{t("payroll")}</span>
                        ) : (
                          <button onClick={() => { setEditingExpense(exp); setShowForm(false); }}
                            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">{t("edit")}</button>
                        )}
                        <button onClick={() => handlePrint(exp)}
                          className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">{t("print")}</button>
                        {isManager && !exp.contract_payment_id && !exp.salary_payment_id && (
                          <button onClick={() => handleDelete(exp.id)}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">{t("delete")}</button>
                        )}
                        {exp.attachment_path && (
                          <a href={`/uploads/${exp.attachment_path}`} target="_blank" rel="noopener noreferrer"
                            className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700">{t("attachment")}</a>
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

      {showCatMgr && (
        <div className="fixed inset-0 bg-emerald-950/45 backdrop-blur-[2px] flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setShowCatMgr(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto my-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t("manage_categories")}</h3>
              <button type="button" onClick={() => setShowCatMgr(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                placeholder={`${t("name")} (EN)`} className="px-3 py-2 border rounded-lg text-sm" />
              <input value={newCatNameAr} onChange={e => setNewCatNameAr(e.target.value)}
                placeholder={`${t("name")} (AR)`} dir="rtl" className="px-3 py-2 border rounded-lg text-sm" />
            </div>
            <button type="button" onClick={addCategory}
              className="btn btn-primary w-full mb-4">
              {t("add")}
            </button>
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400 text-center">{t("no_data")}</div>
              ) : categories.map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{c.name}{c.name_ar ? <span className="text-gray-400" dir="rtl"> — {c.name_ar}</span> : null}</span>
                  <button type="button" onClick={() => deleteCategory(c.id)}
                    className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
