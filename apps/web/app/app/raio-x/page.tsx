import { getCategory, getMetric } from "@beos/method";
import { formatBRL } from "@beos/core";
import { repo, withTenant } from "@beos/db";
import { Badge, Button, Card, Flash, Notice, PageTitle } from "@/components/ui";
import { formatDate, formatMetric } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { uploadStatementAction } from "../actions";

export const metadata = { title: "Raio-X de Caixa" };

const STATUS: Record<string, { t: string; tone: "green" | "amber" | "red" | "slate" }> = {
  uploaded: { t: "Na fila", tone: "slate" }, processing: { t: "Processando", tone: "amber" }, processed: { t: "Processado", tone: "green" },
  failed: { t: "Falhou", tone: "red" }, blocked: { t: "Saldos não conferem", tone: "red" },
};

export default async function RaioXPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireOrg();
  const { ok, erro } = await searchParams;
  const { rx, docs, review } = await withTenant(s.orgId, async (db) => ({
    rx: await repo.latestRaioX(db),
    docs: await repo.listDocuments(db, "bank_statement"),
    review: (await repo.listTransactions(db, { needsReview: true, limit: 500 })).length,
  }));
  const r = rx?.result;
  return (
    <>
      <PageTitle title="Raio-X de Caixa" subtitle="O extrato da conta PJ vira um retrato do negócio. Todos os números são calculados pelo sistema." />
      <Flash ok={ok} erro={erro} />
      <Card title="Enviar extrato" className="mb-4">
        <form action={uploadStatementAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="file" name="file" accept=".ofx,.csv,.txt,.pdf" required className="text-sm" />
          <Button>Gerar Raio-X</Button>
        </form>
        <p className="mt-2 text-xs text-grafite-3">De 3 a 6 meses, em OFX (recomendado), CSV ou PDF. CPFs de terceiros são mascarados automaticamente.</p>
        {docs.length > 0 && (
          <ul className="mt-3 divide-y divide-pauta text-sm">
            {docs.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <span className="truncate">{d.filename} <span className="text-grafite-3">· {formatDate(d.created_at)}</span></span>
                <span className="flex items-center gap-2">{d.error && <span className="hidden text-xs text-atraso sm:inline">{d.error}</span>}<Badge tone={STATUS[d.status]?.tone}>{STATUS[d.status]?.t}</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {r && (
        <>
          {rx!.narrative && <div className="mb-4"><Notice>{rx!.narrative}</Notice></div>}
          {r.coverage.reconcileStatus === "unverifiable" && (
            <div className="mb-4"><Notice tone="amber">O arquivo não trouxe saldos, então não deu para conferir os totais. Prefira OFX para mais precisão.</Notice></div>
          )}
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            {r.highlights.map((h: any) => (
              <Card key={h.code} title={h.title} actions={<Badge tone={h.severity === 3 ? "red" : h.severity === 2 ? "amber" : "green"}>{h.severity === 3 ? "Crítico" : h.severity === 2 ? "Atenção" : "Ok"}</Badge>}>
                <p className="text-sm text-grafite-2">{h.detail}</p>
              </Card>
            ))}
          </div>
          <Card title="Indicadores" className="mb-4" actions={review > 0 ? <a className="text-sm text-tinta" href="/app/raio-x/lancamentos">Revisar {review} lançamentos</a> : undefined}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(r.metrics).map(([k, m]: [string, any]) => (
                <div key={k}>
                  <div className="text-xs text-grafite-3">{getMetric(k).name}</div>
                  <div className="text-lg font-semibold text-grafite">{formatMetric(k, m.value)}</div>
                  <div className="text-[11px] leading-tight text-grafite-3">{m.formula}</div>
                </div>
              ))}
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Mês a mês">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-grafite-3"><th className="py-1">Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th></tr></thead>
                <tbody>
                  {r.months.map((m: any) => (
                    <tr key={m.month} className="border-t border-pauta">
                      <td className="py-1.5">{m.month}</td><td>{formatBRL(m.inflowCents)}</td><td>{formatBRL(m.outflowCents)}</td>
                      <td className={m.netCents < 0 ? "font-semibold text-atraso" : "font-semibold text-ritmo"}>{formatBRL(m.netCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Para onde vai o dinheiro">
              <ul className="space-y-1.5 text-sm">
                {r.byCategory.filter((c: any) => c.totalCents < 0).slice(0, 8).map((c: any) => (
                  <li key={c.categoryCode} className="flex justify-between"><span>{safeName(c.categoryCode)}</span><span className="font-medium">{formatBRL(-c.totalCents)}</span></li>
                ))}
              </ul>
            </Card>
          </div>
          <p className="mt-3 text-xs text-grafite-3">
            Período: {formatDate(r.periodStart)} a {formatDate(r.periodEnd)} · {r.coverage.categorizedValuePct}% do valor classificado com segurança · método {rx!.method_version}
          </p>
        </>
      )}
    </>
  );
}

function safeName(code: string) {
  try {
    return getCategory(code).name;
  } catch {
    return code;
  }
}
