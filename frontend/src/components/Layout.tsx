import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useBrand } from "../contexts/BrandContext";
import {
  LayoutDashboard, Receipt, Users, LogOut, Menu, X, Banknote, Settings, FileText,
  Building2, ChevronDown, Globe, IdCard, CalendarCheck, HandCoins, Wallet,
  PanelLeftClose, PanelLeftOpen, Languages, ChevronsUpDown, Check,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import { Avatar } from "./ui";

const PERSONNEL_NAV = ["dashboard", "hr", "attendance", "renewals", "eos", "cash_management", "expenses"];

type NavItem = { path: string; icon: typeof LayoutDashboard; key: string; roles?: string[] };
type NavGroup = { key: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { key: "nav_overview", items: [
    { path: "/", icon: LayoutDashboard, key: "dashboard" },
  ]},
  { key: "nav_people", items: [
    { path: "/hr", icon: Users, key: "hr" },
    { path: "/attendance", icon: CalendarCheck, key: "attendance" },
    { path: "/payroll", icon: Wallet, key: "payroll", roles: ["owner", "manager", "accountant"] },
    { path: "/eos", icon: HandCoins, key: "eos", roles: ["owner", "manager", "accountant", "personnel", "personnel_manager"] },
  ]},
  { key: "nav_compliance", items: [
    { path: "/renewals", icon: IdCard, key: "renewals", roles: ["owner", "manager", "accountant", "personnel", "personnel_manager"] },
    { path: "/contracts", icon: FileText, key: "contracts_tab", roles: ["owner", "manager", "accountant"] },
  ]},
  { key: "nav_finance", items: [
    { path: "/cash", icon: Banknote, key: "cash_management" },
    { path: "/expenses", icon: Receipt, key: "expenses" },
  ]},
  { key: "nav_system", items: [
    { path: "/settings", icon: Settings, key: "settings", roles: ["owner", "manager", "accountant"] },
  ]},
];

const COLLAPSE_KEY = "hrm.sidebarCollapsed";

function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);
  return ref;
}

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { selectedBrand, isGroupView, brands, selectBrand, setGroupView } = useBrand();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [brandDropdown, setBrandDropdown] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const isAr = i18n.language === "ar";

  const brandRef = useClickOutside(brandDropdown, () => setBrandDropdown(false));
  const userRef = useClickOutside(userMenu, () => setUserMenu(false));

  const toggleCollapsed = () => {
    setCollapsed(c => { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); return !c; });
  };

  const toggleLang = () => {
    const next = i18n.language === "en" ? "ar" : "en";
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  const brandLabel = isGroupView
    ? t("group_view")
    : selectedBrand
      ? (isAr && selectedBrand.name_ar ? selectedBrand.name_ar : selectedBrand.name_en)
      : t("select_company");

  const visible = (item: NavItem) => {
    if (item.roles && !item.roles.includes(user?.role || "")) return false;
    if (["personnel", "personnel_manager"].includes(user?.role || "") && !PERSONNEL_NAV.includes(item.key)) return false;
    if (user?.role === "owner" || !user?.allowed_tabs) return true;
    const tabKey = item.key === "cash_management" ? "cash" : item.key === "contracts_tab" ? "contracts" : item.key;
    return user.allowed_tabs.includes(tabKey);
  };

  const groups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(visible) }))
    .filter(g => g.items.length > 0);

  const current = groups.flatMap(g => g.items).find(i => i.path === location.pathname);
  const pageTitle = current ? t(current.key) : t("app_subtitle");

  const roleLabel = user?.role ? t(user.role, { defaultValue: user.role }) : "";

  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 start-0 z-30 bg-emerald-950 text-white flex flex-col
        transition-[transform,width] duration-200 ease-out
        md:relative md:translate-x-0 md:rtl:translate-x-0
        ${collapsed ? "md:w-[72px]" : "md:w-64"} w-72
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}
      `}>
        {/* Brand header */}
        <div className={`flex items-center border-b border-white/10 h-16 shrink-0 ${collapsed ? "md:justify-center md:px-0 px-4" : "px-4"}`}>
          <Logo variant="full" height={34} className={collapsed ? "md:hidden" : ""} />
          <Logo variant="mark" height={30} className={collapsed ? "hidden md:block" : "hidden"} />
          <button onClick={() => setSidebarOpen(false)} className="ms-auto md:hidden text-white/70 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Brand switcher */}
        {brands.length > 0 && (
          <div className={`relative pt-3 pb-1 ${collapsed ? "md:px-2 px-3" : "px-3"}`} ref={brandRef}>
            <button onClick={() => setBrandDropdown(!brandDropdown)}
              title={brandLabel}
              className={`w-full flex items-center gap-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition text-sm
                ${collapsed ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2" : "px-3 py-2"}`}>
              <span className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center shrink-0">
                {isGroupView ? <Globe size={14} /> : <Building2 size={14} />}
              </span>
              <span className={`flex-1 text-start truncate leading-tight ${collapsed ? "md:hidden" : ""}`}>
                <span className="block text-[10px] uppercase tracking-wider text-white/50">{t("select_company")}</span>
                <span className="block font-medium truncate">{brandLabel}</span>
              </span>
              <ChevronsUpDown size={14} className={`text-white/50 ${collapsed ? "md:hidden" : ""}`} />
            </button>
            {brandDropdown && (
              <div className="absolute start-3 end-3 md:start-full md:end-auto md:ms-2 md:top-3 md:w-64 top-full mt-1 md:mt-0 bg-white text-gray-800 rounded-xl shadow-xl border z-50 py-1.5 max-h-72 overflow-auto fade-in">
                {brands.map((b) => {
                  const active = !isGroupView && selectedBrand?.id === b.id;
                  return (
                    <button key={b.id}
                      onClick={() => { selectBrand(b); setBrandDropdown(false); navigate("/"); }}
                      className={`w-full text-start px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2.5
                        ${active ? "text-emerald-700 font-medium" : "text-gray-700"}`}>
                      <Building2 size={15} className="text-gray-400" />
                      <span className="flex-1 truncate">{isAr && b.name_ar ? b.name_ar : b.name_en}</span>
                      {active && <Check size={14} />}
                    </button>
                  );
                })}
                {(user?.role === "owner" || user?.role === "manager") && brands.length > 1 && (
                  <button
                    onClick={() => { setGroupView(true); setBrandDropdown(false); navigate("/"); }}
                    className={`w-full text-start px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2.5 border-t mt-1 pt-2.5
                      ${isGroupView ? "text-indigo-700 font-medium" : "text-gray-700"}`}>
                    <Globe size={15} className="text-gray-400" />
                    <span className="flex-1">{t("group_view")}</span>
                    {isGroupView && <Check size={14} />}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-2 ${collapsed ? "md:px-2 px-3" : "px-3"}`}>
          {groups.map(group => (
            <div key={group.key} className="mb-2">
              <p className={`px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 ${collapsed ? "md:hidden" : ""}`}>
                {t(group.key)}
              </p>
              {collapsed && <div className="hidden md:block mx-3 my-2 border-t border-white/10" />}
              {group.items.map(({ path, icon: Icon, key }) => {
                const active = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    title={t(key)}
                    onClick={() => setSidebarOpen(false)}
                    className={`group relative flex items-center gap-3 rounded-lg my-0.5 text-sm font-medium transition-colors
                      ${collapsed ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2" : "px-3 py-2"}
                      ${active
                        ? "bg-white/10 text-white"
                        : "text-white/65 hover:bg-white/5 hover:text-white"}`}
                  >
                    {active && <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-emerald-400" />}
                    <Icon size={18} className={active ? "text-emerald-300" : "text-white/60 group-hover:text-white"} />
                    <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>{t(key)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={`shrink-0 border-t border-white/10 p-3 ${collapsed ? "md:px-2" : ""}`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? "md:justify-center" : ""}`}>
            <Avatar name={user?.full_name || "?"} size={32} />
            <div className={`min-w-0 flex-1 ${collapsed ? "md:hidden" : ""}`}>
              <p className="text-sm font-medium truncate">{user?.full_name}</p>
              <p className="text-[11px] text-white/50 truncate">{roleLabel}</p>
            </div>
            <button onClick={logout} title={t("logout")}
              className={`text-white/50 hover:text-red-300 p-1.5 rounded-md hover:bg-white/5 ${collapsed ? "md:hidden" : ""}`}>
              <LogOut size={16} />
            </button>
          </div>
          <button onClick={toggleCollapsed}
            title={collapsed ? t("expand_sidebar") : t("collapse_sidebar")}
            className="hidden md:flex w-full mt-2 items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-white/50 hover:text-white hover:bg-white/5">
            {collapsed
              ? <PanelLeftOpen size={16} className="rtl:-scale-x-100" />
              : <><PanelLeftClose size={16} className="rtl:-scale-x-100" /><span>{t("collapse_sidebar")}</span></>}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-emerald-950/50 backdrop-blur-[1px] z-20 md:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 shrink-0 bg-white/85 backdrop-blur border-b flex items-center gap-3 px-4 md:px-6">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 -ms-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <Menu size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] md:text-base font-semibold text-gray-900 truncate leading-tight">{pageTitle}</h1>
            <p className="hidden sm:block text-[11px] text-gray-400 truncate">{t("app_name")} · {brandLabel}</p>
          </div>

          <button onClick={toggleLang}
            className="btn btn-secondary !px-2.5 !py-1.5 text-xs gap-1.5">
            <Languages size={15} />
            <span className="hidden sm:inline">{i18n.language === "en" ? t("arabic") : t("english")}</span>
          </button>

          <div className="relative" ref={userRef}>
            <button onClick={() => setUserMenu(v => !v)}
              className="flex items-center gap-2 rounded-lg hover:bg-gray-100 p-1 ps-1 pe-2">
              <Avatar name={user?.full_name || "?"} size={30} />
              <span className="hidden md:block text-start leading-tight">
                <span className="block text-sm font-medium text-gray-800 max-w-[140px] truncate">{user?.full_name}</span>
                <span className="block text-[11px] text-gray-400">{roleLabel}</span>
              </span>
              <ChevronDown size={14} className="text-gray-400 hidden md:block" />
            </button>
            {userMenu && (
              <div className="absolute end-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xl border z-50 py-1.5 fade-in">
                <div className="px-3.5 py-2.5 border-b">
                  <p className="text-[11px] text-gray-400">{t("signed_in_as")}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{user?.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">@{user?.username} · {roleLabel}</p>
                </div>
                <button onClick={() => { setUserMenu(false); toggleLang(); }}
                  className="w-full text-start px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Languages size={15} className="text-gray-400" />
                  {i18n.language === "en" ? t("arabic") : t("english")}
                </button>
                <button onClick={() => { setUserMenu(false); logout(); }}
                  className="w-full text-start px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                  <LogOut size={15} />
                  {t("logout")}
                </button>
              </div>
            )}
          </div>
        </header>

        {isGroupView && (
          <div className="bg-indigo-50 border-b border-indigo-100 px-4 md:px-6 py-2 flex items-center gap-2 text-sm text-indigo-700">
            <Globe size={15} />
            <span className="font-medium">{t("group_view")}</span>
            <span className="text-indigo-500 truncate">— {t("group_view_banner")}</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-[1500px] mx-auto fade-in" key={location.pathname}>
            <Outlet key={selectedBrand?.id ?? (isGroupView ? "group" : "all")} />
          </div>
        </main>
      </div>
    </div>
  );
}
