import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useBrand } from "../contexts/BrandContext";
import {
  LayoutDashboard, Receipt, Users, LogOut, Menu, X, Banknote, Settings, FileText,
  Building2, ChevronDown, Globe, IdCard, CalendarCheck, HandCoins,
} from "lucide-react";
import { useState } from "react";

const PERSONNEL_NAV = ["dashboard", "hr", "attendance", "renewals", "eos", "cash_management", "expenses"];

const navItems: { path: string; icon: typeof LayoutDashboard; key: string; roles?: string[] }[] = [
  { path: "/", icon: LayoutDashboard, key: "dashboard" },
  { path: "/hr", icon: Users, key: "hr" },
  { path: "/attendance", icon: CalendarCheck, key: "attendance" },
  { path: "/renewals", icon: IdCard, key: "renewals", roles: ["owner", "manager", "accountant", "personnel", "personnel_manager"] },
  { path: "/eos", icon: HandCoins, key: "eos", roles: ["owner", "manager", "accountant", "personnel", "personnel_manager"] },
  { path: "/cash", icon: Banknote, key: "cash_management" },
  { path: "/expenses", icon: Receipt, key: "expenses" },
  { path: "/contracts", icon: FileText, key: "contracts_tab", roles: ["owner", "manager", "accountant"] },
  { path: "/settings", icon: Settings, key: "settings", roles: ["owner", "manager", "accountant"] },
];

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { selectedBrand, isGroupView, brands, selectBrand, setGroupView } = useBrand();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [brandDropdown, setBrandDropdown] = useState(false);
  const isAr = i18n.language === "ar";

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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 z-30 w-64 bg-gradient-to-b from-emerald-700 to-emerald-900
        text-white transform transition-transform md:relative md:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="p-4 pb-2">
          <h1 className="text-xl font-bold">{selectedBrand ? brandLabel : t("app_name")}</h1>
          <p className="text-emerald-200 text-xs mt-0.5">{t("app_subtitle")}</p>
        </div>

        {/* Brand switcher */}
        {brands.length > 0 && (
          <div className="px-3 pb-2 relative">
            <button onClick={() => setBrandDropdown(!brandDropdown)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-emerald-600/60 rounded-lg hover:bg-emerald-600 transition text-sm">
              {isGroupView ? <Globe size={16} /> : <Building2 size={16} />}
              <span className="flex-1 text-left truncate">{brandLabel}</span>
              <ChevronDown size={14} className={`transition ${brandDropdown ? "rotate-180" : ""}`} />
            </button>
            {brandDropdown && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-auto">
                {brands.map((b) => (
                  <button key={b.id}
                    onClick={() => { selectBrand(b); setBrandDropdown(false); navigate("/"); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center gap-2
                      ${selectedBrand?.id === b.id ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"}`}>
                    <Building2 size={14} />
                    {isAr && b.name_ar ? b.name_ar : b.name_en}
                  </button>
                ))}
                {(user?.role === "owner" || user?.role === "manager") && brands.length > 1 && (
                  <button
                    onClick={() => { setGroupView(true); setBrandDropdown(false); navigate("/"); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 border-t
                      ${isGroupView ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700"}`}>
                    <Globe size={14} />
                    {t("group_view")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <nav className="mt-1">
          {navItems
            .filter(item => !item.roles || item.roles.includes(user?.role || ""))
            .filter(item => !["personnel", "personnel_manager"].includes(user?.role || "") || PERSONNEL_NAV.includes(item.key))
            .filter(item => {
              if (user?.role === "owner") return true;
              if (!user?.allowed_tabs) return true;
              const tabKey = item.key === "cash_management" ? "cash" : item.key === "contracts_tab" ? "contracts" : item.key;
              return user.allowed_tabs.includes(tabKey);
            })
            .map(({ path, icon: Icon, key }) => (
            <Link
              key={path}
              to={path}
              onClick={() => { setSidebarOpen(false); setBrandDropdown(false); }}
              className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors
                ${location.pathname === path
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-100 hover:bg-emerald-600/50"}`}
            >
              <Icon size={20} />
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full p-4 border-t border-emerald-600">
          <div className="text-sm text-emerald-200 mb-2">{user?.full_name}</div>
          <div className="flex gap-2">
            <button onClick={toggleLang}
              className="flex-1 py-1.5 text-xs bg-emerald-600 rounded hover:bg-emerald-500 transition">
              {i18n.language === "en" ? t("arabic") : t("english")}
            </button>
            <button onClick={logout}
              className="flex-1 py-1.5 text-xs bg-red-600 rounded hover:bg-red-500 transition flex items-center justify-center gap-1">
              <LogOut size={14} /> {t("logout")}
            </button>
          </div>
        </div>
      </aside>

      {/* Brand dropdown overlay */}
      {brandDropdown && (
        <div className="fixed inset-0 z-20" onClick={() => setBrandDropdown(false)} />
      )}

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center md:hidden">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 className="text-lg font-semibold mx-auto">{selectedBrand ? brandLabel : t("app_name")}</h1>
        </header>

        {/* Group view banner */}
        {isGroupView && (
          <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2 flex items-center gap-2 text-sm text-indigo-700">
            <Globe size={16} />
            <span className="font-medium">{t("group_view")}</span>
            <span className="text-indigo-500">— {t("group_view_banner")}</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet key={selectedBrand?.id ?? (isGroupView ? "group" : "all")} />
        </main>
      </div>
    </div>
  );
}
