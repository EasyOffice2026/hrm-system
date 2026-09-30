import { useTranslation } from "react-i18next";

export interface DateRange { from: string; to: string }

export const dateRangeParams = (r: DateRange): string[] => {
  const out: string[] = [];
  if (r.from) out.push(`date_from=${r.from}`);
  if (r.to) out.push(`date_to=${r.to}`);
  return out;
};

export default function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-gray-600">{t("from_date")}</label>
      <input type="date" value={value.from} max={value.to || undefined}
        onChange={e => onChange({ ...value, from: e.target.value })}
        className="px-2 py-1.5 border rounded-lg text-sm" />
      <label className="text-xs text-gray-600">{t("to_date")}</label>
      <input type="date" value={value.to} min={value.from || undefined}
        onChange={e => onChange({ ...value, to: e.target.value })}
        className="px-2 py-1.5 border rounded-lg text-sm" />
      {(value.from || value.to) && (
        <button type="button" onClick={() => onChange({ from: "", to: "" })}
          className="text-xs text-red-600 hover:underline">{t("clear")}</button>
      )}
    </div>
  );
}
