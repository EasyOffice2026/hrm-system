import { useTranslation } from "react-i18next";
import { useBrand } from "../contexts/BrandContext";
import type { BrandInfo } from "../contexts/BrandContext";
import { useState } from "react";
import { apiPost, apiFetch } from "../contexts/api";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

export default function BrandManagementPage() {
  const { t } = useTranslation();
  const { brands, refreshBrands } = useBrand();

  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [status, setStatus] = useState("active");

  const startEdit = (b: BrandInfo) => {
    setEditing(b.id);
    setNameEn(b.name_en);
    setNameAr(b.name_ar);
    setStatus(b.status);
    setAdding(false);
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setNameEn("");
    setNameAr("");
    setStatus("active");
  };

  const cancel = () => {
    setEditing(null);
    setAdding(false);
  };

  const save = async () => {
    if (!nameEn.trim()) return;
    const fd = new FormData();
    fd.append("name_en", nameEn.trim());
    fd.append("name_ar", nameAr.trim());
    fd.append("status", status);
    if (editing) {
      await apiFetch(`/api/hr/brands/${editing}`, { method: "PUT", body: fd });
    } else {
      await apiPost("/api/hr/brands", fd);
    }
    cancel();
    await refreshBrands();
  };

  const deleteBrand = async (id: number) => {
    if (!confirm(t("confirm_delete"))) return;
    try {
      const res = await apiFetch(`/api/hr/brands/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.detail || "Cannot delete");
        return;
      }
    } catch {
      alert("Error deleting brand");
      return;
    }
    await refreshBrands();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{t("brand_management")}</h2>
        <button onClick={startAdd}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
          <Plus size={18} /> {t("add_brand")}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("brand_name_en")}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("brand_name_ar")}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("status")}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className="border-t hover:bg-gray-50">
                {editing === b.id ? (
                  <>
                    <td className="px-4 py-2">{b.id}</td>
                    <td className="px-4 py-2">
                      <input value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                        className="border rounded px-2 py-1 w-full" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={nameAr} onChange={(e) => setNameAr(e.target.value)}
                        className="border rounded px-2 py-1 w-full" dir="rtl" />
                    </td>
                    <td className="px-4 py-2">
                      <select value={status} onChange={(e) => setStatus(e.target.value)}
                        className="border rounded px-2 py-1">
                        <option value="active">{t("active")}</option>
                        <option value="inactive">{t("inactive")}</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 flex gap-1">
                      <button onClick={save} className="p-1.5 bg-emerald-100 rounded hover:bg-emerald-200">
                        <Check size={16} className="text-emerald-700" />
                      </button>
                      <button onClick={cancel} className="p-1.5 bg-gray-100 rounded hover:bg-gray-200">
                        <X size={16} className="text-gray-600" />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">{b.id}</td>
                    <td className="px-4 py-3 font-medium">{b.name_en}</td>
                    <td className="px-4 py-3" dir="rtl">{b.name_ar || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${b.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {t(b.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-1">
                      <button onClick={() => startEdit(b)} className="p-1.5 bg-blue-50 rounded hover:bg-blue-100">
                        <Pencil size={14} className="text-blue-600" />
                      </button>
                      <button onClick={() => deleteBrand(b.id)} className="p-1.5 bg-red-50 rounded hover:bg-red-100">
                        <Trash2 size={14} className="text-red-600" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {/* Add new row */}
            {adding && (
              <tr className="border-t bg-emerald-50">
                <td className="px-4 py-2 text-gray-400">{t("new")}</td>
                <td className="px-4 py-2">
                  <input value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                    className="border rounded px-2 py-1 w-full" placeholder="Brand Name" />
                </td>
                <td className="px-4 py-2">
                  <input value={nameAr} onChange={(e) => setNameAr(e.target.value)}
                    className="border rounded px-2 py-1 w-full" dir="rtl" placeholder="اسم العلامة التجارية" />
                </td>
                <td className="px-4 py-2">
                  <select value={status} onChange={(e) => setStatus(e.target.value)}
                    className="border rounded px-2 py-1">
                    <option value="active">{t("active")}</option>
                    <option value="inactive">{t("inactive")}</option>
                  </select>
                </td>
                <td className="px-4 py-2 flex gap-1">
                  <button onClick={save} className="p-1.5 bg-emerald-100 rounded hover:bg-emerald-200">
                    <Check size={16} className="text-emerald-700" />
                  </button>
                  <button onClick={cancel} className="p-1.5 bg-gray-100 rounded hover:bg-gray-200">
                    <X size={16} className="text-gray-600" />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
