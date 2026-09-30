import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import Logo from "../components/Logo";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleLang = () => {
    const next = i18n.language === "en" ? "ar" : "en";
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(username, password);
      const allowed = u.allowed_brands; // null = all brands
      const saved = Number(localStorage.getItem("selectedBrandId"));
      if (allowed && allowed.length > 0 && !allowed.includes(saved)) {
        localStorage.setItem("selectedBrandId", String(allowed[0]));
      }
    } catch {
      setError(t("invalid_credentials"));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-700 py-10 px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 w-[36rem] h-[36rem] rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="absolute top-4 right-4">
        <button onClick={toggleLang}
          className="px-3 py-1 text-sm bg-white/10 text-white rounded border border-white/20 hover:bg-white/20">
          {i18n.language === "en" ? "العربية" : "English"}
        </button>
      </div>

      <div className="relative text-center mb-8">
        <Logo height={72} className="mx-auto mb-5 drop-shadow-lg" />
        <p className="text-emerald-100 text-lg font-medium tracking-wide">{t("app_subtitle")}</p>
      </div>

      <div className="relative bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <h2 className="text-xl font-semibold text-gray-800 text-center mb-6">{t("login")}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("username")}
            </label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("password")}
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition">
            {loading ? "..." : t("login")}
          </button>
        </form>
      </div>
      <p className="relative mt-8 text-xs text-emerald-200/70">© {new Date().getFullYear()} {t("app_name")}</p>
    </div>
  );
}
