import { cycleWeek } from "@beos/core";
import { getTrack } from "@beos/method";
import { repo, withTenant } from "@beos/db";
import { Badge, Button, Card, Empty, Flash, inputCls, LinkButton, PageTitle, Why } from "@/components/ui";
import { formatDate, formatMetric } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { closeCycleAction, replacePriorityAction, setActionStatusAction } from "../actions";

export const metadata = { title: "Plano de 90 dias" };

const ST: Record<string, { t: string; tone: "green" | "amber" | "red" | "slate" }> = {
  todo: { t: "A fazer", tone: "slate" }, doing: { t: "Em andamento", tone: "amber" }, done: { t: "Feito", tone: "green" }, blocked: { t: "Travado", tone: "red" }, skipped: { t: "Pulado", tone: "slate" },
};

export default async function Plano({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireOrg();
  const { ok, erro } = await searchParams;
  const { cycle, metrics } = await withTenant(s.orgId, async (db) => ({ cycle: await repo.getActiveCycle(db), metrics: await repo.latestMetrics(db) }));
  if (!cycle)
    return (
      <>
        <PageTitle title="Plano de 90 dias" />
        <Flash ok={ok} erro={erro} />
        <Empty title="Nenhum ciclo ativo" action={<LinkButton href="/app/diagnostico">Ir para o diagnóstico</LinkButton>}>Confirme até 3 prioridades no diagnóstico para criar o plano.</Empty>
      </>
    );
  const week = Math.max(1, cycleWeek(cycle.cycle.starts_on, new Date().toISOString().slice(0, 10)));
  return (
    <>
      <PageTitle
        title="Plano de 90 dias"
        subtitle={<>Semana {week} de 12 · {formatDate(cycle.cycle.starts_on)} a {formatDate(cycle.cycle.ends_on)}</>}
        actions={<a href="/app/relatorios/plano" className="text-sm text-brand">Versão para imprimir</a>}
      />
      <Flash ok={ok} erro={erro} />
      <div className="space-y-4">
        {cycle.priorities.map((p) => {
          const t = getTrack(p.track_code);
          return (
            <Card key={p.id} title={<>{p.position}. {p.title}</>} actions={<Badge tone="brand">{formatMetric(p.metric_code, p.baseline)} → {formatMetric(p.metric_code, p.target)}</Badge>}>
              <p className="text-sm text-slate-600">{t.objective}</p>
              <Why items={[t.why, ...(p.rationale?.reasons ?? []).map((r: string) => `Sinal: ${r}`), ...(p.rationale?.tip ? [`Dica: ${p.rationale.tip}`] : []), `Indicador: ${formatMetric(p.metric_code, metrics[p.metric_code]?.value ?? null)} hoje`]} />
              <ol className="mt-4 space-y-4">
                {p.milestones.map((ms) => (
                  <li key={ms.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-navy">{ms.title}</p>
                      <span className="text-xs text-slate-500">Semana {ms.week} · {formatDate(ms.due_date)} {ms.status === "done" && <Badge tone="green">Concluído</Badge>}</span>
                    </div>
                    <p className="text-xs text-slate-500">Evidência: {ms.evidence_required}</p>
                    <ul className="mt-2 space-y-2">
                      {p.actions.filter((a) => a.milestone_id === ms.id).map((a) => (
                        <li key={a.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span className={`text-sm ${a.status === "done" ? "text-slate-400 line-through" : ""}`}>S{a.week}. {a.title}</span>
                          <form action={setActionStatusAction} className="flex items-center gap-2">
                            <input type="hidden" name="actionId" value={a.id} />
                            <Badge tone={ST[a.status]?.tone}>{ST[a.status]?.t}</Badge>
                            {a.status !== "done" ? <button name="status" value="done" className="text-sm font-medium text-brand">Marcar feito</button> : <button name="status" value="todo" className="text-sm text-slate-500">Desfazer</button>}
                          </form>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              {t.templates.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-brand">Modelos prontos ({t.templates.length})</summary>
                  {t.templates.map((tp) => <div key={tp.title} className="mt-2 rounded-lg bg-slate-50 p-3"><p className="font-medium">{tp.title}</p><p className="whitespace-pre-wrap text-slate-600">{tp.body}</p></div>)}
                </details>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-500">Trocar esta prioridade</summary>
                <form action={replacePriorityAction} className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="priorityId" value={p.id} />
                  <input name="reason" required minLength={10} placeholder="Por que trocar? (obrigatório)" className={inputCls} />
                  <Button variant="secondary">Retirar</Button>
                </form>
              </details>
            </Card>
          );
        })}
      </div>
      <Card title="Fechar o ciclo" className="mt-6">
        <p className="text-sm text-slate-600">Na semana 13, compare o início com o resultado e prepare o próximo ciclo. Fechar antes encerra o ciclo atual.</p>
        <form action={closeCycleAction} className="mt-3"><Button variant={week >= 12 ? "primary" : "secondary"}>Fechar ciclo e ver relatório</Button></form>
      </Card>
    </>
  );
}
