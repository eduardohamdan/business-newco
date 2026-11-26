import Link from "next/link";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { switchOrg } from "./actions";
import { Logo } from "@/components/Logo";

const NAV = [
  { href: "/app", label: "Cockpit" },
  { href: "/app/raio-x", label: "Raio-X" },
  { href: "/app/diagnostico", label: "Diagnóstico" },
  { href: "/app/plano", label: "Plano" },
  { href: "/app/ritual", label: "Ritual" },
  { href: "/app/advisor", label: "Advisor" },
  { href: "/app/relatorios", label: "Relatórios" },
  { href: "/app/configuracoes", label: "Configurações" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/entrar");
  const org = s.orgs.find((o) => o.id === s.orgId);
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-10 border-b border-pauta bg-folha/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/app" aria-label="Ir para o Cockpit">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            {s.orgs.length > 1 ? (
              <form action={switchOrg} className="flex items-center gap-1">
                <select name="orgId" defaultValue={s.orgId ?? ""} className="rounded-lg border border-pauta-forte px-2 py-1 text-sm">
                  {s.orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.trade_name}</option>
                  ))}
                </select>
                <button className="rounded-lg px-2 py-1 text-tinta">Trocar</button>
              </form>
            ) : (
              <span className="max-w-[12rem] truncate text-grafite-2">{org?.trade_name ?? "Sem empresa"}</span>
            )}
            <form action="/sair" method="post">
              <button className="rounded-lg px-2 py-1 text-grafite-3 hover:text-grafite">Sair</button>
            </form>
          </div>
        </div>
        {s.orgId && (
          <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-grafite-2 hover:bg-pauta/60 hover:text-grafite">
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
