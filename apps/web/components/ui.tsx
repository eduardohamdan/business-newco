import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-navy">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand ring-emerald-200",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "amber" | "red" }) {
  const color = tone === "brand" ? "bg-brand" : tone === "amber" ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Button({ children, variant = "primary", type = "submit", name, value, className = "" }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; type?: "submit" | "button"; name?: string; value?: string; className?: string }) {
  const v = {
    primary: "bg-brand text-white hover:bg-emerald-800",
    secondary: "bg-white text-navy ring-1 ring-slate-300 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-brand hover:underline",
  }[variant];
  return (
    <button type={type} name={name} value={value} className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${v} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const v = variant === "primary" ? "bg-brand text-white hover:bg-emerald-800" : "bg-white text-navy ring-1 ring-slate-300 hover:bg-slate-50";
  return (
    <Link href={href} className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${v}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-emerald-100";

export function Notice({ tone = "brand", children }: { tone?: "brand" | "amber" | "red"; children: ReactNode }) {
  const c = tone === "brand" ? "border-brand bg-brand-50" : tone === "amber" ? "border-amber-500 bg-amber-soft" : "border-red-500 bg-red-soft";
  return <div className={`rounded-xl border-l-4 p-4 text-sm ${c}`}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h3 className="text-base font-semibold text-navy">{title}</h3>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** "Por que isso?" — explicabilidade obrigatória (PRD princípio 8 / RF12). */
export function Why({ items, confidence }: { items: ReactNode[]; confidence?: string }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-medium text-brand">Por que isso?</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
        {items.map((i, k) => (
          <li key={k}>{i}</li>
        ))}
      </ul>
      {confidence && <p className="mt-2 text-xs text-slate-500">{confidence}</p>}
    </details>
  );
}

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return <div className="mb-4">{erro ? <Notice tone="red">{erro}</Notice> : <Notice>{ok}</Notice>}</div>;
}
