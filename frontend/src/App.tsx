import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { BrandProvider, useBrand } from "./contexts/BrandContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import BrandSelectPage from "./pages/BrandSelectPage";
import DashboardPage from "./pages/DashboardPage";
import PersonnelDashboardPage from "./pages/PersonnelDashboardPage";
import ExpensesPage from "./pages/ExpensesPage";
import HRPage from "./pages/HRPage";
import AttendancePage from "./pages/AttendancePage";
import EosPage from "./pages/EosPage";
import CashPage from "./pages/CashPage";
import SettingsPage from "./pages/SettingsPage";
import ContractsPage from "./pages/ContractsPage";
import RenewalsPage from "./pages/RenewalsPage";
import { useState, useEffect } from "react";
import "./i18n";

function ProtectedRoutes() {
  const { user } = useAuth();
  const { selectedBrand, isGroupView, brands, selectBrand } = useBrand();
  const [brandChosen, setBrandChosen] = useState(false);

  // Auto-select if only 1 brand
  useEffect(() => {
    if (brands.length === 1 && !selectedBrand && !isGroupView && !brandChosen) {
      selectBrand(brands[0]);
      setBrandChosen(true);
    }
  }, [brands, selectedBrand, isGroupView, brandChosen, selectBrand]);

  if (!user) return <Navigate to="/login" />;

  // If no brand selected and not group view, show brand selector (multi-brand)
  if (!selectedBrand && !isGroupView && !brandChosen && brands.length > 1) {
    return <BrandSelectPage onSelect={() => setBrandChosen(true)} />;
  }

  const isPersonnel = ["personnel", "personnel_manager"].includes(user?.role || "");
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={isPersonnel ? <PersonnelDashboardPage /> : <DashboardPage />} />
        <Route path="/hr" element={<HRPage key="hr" />} />
        <Route path="/payroll" element={<HRPage key="payroll" mode="payroll" />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/eos" element={<EosPage />} />
        <Route path="/renewals" element={<RenewalsPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/cash" element={<CashPage />} />
        <Route path="/contracts" element={isPersonnel ? <Navigate to="/" /> : <ContractsPage />} />
        <Route path="/settings" element={isPersonnel ? <Navigate to="/" /> : <SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
        <Route path="/brands" element={<BrandSelectPage onSelect={() => setBrandChosen(true)} />} />
      </Route>
    </Routes>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

// Prevents duplicate submissions from double-clicking any form's save button.
function useGlobalSubmitGuard() {
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.submitting === "1") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      form.dataset.submitting = "1";
      const btns = Array.from(
        form.querySelectorAll('button:not([type="button"]):not([type="reset"])')
      ) as HTMLButtonElement[];
      const justDisabled = btns.filter(b => !b.disabled);
      justDisabled.forEach(b => { b.disabled = true; });
      window.setTimeout(() => {
        form.dataset.submitting = "";
        justDisabled.forEach(b => { b.disabled = false; });
      }, 2500);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
}

export default function App() {
  useGlobalSubmitGuard();
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandProvider>
          <AppRoutes />
        </BrandProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
