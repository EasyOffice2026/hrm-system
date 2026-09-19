import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiGet, apiFetch } from "../contexts/api";
import BrandManagementPage from "./BrandManagementPage";
import { useAuth } from "../contexts/AuthContext";

interface SmtpConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  has_password: boolean;
}

interface UserItem {
  id: number;
  username: string;
  full_name: string;
  role: string;
  branch_id: number | null;
  is_active: boolean;
  expires_at: string | null;
  last_login_at: string | null;
  login_count: number;
  is_expired: boolean;
  allowed_tabs: string[] | null;
  allowed_brands: number[] | null;
}

interface BranchItem {
  id: number;
  name: string;
  name_ar: string;
  brand_id: number | null;
  is_head_office: boolean;
  is_active: boolean;
}

interface BrandItem {
  id: number;
  name_en: string;
  name_ar: string;
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("HRM System");
  const [useTls, setUseTls] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  // User Management state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [branchesList, setBranchesList] = useState<BranchItem[]>([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [uUsername, setUUsername] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uFullName, setUFullName] = useState("");
  const [uRole, setURole] = useState("staff");
  const [uBranchId, setUBranchId] = useState<string>("");
  const [uAllowedBrands, setUAllowedBrands] = useState<number[]>([]);
  const [uExpiresAt, setUExpiresAt] = useState("");
  const [uMsg, setUMsg] = useState("");
  const [uMsgType, setUMsgType] = useState<"success" | "error">("success");

  // Branch Management state
  const [brandsList, setBrandsList] = useState<BrandItem[]>([]);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchItem | null>(null);
  const [brName, setBrName] = useState("");
  const [brNameAr, setBrNameAr] = useState("");
  const [brBrandId, setBrBrandId] = useState<string>("");
  const [brIsHO, setBrIsHO] = useState(false);
  const [brMsg, setBrMsg] = useState("");
  const [brMsgType, setBrMsgType] = useState<"success" | "error">("success");

  const loadBranches = () => {
    apiGet("/api/branches/?brand_id=0").then((data) => {
      if (Array.isArray(data)) setBranchesList(data);
    });
  };

  const loadUsers = () => {
    apiGet("/api/users/").then((data) => {
      if (Array.isArray(data)) setUsers(data);
    });
  };

  useEffect(() => {
    apiGet("/api/email/smtp-settings").then((data: SmtpConfig | null) => {
      if (data) {
        setHost(data.smtp_host);
        setPort(String(data.smtp_port));
        setUser(data.smtp_user);
        setFromEmail(data.from_email);
        setFromName(data.from_name);
        setUseTls(data.use_tls);
        setHasPassword(data.has_password);
      }
    });
    loadUsers();
    loadBranches();
    apiGet("/api/hr/brands").then((data) => {
      if (Array.isArray(data)) setBrandsList(data);
    });
  }, []);

  const showMsg = (text: string, type: "success" | "error") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 5000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new URLSearchParams();
      fd.append("smtp_host", host);
      fd.append("smtp_port", port);
      fd.append("smtp_user", user);
      if (password) fd.append("smtp_password", password);
      fd.append("from_email", fromEmail);
      fd.append("from_name", fromName);
      fd.append("use_tls", String(useTls));
      const res = await fetch("/api/email/smtp-settings", {
        method: "POST",
        body: fd,
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to save");
      setHasPassword(true);
      setPassword("");
      showMsg(t("smtp_saved"), "success");
    } catch {
      showMsg(t("smtp_save_error"), "error");
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Test failed");
      showMsg(data.message, "success");
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(err.message || t("smtp_test_error"), "error");
    }
    setTesting(false);
  };

  const resetUserForm = () => {
    setUUsername("");
    setUPassword("");
    setUFullName("");
    setURole("staff");
    setUBranchId("");
    setUAllowedBrands([]);
    setUExpiresAt("");
    setEditingUser(null);
    setShowUserForm(false);
  };

  const handleEditUser = (u: UserItem) => {
    setEditingUser(u);
    setUUsername(u.username);
    setUFullName(u.full_name);
    setURole(u.role);
    setUBranchId(u.branch_id ? String(u.branch_id) : "");
    setUAllowedBrands(u.allowed_brands || []);
    setUExpiresAt(u.expires_at ? u.expires_at.slice(0, 10) : "");
    setUPassword("");
    setShowUserForm(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new URLSearchParams();
    fd.append("username", uUsername);
    fd.append("full_name", uFullName);
    fd.append("role", uRole);
    if (uPassword) fd.append("password", uPassword);
    fd.append("branch_id", uRole === "staff" ? (uBranchId || "") : "");
    fd.append("allowed_brands", uAllowedBrands.join(","));
    fd.append("expires_at", uExpiresAt ? `${uExpiresAt}T23:59:59+00:00` : "");

    try {
      if (editingUser) {
        const res = await apiFetch(`/api/users/${editingUser.id}`, { method: "PUT", body: fd });
        if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Error"); }
        setUMsg(t("user_updated")); setUMsgType("success");
      } else {
        if (!uPassword) { setUMsg("Password required"); setUMsgType("error"); setTimeout(() => setUMsg(""), 4000); return; }
        const res = await apiFetch("/api/users/", { method: "POST", body: fd });
        if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Error"); }
        setUMsg(t("user_created")); setUMsgType("success");
      }
      loadUsers();
      resetUserForm();
    } catch (err: unknown) {
      setUMsg((err as Error).message || t("user_create_error"));
      setUMsgType("error");
    }
    setTimeout(() => setUMsg(""), 5000);
  };

  const handleDeleteUser = async (uid: number) => {
    if (!confirm(t("confirm_delete_user"))) return;
    try {
      const res = await apiFetch(`/api/users/${uid}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Error"); }
      setUMsg(t("user_deleted")); setUMsgType("success");
      loadUsers();
    } catch (err: unknown) {
      setUMsg((err as Error).message || t("user_delete_error"));
      setUMsgType("error");
    }
    setTimeout(() => setUMsg(""), 5000);
  };

  const getBranchName = (bid: number | null) => {
    if (!bid) return t("no_branch");
    const b = branchesList.find(x => x.id === bid);
    return b ? (i18n.language === "ar" ? (b.name_ar || b.name) : b.name) : "-";
  };

  const getBrandName = (bid: number | null) => {
    if (!bid) return "—";
    const b = brandsList.find(x => x.id === bid);
    return b ? (i18n.language === "ar" ? (b.name_ar || b.name_en) : b.name_en) : "—";
  };

  const resetBranchForm = () => {
    setBrName(""); setBrNameAr(""); setBrBrandId(""); setBrIsHO(false);
    setEditingBranch(null); setShowBranchForm(false);
  };

  const handleEditBranch = (b: BranchItem) => {
    setEditingBranch(b);
    setBrName(b.name);
    setBrNameAr(b.name_ar);
    setBrBrandId(b.brand_id ? String(b.brand_id) : "");
    setBrIsHO(b.is_head_office);
    setShowBranchForm(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new URLSearchParams();
    fd.append("name", brName);
    fd.append("name_ar", brNameAr);
    fd.append("is_head_office", String(brIsHO));
    if (brBrandId) fd.append("brand_id", brBrandId);
    try {
      if (editingBranch) {
        const res = await apiFetch(`/api/branches/${editingBranch.id}`, { method: "PUT", body: fd });
        if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Error"); }
        setBrMsg(t("saved")); setBrMsgType("success");
      } else {
        const res = await apiFetch("/api/branches/", { method: "POST", body: fd });
        if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Error"); }
        setBrMsg(t("saved")); setBrMsgType("success");
      }
      loadBranches();
      resetBranchForm();
    } catch (err: unknown) {
      setBrMsg((err as Error).message); setBrMsgType("error");
    }
    setTimeout(() => setBrMsg(""), 5000);
  };

  const handleDeleteBranch = async (bid: number) => {
    if (!confirm(t("confirm_delete"))) return;
    try {
      const res = await apiFetch(`/api/branches/${bid}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Error"); }
      setBrMsg(t("deleted")); setBrMsgType("success");
      loadBranches();
    } catch (err: unknown) {
      setBrMsg((err as Error).message); setBrMsgType("error");
    }
    setTimeout(() => setBrMsg(""), 5000);
  };

  const currentUser = useAuth().user;

  // Permissions management
  const ALL_MAIN_TABS = [
    { key: "dashboard", label: "tab_dashboard" },
    { key: "expenses", label: "tab_expenses" },
    { key: "hr", label: "tab_hr" },
    { key: "cash", label: "tab_cash" },
    { key: "renewals", label: "renewals" },
    { key: "eos", label: "eos" },
    { key: "contracts", label: "tab_contracts" },
  ];
  const ALL_HR_TABS = [
    { key: "hr_employees", label: "tab_hr_employees" },
    { key: "hr_salary", label: "tab_hr_salary" },
    { key: "hr_transfers", label: "tab_hr_transfers" },
    { key: "hr_loans", label: "tab_hr_loans" },
    { key: "hr_benefits", label: "tab_hr_benefits" },
    { key: "hr_deductions", label: "tab_hr_deductions" },
    { key: "hr_leaves", label: "tab_hr_leaves" },
  ];
  const ALL_TABS = [...ALL_MAIN_TABS, ...ALL_HR_TABS];
  const ALL_TAB_KEYS = ALL_TABS.map(t => t.key);

  const [permEditing, setPermEditing] = useState<number | null>(null);
  const [permTabs, setPermTabs] = useState<string[]>([]);
  const [permAllAccess, setPermAllAccess] = useState(true);
  const [permMsg, setPermMsg] = useState("");
  const [permMsgType, setPermMsgType] = useState<"success" | "error">("success");
  const [permSaving, setPermSaving] = useState(false);

  const startEditPerm = (u: UserItem) => {
    setPermEditing(u.id);
    if (!u.allowed_tabs) {
      setPermAllAccess(true);
      setPermTabs([...ALL_TAB_KEYS]);
    } else {
      setPermAllAccess(false);
      setPermTabs([...u.allowed_tabs]);
    }
  };

  const togglePermTab = (key: string) => {
    setPermTabs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setPermAllAccess(false);
  };

  const togglePermAllAccess = () => {
    if (permAllAccess) {
      setPermAllAccess(false);
      setPermTabs([]);
    } else {
      setPermAllAccess(true);
      setPermTabs([...ALL_TAB_KEYS]);
    }
  };

  const savePerm = async (userId: number) => {
    setPermSaving(true);
    try {
      const body = permAllAccess ? { allowed_tabs: null } : { allowed_tabs: permTabs };
      const res = await apiFetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      setPermMsg(t("permissions_saved")); setPermMsgType("success");
      loadUsers();
      setPermEditing(null);
    } catch {
      setPermMsg(t("permissions_error")); setPermMsgType("error");
    }
    setPermSaving(false);
    setTimeout(() => setPermMsg(""), 5000);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6"><div className="hidden sm:flex w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-700 items-center justify-center shrink-0"><Settings size={20} /></div><h2 className="page-title">{t("settings")}</h2></div>

      {/* Brand Management (owner only) */}
      {currentUser?.role === "owner" && (
        <div className="mb-6">
          <BrandManagementPage />
        </div>
      )}

      {/* Branch Management (owner, manager, accountant) */}
      {["owner", "manager", "accountant"].includes(currentUser?.role || "") && (
        <div className="card p-5 max-w-4xl mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">{t("branch_management")}</h3>
              <p className="text-sm text-gray-500">{t("branch_management_desc")}</p>
            </div>
            <button onClick={() => { resetBranchForm(); setShowBranchForm(true); }}
              className="btn btn-primary">
              + {t("add_branch")}
            </button>
          </div>

          {brMsg && (
            <div className={`p-3 rounded mb-4 text-sm ${
              brMsgType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>{brMsg}</div>
          )}

          {showBranchForm && (
            <form onSubmit={handleSaveBranch} className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("branch_name_en")}</label>
                  <input value={brName} onChange={e => setBrName(e.target.value)} required
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Branch Name" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("branch_name_ar")}</label>
                  <input value={brNameAr} onChange={e => setBrNameAr(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" dir="rtl" placeholder="اسم الفرع" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("brand")}</label>
                  <select value={brBrandId} onChange={e => setBrBrandId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- {t("select_brand")} --</option>
                    {brandsList.map(b => (
                      <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name_en) : b.name_en}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={brIsHO} onChange={e => setBrIsHO(e.target.checked)} />
                    {t("head_office")}
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit"
                  className="btn btn-primary">
                  {editingBranch ? t("save") : t("add_branch")}
                </button>
                <button type="button" onClick={resetBranchForm}
                  className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
                  {t("cancel")}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">{t("branch_name_en")}</th>
                  <th className="px-3 py-2 text-left">{t("branch_name_ar")}</th>
                  <th className="px-3 py-2 text-left">{t("brand")}</th>
                  <th className="px-3 py-2 text-left">{t("head_office")}</th>
                  <th className="px-3 py-2 text-left">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {branchesList.map(b => (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{b.name}</td>
                    <td className="px-3 py-2" dir="rtl">{b.name_ar || "—"}</td>
                    <td className="px-3 py-2">{getBrandName(b.brand_id)}</td>
                    <td className="px-3 py-2">
                      {b.is_head_office ? <span className="text-green-600 text-xs font-medium">✓</span> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleEditBranch(b)}
                        className="text-blue-600 hover:underline text-xs mr-3">{t("edit")}</button>
                      <button onClick={() => handleDeleteBranch(b.id)}
                        className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Management */}
      <div className="card p-5 max-w-4xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{t("user_management")}</h3>
            <p className="text-sm text-gray-500">{t("user_management_desc")}</p>
          </div>
          <button onClick={() => { resetUserForm(); setShowUserForm(true); }}
            className="btn btn-primary">
            + {t("add_user")}
          </button>
        </div>

        {uMsg && (
          <div className={`p-3 rounded mb-4 text-sm ${
            uMsgType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>{uMsg}</div>
        )}

        {showUserForm && (
          <form onSubmit={handleSaveUser} className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t("username")}</label>
                <input value={uUsername} onChange={e => setUUsername(e.target.value)} required
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="username" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {editingUser ? t("new_password") : t("password")}
                </label>
                <input type="password" value={uPassword} onChange={e => setUPassword(e.target.value)}
                  required={!editingUser}
                  placeholder={editingUser ? t("leave_blank_password") : t("password")}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("full_name")}</label>
                <input value={uFullName} onChange={e => setUFullName(e.target.value)} required
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Full Name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("role")}</label>
                <select value={uRole} onChange={e => setURole(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="owner">{t("owner")}</option>
                  <option value="manager">{t("manager")}</option>
                  <option value="accountant">{t("accountant")}</option>
                  <option value="staff">{t("staff")}</option>
                  <option value="personnel">{t("personnel")}</option>
                  <option value="personnel_manager">{t("personnel_manager")}</option>
                </select>
              </div>
              {uRole === "staff" && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t("branch")}</label>
                  <select value={uBranchId} onChange={e => setUBranchId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- {t("branch")} --</option>
                    {branchesList.map(b => (
                      <option key={b.id} value={b.id}>{i18n.language === "ar" ? (b.name_ar || b.name) : b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("brand_access")}</label>
              <p className="text-xs text-gray-500 mb-2">{t("brand_access_hint")}</p>
              <div className="flex flex-wrap gap-3">
                {brandsList.map(b => (
                  <label key={b.id} className="inline-flex items-center gap-2 text-sm bg-white border rounded-lg px-3 py-1.5 cursor-pointer">
                    <input type="checkbox"
                      checked={uAllowedBrands.includes(b.id)}
                      onChange={e => setUAllowedBrands(prev =>
                        e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                    />
                    {i18n.language === "ar" && b.name_ar ? b.name_ar : b.name_en}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("access_expires")}</label>
              <input type="date" value={uExpiresAt} onChange={e => setUExpiresAt(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm" />
              <p className="text-xs text-gray-500 mt-1">{t("access_expires_hint")}</p>
            </div>
            <div className="flex gap-2">
              <button type="submit"
                className="btn btn-primary">
                {editingUser ? t("save") : t("add_user")}
              </button>
              <button type="button" onClick={resetUserForm}
                className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
                {t("cancel")}
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">{t("username")}</th>
                <th className="px-3 py-2 text-left">{t("full_name")}</th>
                <th className="px-3 py-2 text-left">{t("role")}</th>
                <th className="px-3 py-2 text-left">{t("branch")}</th>
                <th className="px-3 py-2 text-left">{t("status")}</th>
                <th className="px-3 py-2 text-left">{t("access_expires")}</th>
                <th className="px-3 py-2 text-left">{t("last_login")}</th>
                <th className="px-3 py-2 text-left">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className="px-3 py-2">{u.full_name}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      u.role === "owner" ? "bg-purple-100 text-purple-700" :
                      u.role === "manager" ? "bg-blue-100 text-blue-700" :
                      u.role === "accountant" ? "bg-emerald-100 text-emerald-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>{t(u.role)}</span>
                  </td>
                  <td className="px-3 py-2">{getBranchName(u.branch_id)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>{u.is_active ? t("active") : t("inactive")}</span>
                  </td>
                  <td className="px-3 py-2">
                    {u.expires_at ? (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        u.is_expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>{u.is_expired ? t("expired") : u.expires_at.slice(0, 10)}</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                    {u.last_login_at
                      ? `${new Date(u.last_login_at + (u.last_login_at.endsWith("Z") ? "" : "Z")).toLocaleString()} (${u.login_count})`
                      : t("never_logged_in")}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => handleEditUser(u)}
                      className="text-blue-600 hover:underline text-xs mr-3">{t("edit")}</button>
                    <button onClick={() => handleDeleteUser(u.id)}
                      className="text-red-600 hover:underline text-xs">{t("delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Permissions (owner only) */}
      {currentUser?.role === "owner" && (
        <div className="card p-5 max-w-5xl mb-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">{t("user_permissions")}</h3>
            <p className="text-sm text-gray-500">{t("user_permissions_desc")}</p>
          </div>

          {permMsg && (
            <div className={`p-3 rounded mb-4 text-sm ${
              permMsgType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>{permMsg}</div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">{t("username")}</th>
                  <th className="px-3 py-2 text-left">{t("full_name")}</th>
                  <th className="px-3 py-2 text-left">{t("role")}</th>
                  <th className="px-3 py-2 text-left">{t("status")}</th>
                  <th className="px-3 py-2 text-left">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.filter(u => u.role !== "owner").map(u => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{u.username}</td>
                    <td className="px-3 py-2">{u.full_name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        u.role === "manager" ? "bg-blue-100 text-blue-700" :
                        u.role === "accountant" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{t(u.role)}</span>
                    </td>
                    <td className="px-3 py-2">
                      {u.allowed_tabs ? (
                        <span className="text-xs text-orange-600">{u.allowed_tabs.length} tabs</span>
                      ) : (
                        <span className="text-xs text-green-600">{t("all_access")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => permEditing === u.id ? setPermEditing(null) : startEditPerm(u)}
                        className="text-blue-600 hover:underline text-xs">
                        {permEditing === u.id ? t("cancel") : t("edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {permEditing && (() => {
            const editUser = users.find(u => u.id === permEditing);
            if (!editUser) return null;
            return (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-sm">
                    {editUser.full_name} ({editUser.username})
                  </h4>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={permAllAccess} onChange={togglePermAllAccess}
                      className="rounded" />
                    {t("all_access")}
                  </label>
                </div>

                {!permAllAccess && (
                  <>
                    <p className="text-xs text-gray-500 mb-2 font-medium">{t("dashboard")}</p>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {ALL_MAIN_TABS.map(tab => (
                        <label key={tab.key} className="flex items-center gap-2 text-sm bg-white px-3 py-2 rounded border cursor-pointer hover:bg-emerald-50">
                          <input type="checkbox" checked={permTabs.includes(tab.key)}
                            onChange={() => togglePermTab(tab.key)} className="rounded" />
                          {t(tab.label)}
                        </label>
                      ))}
                    </div>

                    <p className="text-xs text-gray-500 mb-2 font-medium">{t("hr")} Sub-Tabs</p>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {ALL_HR_TABS.map(tab => (
                        <label key={tab.key} className="flex items-center gap-2 text-sm bg-white px-3 py-2 rounded border cursor-pointer hover:bg-emerald-50">
                          <input type="checkbox" checked={permTabs.includes(tab.key)}
                            onChange={() => togglePermTab(tab.key)} className="rounded" />
                          {t(tab.label)}
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <button onClick={() => savePerm(permEditing)} disabled={permSaving}
                  className="btn btn-primary">
                  {permSaving ? "..." : t("save_permissions")}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      <div className="card p-5 max-w-2xl">
        <h3 className="text-lg font-semibold mb-4">{t("email_settings")}</h3>
        <p className="text-sm text-gray-500 mb-4">{t("smtp_description")}</p>

        {msg && (
          <div className={`p-3 rounded mb-4 text-sm ${
            msgType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>{msg}</div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("smtp_host")}</label>
              <input value={host} onChange={e => setHost(e.target.value)} required
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("smtp_port")}</label>
              <input type="number" value={port} onChange={e => setPort(e.target.value)} required
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("smtp_user")}</label>
              <input value={user} onChange={e => setUser(e.target.value)} required
                placeholder="your@gmail.com"
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("smtp_password")} {hasPassword && <span className="text-green-600 text-xs">({t("configured")})</span>}
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={hasPassword ? t("leave_blank_keep") : t("smtp_password")}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("from_email")}</label>
              <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} required
                placeholder="noreply@restaurant.com"
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("from_name")}</label>
              <input value={fromName} onChange={e => setFromName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="use_tls" checked={useTls} onChange={e => setUseTls(e.target.checked)} />
            <label htmlFor="use_tls" className="text-sm">{t("use_tls")}</label>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="btn btn-primary">
              {saving ? "..." : t("save")}
            </button>
            <button type="button" onClick={handleTest} disabled={testing || !hasPassword}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
              {testing ? "..." : t("test_email")}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <h4 className="font-medium text-amber-800 text-sm mb-2">{t("gmail_setup_title")}</h4>
          <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
            <li>{t("gmail_step1")}</li>
            <li>{t("gmail_step2")}</li>
            <li>{t("gmail_step3")}</li>
            <li>{t("gmail_step4")}</li>
          </ol>
        </div>
      </div>

    </div>
  );
}
