import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { Building2, ArrowLeft } from "lucide-react";

interface PublicBrand {
  id: number;
  name_en: string;
  name_ar: string;
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const isAr = i18n.language === "ar";

  const [brands, setBrands] = useState<PublicBrand[]>([]);
  const [step, setStep] = useState<"brand" | "login">("brand");
  const [brand, setBrand] = useState<PublicBrand | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/brands")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PublicBrand[]) => {
        setBrands(data);
        if (data.length === 1) {
          setBrand(data[0]);
          setStep("login");
        }
      })
      .catch(() => setBrands([]));
  }, []);

  const toggleLang = () => {
    const next = i18n.language === "en" ? "ar" : "en";
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  const chooseBrand = (b: PublicBrand) => {
    setBrand(b);
    setError("");
    setStep("login");
  };

  const backToBrands = () => {
    setStep("brand");
    setBrand(null);
    setUsername("");
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(username, password);
      // Resolve which brand to land on. Prefer the chosen brand card if the
      // user is allowed it; otherwise fall back to their first allowed brand.
      const allowed = u.allowed_brands; // null = all brands
      let landing: number | null = brand ? brand.id : null;
      if (allowed && allowed.length > 0) {
        if (landing == null || !allowed.includes(landing)) landing = allowed[0];
      }
      if (landing != null) {
        localStorage.setItem("selectedBrandId", String(landing));
      }
    } catch {
      setError(t("invalid_credentials"));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100">
      <div className="absolute top-4 right-4">
        <button onClick={toggleLang}
          className="px-3 py-1 text-sm bg-white rounded shadow hover:bg-gray-50">
          {i18n.language === "en" ? "العربية" : "English"}
        </button>
      </div>

      {step === "brand" ? (
        <div className="w-full max-w-2xl px-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-600 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold mb-4">
              م
            </div>
            <h1 className="text-2xl font-bold text-gray-800">{t("app_name")}</h1>
            <p className="text-gray-500 mt-1">{t("select_brand_to_login")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {brands.map((b) => (
              <button key={b.id} onClick={() => chooseBrand(b)}
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-emerald-500 p-6 text-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                    <Building2 className="text-emerald-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">
                      {isAr && b.name_ar ? b.name_ar : b.name_en}
                    </h3>
                    {b.name_ar && !isAr && (
                      <p className="text-sm text-gray-400">{b.name_ar}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {brands.length === 0 && (
              <p className="text-center text-gray-400 col-span-full">…</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-600 rounded-full mx-auto flex items-center justify-center text-white mb-4">
              <Building2 size={28} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              {brand ? (isAr && brand.name_ar ? brand.name_ar : brand.name_en) : t("app_name")}
            </h1>
            <p className="text-gray-500">{t("app_subtitle")}</p>
          </div>

          {brands.length > 1 && (
            <button onClick={backToBrands}
              className="mb-4 inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700">
              <ArrowLeft size={16} /> {t("change_brand")}
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("username")}
              </label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("password")}
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition">
              {loading ? "..." : t("login")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
