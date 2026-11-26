import { cycleWeek, focusAction, priorityRisk, type RitualPriority } from "@beos/core";
import { repo, withTenant } from "@beos/db";
import { getMetric } from "@beos/method";
import { evaluateOrgAlerts } from "@beos/services";
import { Badge, Card, Empty, LinkButton, Notice, PageTitle, Progress, Why } from "@/components/ui";
import { formatDate, formatMetric, RISK_LABEL, STAGE_LABEL } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { setActionStatusAction } from "./actions";

export const metadata = { title: "Cockpit" };

/** Cockpit antes do chat: situação, prioridades e UMA próxima ação (PRD, princípios 3 e 5). */
export default async function Cockpit() {
  const s = await requireOrg();
  const today = new Date().toISOString().slice(0, 10);
  const data = await withTenant(s.orgId, async (db) => ({
    org: await repo.getOrganization(db),
    rx: await repo.latestRaioX(db),
    dx: await repo.latestDiagnosis(db),
    cycle: await repo.getActiveCycle(db),
    metrics: await repo.latestMetrics(db),
  }));
  const { org, rx, dx, cycle, metrics } = data;

  if (!rx)
    return (
      <>
        <PageTitle title={`Olá${s.user.name ? `, ${s.user.name.split(" ")[0]}` : ""}!`} subtitle="Vamos começar pelo caixa." />
        <Empty title="Faça seu Raio-X de Caixa" action={<LinkButton href="/app/raio-x">Enviar extrato</LinkButton>}>
          Envie de 3 a 6 meses do extrato da conta PJ (OFX, CSV ou PDF). Em até 15 minutos você vê de onde vem e para onde vai o dinheiro.
        </Empty>
      </>
    );
  if (!cycle)
    return (
      <>
        <PageTitle title="Seu próximo passo" subtitle={dx ? `Estágio: ${STAGE_LABEL[dx.stage]}` : "Raio-X pronto"} />
        <Empty
          title={dx ? "Confirme suas prioridades" : "Responda o diagnóstico"}
          action={<LinkButton href="/app/diagnostico">{dx ? "Ver prioridades sugeridas" : "Começar diagnóstico (10 min)"}</LinkButton>}
        >
          {dx ? "Escolha até 3 prioridades para os próximos 90 dias." : "São cerca de 20 perguntas simples. Com elas e o Raio-X, sugerimos até 3 prioridades."}
        </Empty>
      </>
    );

  const rawWeek = cycleWeek(cycle.cycle.starts_on, today);
  const week = Math.max(1, rawWeek);
  const rp: RitualPriority[] = cycle.priorities.map((p) => ({
    id: p.id, title: p.title, metric: p.metric_code, target: p.target, baseline: p.baseline, lastValue: metrics[p.metric_code]?.value ?? null,
    actions: p.actions.map((a) => ({ id: a.id, priorityId: p.id, title: a.title, week: a.week, status: a.status })),
  }));
  const next = focusAction(rp, week);
  const alerts = await evaluateOrgAlerts(s.orgId, today);

  return (
    <>
      <PageTitle
        title={org.trade_name}
        subtitle={<>Estágio <strong>{STAGE_LABEL[org.stage ?? ""] ?? "—"}</strong> · {rawWeek === 0 ? <>Ciclo começa em <strong>{formatDate(cycle.cycle.starts_on)}</strong></> : <>Semana <strong>{week}</strong> de 12 · ciclo até {formatDate(cycle.cycle.ends_on)}</>}</>}
        actions={<LinkButton href="/app/ritual" variant="secondary">Fazer ritual</LinkButton>}
      />
      {alerts[0] && (
        <div className="mb-4">
          <Notice tone={alerts[0].severity >= 3 ? "red" : "amber"}>{alerts[0].text}</Notice>
        </div>
      )}
      {next && (
        <Card title="A única coisa para esta semana" className="mb-4">
          <p className="text-xl font-bold leading-snug text-grafite"><mark className="marca-texto">{next.title}</mark></p>
          <p className="mt-1 text-sm text-grafite-3">Semana {next.week} · {cycle.priorities.find((p) => p.id === next.priorityId)?.title}</p>
          <form action={setActionStatusAction} className="mt-3 flex gap-2">
            <input type="hidden" name="actionId" value={next.id} />
            <button name="status" value="done" className="rounded-xl bg-tinta px-4 py-2 text-sm font-semibold text-white">Feito</button>
            <button name="status" value="doing" className="rounded-xl px-4 py-2 text-sm font-semibold text-grafite ring-1 ring-pauta-forte">Comecei</button>
          </form>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {cycle.priorities.map((p) => {
          const r = rp.find((x) => x.id === p.id)!;
          const risk = RISK_LABEL[priorityRisk(r, rawWeek)]!;
          const done = p.actions.filter((a) => a.status === "done").length;
          const last = metrics[p.metric_code]?.value ?? null;
          return (
            <Card key={p.id} title={<span>{p.position}. {p.title}</span>} actions={<Badge tone={risk.tone}>{risk.text}</Badge>}>
              <Progress value={(done / Math.max(1, p.actions.length)) * 100} tone={risk.tone === "green" ? "brand" : risk.tone} />
              <p className="mt-1 text-xs text-grafite-3">{done} de {p.actions.length} ações</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div><dt className="text-grafite-3">Início</dt><dd className="font-semibold">{formatMetric(p.metric_code, p.baseline)}</dd></div>
                <div><dt className="text-grafite-3">Agora</dt><dd className="font-semibold">{formatMetric(p.metric_code, last)}</dd></div>
                <div><dt className="text-grafite-3">Meta</dt><dd className="font-semibold text-tinta">{formatMetric(p.metric_code, p.target)}</dd></div>
              </dl>
              <Why items={(p.rationale?.reasons ?? []).map((x: string) => `Sinal: ${x}`).concat(p.rationale?.tip ? [`Dica: ${p.rationale.tip}`] : [])} />
            </Card>
          );
        })}
      </div>
      <Card title="Caixa" className="mt-4" actions={<a href="/app/raio-x" className="text-sm text-tinta">Ver Raio-X</a>}>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {["folego_caixa_dias", "faturamento_mensal", "despesas_pessoais_pj_pct", "meses_caixa_negativo"].map((k) => (
            <div key={k}>
              <div className="text-grafite-3">{getMetric(k).name}</div>
              <div className="text-lg font-semibold text-grafite">{formatMetric(k, metrics[k]?.value)}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-grafite-3">Período do extrato: {formatDate(rx.period_start)} a {formatDate(rx.period_end)}</p>
      </Card>
    </>
  );
}
