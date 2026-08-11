import { cx } from "@/lib/util";
import type { CSSProperties, ReactNode } from "react";

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-bold text-slate-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Badge({ children, color }: { children: ReactNode; color: string }) {
  return <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", color)}>{children}</span>;
}

export function Button({ children, variant = "primary", className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-slate-200 text-slate-800 hover:bg-slate-300",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
  } as const;
  return (
    <button {...rest} className={cx("rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50", styles[variant], className)}>
      {children}
    </button>
  );
}

export function Field({ label, children, hint, style, className }: { label: string; children: ReactNode; hint?: string; style?: CSSProperties; className?: string }) {
  return (
    <label className={cx("block", className)} style={style}>
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export const selectCls = inputCls;

export function Msg({ type, children }: { type: "ok" | "err"; children: ReactNode }) {
  return (
    <div className={cx("rounded-lg px-4 py-2.5 text-sm font-semibold", type === "ok" ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700")}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">{children}</div>;
}
