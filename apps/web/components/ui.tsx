import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-pauta bg-white p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-grafite">{title}</h2>}
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
        <h1 className="text-2xl font-bold tracking-tight text-grafite">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-grafite-2">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const TONES = {
  green: "bg-ritmo-claro text-ritmo ring-tinta/20",
  amber: "bg-atencao-claro text-atencao ring-atencao/20",
  red: "bg-atraso-claro text-atraso ring-atraso/20",
  slate: "bg-pauta/60 text-grafite-2 ring-pauta",
  brand: "bg-tinta-clara text-tinta ring-tinta/20",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "amber" | "red" }) {
  const color = tone === "brand" ? "bg-tinta" : tone === "amber" ? "bg-atencao" : "bg-atraso";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-pauta/60" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Button({ children, variant = "primary", type = "submit", name, value, className = "" }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; type?: "submit" | "button"; name?: string; value?: string; className?: string }) {
  const v = {
    primary: "bg-tinta text-white hover:bg-tinta-escura",
    secondary: "bg-white text-grafite ring-1 ring-pauta-forte hover:bg-papel",
    danger: "bg-atraso text-white hover:bg-atraso/90",
    ghost: "text-tinta hover:underline",
  }[variant];
  return (
    <button type={type} name={name} value={value} className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${v} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const v = variant === "primary" ? "bg-tinta text-white hover:bg-tinta-escura" : "bg-white text-grafite ring-1 ring-pauta-forte hover:bg-papel";
  return (
    <Link href={href} className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${v}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-grafite-2">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-grafite-3">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-pauta-forte bg-white px-3 py-2.5 text-sm focus:border-tinta focus:outline-none focus:ring-2 focus:ring-tinta-clara";

export function Notice({ tone = "brand", children }: { tone?: "brand" | "amber" | "red"; children: ReactNode }) {
  const c = tone === "brand" ? "border-tinta bg-tinta-clara" : tone === "amber" ? "border-atencao bg-atencao-claro" : "border-atraso bg-atraso-claro";
  return <div className={`rounded-xl border-l-4 p-4 text-sm ${c}`}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-pauta-forte bg-white p-8 text-center">
      <h3 className="text-base font-semibold text-grafite">{title}</h3>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-grafite-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** "Por que isso?" — explicabilidade obrigatória (PRD princípio 8 / RF12). */
export function Why({ items, confidence }: { items: ReactNode[]; confidence?: string }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-medium text-tinta">Por que isso?</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-grafite-2">
        {items.map((i, k) => (
          <li key={k}>{i}</li>
        ))}
      </ul>
      {confidence && <p className="mt-2 text-xs text-grafite-3">{confidence}</p>}
    </details>
  );
}

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return <div className="mb-4">{erro ? <Notice tone="red">{erro}</Notice> : <Notice>{ok}</Notice>}</div>;
}
