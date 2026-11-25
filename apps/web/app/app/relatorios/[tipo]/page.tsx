import { notFound } from "next/navigation";
import { formatBRL } from "@beos/core";
import { getMethod, getMetric } from "@beos/method";
import { repo, withTenant } from "@beos/db";
import { Empty } from "@/components/ui";
import { formatDate, formatMetric, STAGE_LABEL } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Relatório" };

const OUTCOME: Record<string, string> = { atingida: "Meta atingida", avancou: "Avançou", nao_avancou: "Não avançou", sem_dados: "Sem dados" };

export default async function Relatorio({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  if (!["raiox", "diagnostico", "plano", "fechamento"].includes(tipo)) notFound();
  const s = await requireOrg();
  const d = await withTenant(s.orgId, async (db) => ({
    org: await repo.getOrganization(db),
    rx: await repo.latestRaioX(db),
    dx: await repo.latestDiagnosis(db),
    cycle: await repo.getActiveCycle(db),
    closed: (await repo.listCycles(db)).find((c) => c.status === "closed"),
  }));
  const header = (title: string, sub?: string) => (
    <header className="mb-6 border-b-2 border-navy pb-3">
      <p className="text-xs font-semibold tracking-widest text-brand">BUSINESS EVOLUTION OS</p>
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <p className="text-sm text-slate-600">{d.org.trade_name}{sub ? ` · ${sub}` : ""} · gerado em {formatDate(new Date().toISOString())}</p>
    </header>
  );
  let body: React.ReactNode = null;
  if (tipo === "raiox") {
    if (!d.rx) return <Empty title="Ainda não há Raio-X" />;
    const r = d.rx.result;
    body = (
      <>
        {header("Raio-X de Caixa", `${formatDate(r.periodStart)} a ${formatDate(r.periodEnd)}`)}
        {d.rx.narrative && <p className="mb-4 text-sm">{d.rx.narrative}</p>}
        <h2 className="mb-2 font-semibold text-navy">Indicadores</h2>
        <table className="mb-4 w-full text-sm"><tbody>{Object.entries(r.metrics).map(([k, m]: [string, any]) => <tr key={k} className="border-b border-slate-100"><td className="py-1">{getMetric(k).name}</td><td className="text-right font-semibold">{formatMetric(k, m.value)}</td><td className="hidden pl-4 text-xs text-slate-500 sm:table-cell print:table-cell">{m.formula}</td></tr>)}</tbody></table>
        <h2 className="mb-2 font-semibold text-navy">Mês a mês</h2>
        <table className="mb-4 w-full text-sm"><thead><tr className="text-left"><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th></tr></thead><tbody>{r.months.map((m: any) => <tr key={m.month} className="border-b border-slate-100"><td className="py-1">{m.month}</td><td>{formatBRL(m.inflowCents)}</td><td>{formatBRL(m.outflowCents)}</td><td>{formatBRL(m.netCents)}</td></tr>)}</tbody></table>
        <h2 className="mb-2 font-semibold text-navy">Alertas</h2>
        <ul className="list-disc pl-5 text-sm">{r.alerts.map((a: any) => <li key={a.code}><strong>{a.title}.</strong> {a.detail}</li>)}</ul>
      </>
    );
  } else if (tipo === "diagnostico") {
    if (!d.dx) return <Empty title="Ainda não há diagnóstico" />;
    const x = d.dx.result.dx;
    body = (
      <>
        {header("Diagnóstico", `Estágio ${STAGE_LABEL[x.stage.stage]}`)}
        {d.dx.result.narrative && <p className="mb-4 text-sm">{d.dx.result.narrative}</p>}
        <h2 className="mb-2 font-semibold text-navy">Índice de Maturidade ({x.maturity.avg}/100)</h2>
        <ul className="mb-4 text-sm">{getMethod().manifest.dimensions.map((dim) => <li key={dim.code}>{dim.name}: <strong>{x.maturity.dimensions[dim.code]?.score ?? "—"}</strong></li>)}</ul>
        <h2 className="mb-2 font-semibold text-navy">Achados</h2>
        <ol className="mb-4 list-decimal pl-5 text-sm">{x.findings.map((f: any) => <li key={f.code}><strong>{f.title}.</strong> {f.body}</li>)}</ol>
        <h2 className="mb-2 font-semibold text-navy">Prioridades sugeridas</h2>
        <ol className="list-decimal pl-5 text-sm">{d.dx.result.prioritization.selected.map((p: any) => <li key={p.code}>{p.title}</li>)}</ol>
      </>
    );
  } else if (tipo === "plano") {
    if (!d.cycle) return <Empty title="Sem ciclo ativo" />;
    body = (
      <>
        {header("Plano de 90 dias", `${formatDate(d.cycle.cycle.starts_on)} a ${formatDate(d.cycle.cycle.ends_on)}`)}
        {d.cycle.priorities.map((p) => (
          <section key={p.id} className="mb-5 break-inside-avoid">
            <h2 className="font-semibold text-navy">{p.position}. {p.title}</h2>
            <p className="text-sm text-slate-600">Indicador: {getMetric(p.metric_code).name} · de {formatMetric(p.metric_code, p.baseline)} para {formatMetric(p.metric_code, p.target)}</p>
            <ul className="mt-1 text-sm">{p.milestones.map((ms) => <li key={ms.id}>☐ Semana {ms.week} — {ms.title} <span className="text-slate-500">({ms.evidence_required})</span></li>)}</ul>
          </section>
        ))}
      </>
    );
  } else {
    if (!d.closed) return <Empty title="Nenhum ciclo fechado ainda" />;
    const c = d.closed.closing;
    body = (
      <>
        {header("Fechamento do ciclo", `${formatDate(d.closed.starts_on)} a ${formatDate(d.closed.ends_on)}`)}
        <p className="mb-4 text-lg font-semibold">{c.evolved ? "Empresa em Evolução: houve melhora comprovada em pelo menos um indicador prioritário." : "Ciclo sem melhora comprovada nos indicadores prioritários."}</p>
        <table className="mb-4 w-full text-sm"><thead><tr className="text-left"><th>Prioridade</th><th>Início</th><th>Meta</th><th>Final</th><th>Resultado</th></tr></thead><tbody>{c.priorities.map((p: any) => <tr key={p.id} className="border-b border-slate-100"><td className="py-1">{p.title}</td><td>{formatMetric(p.metric, p.baseline)}</td><td>{formatMetric(p.metric, p.target)}</td><td>{formatMetric(p.metric, p.final)}</td><td>{OUTCOME[p.outcome]}</td></tr>)}</tbody></table>
        <p className="text-sm">Rituais respondidos: {c.ritualRate}% · Variação do índice de maturidade: {c.maturityDelta ?? "—"}</p>
        <h2 className="mb-2 mt-4 font-semibold text-navy">Para o próximo ciclo</h2>
        <ul className="list-disc pl-5 text-sm">{c.nextCycleSuggestions.map((x: string) => <li key={x}>{x}</li>)}</ul>
      </>
    );
  }
  return (
    <article className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm print:shadow-none">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      {body}
    </article>
  );
}
