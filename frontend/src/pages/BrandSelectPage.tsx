import { useTranslation } from "react-i18next";
import { useBrand } from "../contexts/BrandContext";
import type { BrandInfo } from "../contexts/BrandContext";
import { useAuth } from "../contexts/AuthContext";
import { Building2, Plus, Pencil, Trash2, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { apiPost, apiFetch } from "../contexts/api";

export default function BrandSelectPage({ onSelect }: { onSelect: () => void }) {
  const { t, i18n } = useTranslation();
  const { brands, selectBrand, setGroupView, refreshBrands } = useBrand();
  const { user } = useAuth();
  const isAr = i18n.language === "ar";
  const [showAdd, setShowAdd] = useState(false);
  const [editBrand, setEditBrand] = useState<BrandInfo | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");

  useEffect(() => {
    refreshBrands();
  }, [refreshBrands]);

  const handleSelect = (brand: BrandInfo) => {
    selectBrand(brand);
    onSelect();
  };

  const handleGroupView = () => {
    setGroupView(true);
    onSelect();
  };

  const handleSave = async () => {
    if (!nameEn.trim()) return;
    const fd = new FormData();
    fd.append("name_en", nameEn.trim());
    fd.append("name_ar", nameAr.trim());
    if (editBrand) {
      await apiFetch(`/api/hr/brands/${editBrand.id}`, { method: "PUT", body: fd });
    } else {
      await apiPost("/api/hr/brands", fd);
    }
    setShowAdd(false);
    setEditBrand(null);
    setNameEn("");
    setNameAr("");
    await refreshBrands();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("confirm_delete"))) return;
    await apiFetch(`/api/hr/brands/${id}`, { method: "DELETE" });
    await refreshBrands();
  };

  const startEdit = (b: BrandInfo) => {
    setEditBrand(b);
    setNameEn(b.name_en);
    setNameAr(b.name_ar);
    setShowAdd(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <Building2 className="mx-auto text-emerald-600 mb-3" size={48} />
          <h1 className="text-3xl font-bold text-gray-800">{t("select_company")}</h1>
          <p className="text-gray-500 mt-2">{t("select_company_desc")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {brands.map((brand) => (
            <div key={brand.id}
              className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-emerald-500 relative group"
            >
              <div className="p-6" onClick={() => handleSelect(brand)}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Building2 className="text-emerald-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">
                      {isAr && brand.name_ar ? brand.name_ar : brand.name_en}
                    </h3>
                    {brand.name_ar && !isAr && (
                      <p className="text-sm text-gray-400">{brand.name_ar}</p>
                    )}
                  </div>
                </div>
              </div>
              {user?.role === "owner" && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); startEdit(brand); }}
                    className="p-1.5 bg-blue-50 rounded hover:bg-blue-100">
                    <Pencil size={14} className="text-blue-600" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(brand.id); }}
                    className="p-1.5 bg-red-50 rounded hover:bg-red-100">
                    <Trash2 size={14} className="text-red-600" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Group View option for owner/manager */}
          {(user?.role === "owner" || user?.role === "manager") && brands.length > 1 && (
            <div onClick={handleGroupView}
              className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-indigo-500 p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Globe className="text-indigo-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-gray-800">{t("group_view")}</h3>
                  <p className="text-sm text-gray-500">{t("group_view_desc")}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Add brand button (owner only) */}
        {user?.role === "owner" && (
          <div className="mt-6 text-center">
            <button onClick={() => { setShowAdd(true); setEditBrand(null); setNameEn(""); setNameAr(""); }}
              className="btn btn-primary">
              <Plus size={18} /> {t("add_brand")}
            </button>
          </div>
        )}

        {/* Add/Edit modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-emerald-950/45 backdrop-blur-[2px] z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowAdd(false)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto my-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">
                {editBrand ? t("edit_brand") : t("add_brand")}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("brand_name_en")}</label>
                  <input type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Company Name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("brand_name_ar")}</label>
                  <input type="text" value={nameAr} onChange={(e) => setNameAr(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2" dir="rtl" placeholder="اسم الشركة" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={handleSave}
                  className="btn btn-primary flex-1">{t("save")}</button>
                <button onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">{t("cancel")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
