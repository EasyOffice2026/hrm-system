import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { dismiss, items, listeners, type ToastItem, type ToastTone } from "./toastStore";

const STYLES: Record<ToastTone, { box: string; Icon: typeof Info }> = {
  error: { box: "border-red-200 bg-red-50 text-red-800", Icon: AlertCircle },
  success: { box: "border-green-200 bg-green-50 text-green-800", Icon: CheckCircle2 },
  info: { box: "border-emerald-200 bg-white text-gray-800", Icon: Info },
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => { listeners.delete(setList); };
  }, []);
  if (!list.length) return null;
  return (
    <div className="fixed bottom-4 end-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none">
      {list.map(({ id, message, tone }) => {
        const { box, Icon } = STYLES[tone];
        return (
          <div key={id} role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg animate-[toast-in_0.2s_ease-out] ${box}`}>
            <Icon size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 break-words">{message}</div>
            <button onClick={() => dismiss(id)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
