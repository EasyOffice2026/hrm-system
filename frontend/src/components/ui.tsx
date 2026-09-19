import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

export function PageHeader({ title, subtitle, actions, icon: Icon }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-700 items-center justify-center shrink-0">
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="page-title truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, actions, padded = true }: {
  children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b">
          {title && <h3 className="font-semibold text-gray-800 text-[15px]">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const TONES = {
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  purple: "bg-purple-50 text-purple-700",
  navy: "bg-emerald-50 text-emerald-700",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "gray", dot = false, className = "" }: {
  children: ReactNode; tone?: Tone; dot?: boolean; className?: string;
}) {
  return (
    <span className={`badge ${TONES[tone]} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "navy", hint, onClick }: {
  label: string; value: ReactNode; icon: LucideIcon; tone?: Tone; hint?: ReactNode; onClick?: () => void;
}) {
  const iconTone: Record<Tone, string> = {
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
    navy: "bg-emerald-50 text-emerald-700",
  };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick}
      className={`card p-4 text-start flex items-start gap-3 w-full ${onClick ? "hover:shadow-md hover:-translate-y-px transition" : ""}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconTone[tone]}`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums leading-tight">{value}</p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{hint}</p>}
      </div>
    </Comp>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: {
  title: string; description?: string; icon?: LucideIcon; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
        <Icon size={22} />
      </div>
      <p className="font-medium text-gray-700">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function StatGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 flex gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 32, className = "" }: { name: string; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = ["bg-emerald-600", "bg-blue-600", "bg-purple-600", "bg-rose-600", "bg-amber-600", "bg-teal-600", "bg-indigo-600"];
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 ${hues[hash % hues.length]} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}>
      {initials || "?"}
    </span>
  );
}
