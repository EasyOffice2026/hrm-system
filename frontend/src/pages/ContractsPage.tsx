import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiFetch, apiPost, apiDownload } from "../contexts/api";

interface Branch { id: number; name: string; name_ar?: string; }

interface ContractRecord {
  id: number; name: string; kind: string; place: string; period: string;
  branch_id: number | null;
  value: number; start_date: string; end_date: string;
  monthly_payment: number; payment_day: number;
  notes: string; status: string; created_at: string;
}

interface ContractPaymentRecord {
  id: number; contract_id: number; due_date: string;
  amount: number; status: string; paid_date: string | null;
  payment_method: string | null; reference: string | null; notes: string | null;
}

interface ReminderRecord {
  payment_id: number | null; contract_id: number; contract_name: string;
  kind: string; branch_id: number | null; period: string;
  amount: number; due_date: string; days_remaining: number; status: string;
}

const DEFAULT_CONTRACT_TYPES = [
  "Rent Contract", "Legal Contract", "Internet Contract",
  "Subscription", "Maintenance Contract", "Consultancy Contract",
  "Insurance Contract", "Service Contract"
];

// Map contract type keys to translation keys
const CONTRACT_TYPE_KEYS: Record<string, string> = {
  "Rent Contract": "ct_rent",
  "Legal Contract": "ct_legal",
  "Internet Contract": "ct_internet",
  "Subscription": "ct_subscription",
  "Maintenance Contract": "ct_maintenance",
  "Consultancy Contract": "ct_consultancy",
  "Insurance Contract": "ct_insurance",
  "Service Contract": "ct_service",
};

const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque", "knet", "credit"];

export default function ContractsPage() {
  const { t, i18n } = useTranslation();
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [payingPayment, setPayingPayment] = useState<ContractPaymentRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContractRecord | null>(null);
  const [customType, setCustomType] = useState("");
  const [selectedKind, setSelectedKind] = useState("");
  const [expandedContract, setExpandedContract] = useState<number | null>(null);
  const [payments, setPayments] = useState<ContractPaymentRecord[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [tab, setTab] = useState<"contracts" | "ledger" | "reminders">("contracts");
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerContractId, setLedgerContractId] = useState<number | null>(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isManager = currentUser.role === "owner" || currentUser.role === "manager" || currentUser.role === "accountant";
  const brandParam = (() => {
    const b = localStorage.getItem("selectedBrandId");
    return b && b !== "group" ? `?brand_id=${b}` : "";
  })();

  const loadPayments = (cid: number) => apiGet(`/api/hr/contracts/${cid}/payments`).then(setPayments);

  // Build unique contract types list from defaults + existing contracts
  const contractTypes = Array.from(new Set([
    ...DEFAULT_CONTRACT_TYPES,
    ...contracts.map(c => c.kind).filter(k => k && !DEFAULT_CONTRACT_TYPES.includes(k))
  ]));

  useEffect(() => {
    apiGet("/api/hr/contracts").then(setContracts);
    apiGet("/api/hr/contract-reminders").then(setReminders);
    apiGet("/api/branches/").then(setBranches);
  }, []);

  const branchName = (id: number | null) => {
    const b = branches.find(x => x.id === id);
    return b ? (i18n.language === "ar" ? (b.name_ar || b.name) : b.name) : "—";
  };

  useEffect(() => {
    if (editing) setSelectedKind(editing.kind || "");
    else setSelectedKind("");
  }, [editing]);

  const renderPaymentSection = (c: ContractRecord) => (
    <div className="space-y-3">
      {!c.branch_id && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded p-2">
          {t("contract_branch_required")}
        </div>
      )}

      {payingPayment && payingPayment.contract_id === c.id && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!window.confirm(t("confirm_transaction"))) return;
          const fd = new FormData(e.currentTarget);
          fd.append("status", "paid");
          fd.append("amount", String(payingPayment.amount));
          try {
            await apiFetch(`/api/hr/contract-payments/${payingPayment.id}`, { method: "PUT", body: fd });
            setPayingPayment(null);
            loadPayments(c.id);
          } catch (err: unknown) { alert((err as Error).message); }
        }} className="bg-emerald-50 border border-emerald-200 p-4 rounded grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="col-span-2 md:col-span-5 text-sm font-medium">
            {t("mark_paid")}: {payingPayment.due_date} — KD {payingPayment.amount.toFixed(3)}
          </div>
          <div>
            <label className="block text-xs mb-1">{t("paid_date")}</label>
            <input type="date" name="paid_date" required
              defaultValue={payingPayment.paid_date || new Date().toISOString().slice(0, 10)}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1">{t("payment_method")}</label>
            <select name="payment_method" required defaultValue={payingPayment.payment_method || "bank_transfer"}
              className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">{t("select")}</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">{t("reference")}</label>
            <input type="text" name="reference" defaultValue={payingPayment.reference || ""}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1">{t("notes")}</label>
            <input type="text" name="notes" defaultValue={payingPayment.notes || ""}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white rounded text-sm">{t("save")}</button>
            <button type="button" onClick={() => setPayingPayment(null)}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm">{t("cancel")}</button>
          </div>
        </form>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-semibold text-sm">{t("payment_schedule")} — {c.name}</h4>
        <div className="flex gap-2 flex-wrap">
          {payments.length === 0 && c.monthly_payment > 0 && (
            <button onClick={async () => {
              await apiPost(`/api/hr/contracts/${c.id}/generate-payments`, new FormData());
              loadPayments(c.id);
            }} className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">
              {t("generate_schedule")}
            </button>
          )}
          <button onClick={() => setShowPaymentForm(!showPaymentForm)}
            className="px-3 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600">
            {showPaymentForm ? t("cancel") : t("add_payment")}
          </button>
          {payments.length > 0 && (
            <>
              <button onClick={() => apiDownload(`/api/export/contract-payments/excel?contract_id=${c.id}`, `ledger_${c.name}.xlsx`)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">{t("export_excel")}</button>
              <button onClick={() => apiDownload(`/api/export/contract-payments/pdf?contract_id=${c.id}`, `ledger_${c.name}.pdf`)}
                className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">{t("export_pdf")}</button>
            </>
          )}
        </div>
      </div>

      {showPaymentForm && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!window.confirm(t("confirm_transaction"))) return;
          const fd = new FormData(e.currentTarget);
          try {
            await apiFetch(`/api/hr/contracts/${c.id}/payments`, { method: "POST", body: fd });
            setShowPaymentForm(false);
            loadPayments(c.id);
          } catch (err: unknown) { alert((err as Error).message); }
        }} className="bg-white p-4 rounded border grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs mb-1">{t("due_date")}</label>
            <input type="date" name="due_date" required className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1">{t("amount")}</label>
            <input type="number" step="0.001" name="amount" required defaultValue={c.monthly_payment}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1">{t("status")}</label>
            <select name="status" className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="pending">{t("pending")}</option>
              <option value="paid">{t("paid")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">{t("paid_date")}</label>
            <input type="date" name="paid_date" className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1">{t("payment_method")}</label>
            <select name="payment_method" defaultValue="bank_transfer" className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">{t("select")}</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(m)}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white rounded text-sm">{t("save")}</button>
          </div>
        </form>
      )}

      {payments.length > 0 && (
        <div className="flex gap-4 text-sm flex-wrap">
          <span className="text-green-700 font-medium">
            {t("paid")}: KD {payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0).toFixed(3)}
          </span>
          <span className="text-amber-700 font-medium">
            {t("pending")}: KD {payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0).toFixed(3)}
          </span>
          <span className="text-red-700 font-medium">
            {t("overdue")}: KD {payments.filter(p => p.status === "overdue").reduce((s, p) => s + p.amount, 0).toFixed(3)}
          </span>
          <span className="text-gray-700 font-bold">
            {t("total")}: KD {payments.reduce((s, p) => s + p.amount, 0).toFixed(3)}
          </span>
        </div>
      )}

      <table className="w-full text-xs bg-white rounded border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-3 py-2 text-left">{t("due_date")}</th>
            <th className="px-3 py-2 text-right">{t("amount")}</th>
            <th className="px-3 py-2 text-center">{t("status")}</th>
            <th className="px-3 py-2 text-left">{t("paid_date")}</th>
            <th className="px-3 py-2 text-left">{t("payment_method")}</th>
            <th className="px-3 py-2 text-left">{t("reference")}</th>
            <th className="px-3 py-2 text-center">{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">{t("no_payments")}</td></tr>
          ) : payments.map(p => (
            <tr key={p.id} className={`border-t ${p.status === "paid" ? "bg-green-50" : p.status === "overdue" ? "bg-red-50" : ""}`}>
              <td className="px-3 py-2">{p.due_date}</td>
              <td className="px-3 py-2 text-right font-mono">KD {p.amount.toFixed(3)}</td>
              <td className="px-3 py-2 text-center">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  p.status === "paid" ? "bg-green-100 text-green-700" :
                  p.status === "overdue" ? "bg-red-100 text-red-700" :
                  "bg-amber-100 text-amber-700"
                }`}>{t(p.status)}</span>
              </td>
              <td className="px-3 py-2">{p.paid_date || "—"}</td>
              <td className="px-3 py-2">{p.payment_method ? t(p.payment_method) : "—"}</td>
              <td className="px-3 py-2">{p.reference || "—"}</td>
              <td className="px-3 py-2 text-center space-x-1">
                <button onClick={() => setPayingPayment(p)}
                  className={`${p.status === "paid" ? "text-blue-600" : "text-green-600"} hover:underline`}>
                  {p.status === "paid" ? t("edit") : t("mark_paid")}
                </button>
                <button onClick={async () => {
                  if (!confirm(t("confirm_delete"))) return;
                  await apiFetch(`/api/hr/contract-payments/${p.id}`, { method: "DELETE" });
                  loadPayments(c.id);
                }} className="text-red-600 hover:underline">{t("delete")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ledgerContract = contracts.find(c => c.id === ledgerContractId) || null;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">{t("contracts_tab")}</h1>
        <div className="flex gap-2">
          {tab === "contracts" && (
            <>
              <button onClick={() => apiDownload(`/api/export/contracts/excel${brandParam}`, "contracts.xlsx")}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">{t("export_excel")}</button>
              <button onClick={() => apiDownload(`/api/export/contracts/pdf${brandParam}`, "contracts.pdf")}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">{t("export_pdf")}</button>
            </>
          )}
          {isManager && tab === "contracts" && (
            <button onClick={() => { setShowForm(!showForm); setEditing(null); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
              {showForm ? t("cancel") : t("add_contract")}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(["contracts", "ledger", "reminders"] as const).map(tb => (
          <button key={tb} onClick={() => { setTab(tb); setPayments([]); setLedgerContractId(null); setShowPaymentForm(false); if (tb === "reminders") apiGet("/api/hr/contract-reminders").then(setReminders); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === tb ? "bg-white shadow text-emerald-700" : "text-gray-500 hover:text-gray-700"
            }`}>
            {tb === "contracts" ? t("contracts_tab") : tb === "ledger" ? t("payment_ledger") : t("payment_reminders")}
            {tb === "reminders" && reminders.some(r => r.days_remaining <= 7) && (
              <span className="ml-2 inline-block bg-amber-500 text-white text-xs rounded-full px-2">{reminders.filter(r => r.days_remaining <= 7).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ===== REMINDERS TAB ===== */}
      {tab === "reminders" && (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-left">{t("contract_name")}</th>
                <th className="px-3 py-3 text-left">{t("contract_type")}</th>
                <th className="px-3 py-3 text-left">{t("branch")}</th>
                <th className="px-3 py-3 text-left">{t("period")}</th>
                <th className="px-3 py-3 text-right">{t("amount")} (KD)</th>
                <th className="px-3 py-3 text-left">{t("due_date")}</th>
                <th className="px-3 py-3 text-center">{t("days_remaining")}</th>
                <th className="px-3 py-3 text-center">{t("status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reminders.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
              ) : reminders.map(r => {
                const overdue = r.days_remaining < 0;
                const soon = !overdue && r.days_remaining <= 7;
                const rowCls = overdue ? "bg-red-50" : soon ? "bg-amber-50" : "";
                const daysCls = overdue ? "text-red-700 font-bold" : soon ? "text-amber-700 font-bold" : "text-gray-700";
                return (
                  <tr key={`${r.contract_id}-${r.payment_id ?? r.due_date}`} className={rowCls}>
                    <td className="px-3 py-3 font-medium">{r.contract_name}</td>
                    <td className="px-3 py-3">{r.kind ? (CONTRACT_TYPE_KEYS[r.kind] ? t(CONTRACT_TYPE_KEYS[r.kind]) : r.kind) : "—"}</td>
                    <td className="px-3 py-3">{branchName(r.branch_id)}</td>
                    <td className="px-3 py-3 capitalize">{r.period}</td>
                    <td className="px-3 py-3 text-right font-mono">{r.amount.toFixed(3)}</td>
                    <td className="px-3 py-3">{new Date(r.due_date).toLocaleDateString("en-GB")}</td>
                    <td className={`px-3 py-3 text-center ${daysCls}`}>
                      {overdue ? `${Math.abs(r.days_remaining)} ${t("days_overdue")}` : r.days_remaining === 0 ? t("due_today") : `${r.days_remaining} ${t("days")}`}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${overdue ? "bg-red-100 text-red-700" : r.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                        {overdue ? t("overdue") : t(r.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== LEDGER TAB ===== */}
      {tab === "ledger" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <label className="block text-sm font-medium mb-1">{t("search_contract")}</label>
            <input type="text" value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)}
              placeholder={t("search_contract")} className="w-full px-3 py-2 border rounded-lg text-sm" />
            {ledgerSearch && (
              <div className="mt-2 border rounded-lg divide-y max-h-60 overflow-y-auto">
                {contracts.filter(c => c.name.toLowerCase().includes(ledgerSearch.toLowerCase())).length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-400">{t("no_data")}</div>
                ) : contracts.filter(c => c.name.toLowerCase().includes(ledgerSearch.toLowerCase())).map(c => (
                  <button key={c.id} onClick={() => { setLedgerContractId(c.id); setShowPaymentForm(false); loadPayments(c.id); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 ${ledgerContractId === c.id ? "bg-emerald-50 font-medium" : ""}`}>
                    {c.name} <span className="text-gray-400">— {c.kind ? (CONTRACT_TYPE_KEYS[c.kind] ? t(CONTRACT_TYPE_KEYS[c.kind]) : c.kind) : "—"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {ledgerContract ? (
            <div className="bg-white p-4 rounded-xl shadow-sm border">
              {renderPaymentSection(ledgerContract)}
            </div>
          ) : (
            <div className="bg-white p-8 rounded-xl shadow-sm border text-center text-gray-400 text-sm">
              {t("select_contract_ledger")}
            </div>
          )}
        </div>
      )}

      {tab === "contracts" && (<>

      {(showForm || editing) && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          // Inject brand_id from localStorage
          const savedBrand = localStorage.getItem("selectedBrandId");
          if (savedBrand && savedBrand !== "group" && !fd.has("brand_id")) {
            fd.append("brand_id", savedBrand);
          }
          try {
            if (editing) {
              await apiFetch(`/api/hr/contracts/${editing.id}`, { method: "PUT", body: fd });
            } else {
              await apiFetch("/api/hr/contracts", { method: "POST", body: fd });
            }
            setShowForm(false);
            setEditing(null);
            apiGet("/api/hr/contracts").then(setContracts);
          } catch (err: unknown) { alert((err as Error).message); }
        }} className="bg-white p-6 rounded-xl shadow-sm border mb-6 space-y-4">
          <h3 className="font-semibold text-lg">{editing ? t("edit_contract") : t("add_contract")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("contract_name")}</label>
              <input type="text" name="name" defaultValue={editing?.name || ""} required className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("contract_type")}</label>
              <select value={selectedKind} onChange={e => { setSelectedKind(e.target.value); setCustomType(""); }}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">{t("select")}</option>
                {contractTypes.map(k => <option key={k} value={k}>{CONTRACT_TYPE_KEYS[k] ? t(CONTRACT_TYPE_KEYS[k]) : k}</option>)}
                <option value="__custom__">{t("add_new_type")}</option>
              </select>
              {selectedKind === "__custom__" && (
                <input type="text" value={customType} onChange={e => setCustomType(e.target.value)}
                  placeholder={t("enter_new_type")} className="w-full px-3 py-2 border rounded-lg text-sm mt-2" />
              )}
              <input type="hidden" name="kind" value={selectedKind === "__custom__" ? customType : selectedKind} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("branch")}</label>
              <select name="branch_id" required
                defaultValue={editing?.branch_id || branches.find(b => /administration/i.test(b.name))?.id || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">{t("select_branch")}</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name) : b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("contract_period")}</label>
              <select name="period" defaultValue={editing?.period || ""} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">{t("select")}</option>
                <option value="weekly">{t("weekly")}</option>
                <option value="monthly">{t("monthly")}</option>
                <option value="quarterly">{t("quarterly")}</option>
                <option value="half_yearly">{t("half_yearly")}</option>
                <option value="yearly">{t("yearly")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("contract_value")}</label>
              <input type="number" step="0.001" name="value" defaultValue={editing?.value || 0} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("start_date")}</label>
              <input type="date" name="start_date" defaultValue={editing?.start_date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("end_date")}</label>
              <input type="date" name="end_date" defaultValue={editing?.end_date || ""} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("monthly_payment")}</label>
              <input type="number" step="0.001" name="monthly_payment" defaultValue={editing?.monthly_payment || 0} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("payment_day")}</label>
              <input type="number" min="1" max="28" name="payment_day" defaultValue={editing?.payment_day || 1} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("status")}</label>
              <select name="status" defaultValue={editing?.status || "active"} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="active">{t("active")}</option>
                <option value="expired">{t("expired")}</option>
                <option value="cancelled">{t("cancelled")}</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-sm font-medium mb-1">{t("notes")}</label>
              <textarea name="notes" defaultValue={editing?.notes || ""} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm">{t("save")}</button>
            {editing && <button type="button" onClick={() => setEditing(null)} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">{t("cancel")}</button>}
          </div>
        </form>
      )}

      {/* Contracts Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-3 text-left">{t("contract_name")}</th>
              <th className="px-3 py-3 text-left">{t("contract_type")}</th>
              <th className="px-3 py-3 text-left">{t("branch")}</th>
              <th className="px-3 py-3 text-left">{t("contract_period")}</th>
              <th className="px-3 py-3 text-right">{t("contract_value")}</th>
              <th className="px-3 py-3 text-center">{t("status")}</th>
              {isManager && <th className="px-3 py-3 text-center">{t("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr><td colSpan={isManager ? 7 : 6} className="px-4 py-8 text-center text-gray-400">{t("no_data")}</td></tr>
            ) : contracts.map(c => (
              <React.Fragment key={c.id}>
              <tr className="border-b hover:bg-gray-50">
                <td className="px-3 py-3 font-medium">{c.name}</td>
                <td className="px-3 py-3">{c.kind ? (CONTRACT_TYPE_KEYS[c.kind] ? t(CONTRACT_TYPE_KEYS[c.kind]) : c.kind) : "—"}</td>
                <td className="px-3 py-3">{branchName(c.branch_id)}</td>
                <td className="px-3 py-3">{c.period ? t(c.period) : "—"}</td>
                <td className="px-3 py-3 text-right">{c.value}</td>
                <td className="px-3 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    c.status === "active" ? "bg-green-100 text-green-700" :
                    c.status === "expired" ? "bg-gray-100 text-gray-700" :
                    "bg-red-100 text-red-700"
                  }`}>{t(c.status)}</span>
                </td>
                {isManager && (
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => {
                      if (expandedContract === c.id) { setExpandedContract(null); }
                      else { setExpandedContract(c.id); apiGet(`/api/hr/contracts/${c.id}/payments`).then(setPayments); }
                    }} className="text-purple-600 hover:underline text-xs mr-2">{t("payments")}</button>
                    <button onClick={() => { setEditing(c); setShowForm(false); }}
                      className="text-blue-600 hover:underline text-xs mr-2">{t("edit")}</button>
                    <button onClick={async () => {
                      if (!confirm(t("confirm_delete"))) return;
                      await apiFetch(`/api/hr/contracts/${c.id}`, { method: "DELETE" });
                      apiGet("/api/hr/contracts").then(setContracts);
                    }} className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                  </td>
                )}
              </tr>
              {/* Payment tracking expanded row */}
              {expandedContract === c.id && (
                <tr>
                  <td colSpan={isManager ? 7 : 6} className="px-4 py-4 bg-gray-50">
                    {renderPaymentSection(c)}
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
}
