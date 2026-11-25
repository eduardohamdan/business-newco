import { getMethod } from "@beos/method";
import { repo, withTenant } from "@beos/db";
import { Questionnaire } from "@/components/Questionnaire";
import { Badge, Button, Card, Field, Flash, inputCls, Notice, PageTitle, Progress, Why } from "@/components/ui";
import { CONFIDENCE_TEXT, formatMetric, STAGE_LABEL } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { approvePlanAction, rerunDiagnosis, submitAssessment } from "../actions";

export const metadata = { title: "Diagnóstico" };

export default async function Diagnostico({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; refazer?: string }> }) {
  const s = await requireOrg();
  const { ok, erro, refazer } = await searchParams;
  const m = getMethod();
  const { asm, dx, cycle, metrics } = await withTenant(s.orgId, async (db) => ({
    asm: await repo.latestAssessment(db),
    dx: await repo.latestDiagnosis(db),
    cycle: await repo.getActiveCycle(db),
    metrics: await repo.latestMetrics(db),
  }));

  if (!asm || !dx || refazer) {
    return (
      <>
        <PageTitle title="Diagnóstico" subtitle="Cerca de 20 perguntas, sem respostas certas ou erradas. Responda como a empresa é hoje." />
        <Flash ok={ok} erro={erro} />
        <form action={submitAssessment} className="space-y-6">
          <Questionnaire
            // Só texto e opções vão ao navegador: os pesos e scores do método ficam no servidor.
            questions={m.questions.map((q) => ({ code: q.code, dimension: q.dimension, text: q.text, help: q.help, show_if: q.show_if, options: q.options.map((o) => ({ value: o.value, label: o.label })) }))}
            dimensions={m.manifest.dimensions.map((d) => ({ code: d.code, name: d.name }))}
            initial={asm?.answers ?? {}}
          />
          <Card title="Dois números que ajudam (opcional)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Margem bruta aproximada (%)" hint="Quanto sobra de cada venda depois do custo direto. Se não souber, deixe em branco.">
                <input name="m_margem_bruta_pct" inputMode="decimal" defaultValue={metrics.margem_bruta_pct?.value ?? ""} className={inputCls} />
              </Field>
              <Field label="Inadimplência (%)" hint="Do que foi vendido a prazo, quanto está atrasado.">
                <input name="m_inadimplencia_pct" inputMode="decimal" defaultValue={metrics.inadimplencia_pct?.value ?? ""} className={inputCls} />
              </Field>
            </div>
          </Card>
          <Button>Gerar diagnóstico</Button>
        </form>
      </>
    );
  }

  const r = dx.result;
  const d = r.dx;
  const pr = r.prioritization;
  return (
    <>
      <PageTitle
        title="Diagnóstico"
        subtitle={<>Estágio <strong>{STAGE_LABEL[d.stage.stage]}</strong> · Índice de maturidade <strong>{d.maturity.avg ?? "—"}</strong>/100 · <Badge tone={d.confidenceLabel === "alta" ? "green" : d.confidenceLabel === "moderada" ? "amber" : "red"}>{CONFIDENCE_TEXT[d.confidenceLabel]}</Badge></>}
        actions={<div className="flex gap-2"><a href="/app/diagnostico?refazer=1" className="text-sm text-brand">Refazer questionário</a><form action={rerunDiagnosis}><Button variant="secondary">Atualizar</Button></form></div>}
      />
      <Flash ok={ok} erro={erro} />
      {r.narrative && <div className="mb-4"><Notice>{r.narrative}</Notice></div>}
      {!d.sufficient && (
        <div className="mb-4">
          <Notice tone="amber">
            <p className="font-semibold">Ainda faltam dados para um diagnóstico conclusivo. O que vemos abaixo são hipóteses.</p>
            <ul className="mt-2 list-disc pl-5">{d.missingData.map((x: any) => <li key={x.metric}>{x.request}</li>)}</ul>
          </Notice>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Índice de Maturidade" actions={<span className="text-xs text-slate-500">como a empresa é gerida</span>}>
          <ul className="space-y-3">
            {m.manifest.dimensions.map((dim) => {
              const sc = d.maturity.dimensions[dim.code]?.score;
              return (
                <li key={dim.code}>
                  <div className="flex justify-between text-sm"><span>{dim.name}</span><span className="font-semibold">{sc ?? "—"}</span></div>
                  <Progress value={sc ?? 0} tone={sc === null || sc === undefined ? "brand" : sc < 35 ? "red" : sc < 55 ? "amber" : "brand"} />
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Painel de Desempenho" actions={<span className="text-xs text-slate-500">como a empresa está indo</span>}>
          <ul className="divide-y divide-slate-100 text-sm">
            {d.panel.map((p: any) => (
              <li key={p.metric} className="flex justify-between py-1.5"><span>{p.name}</span><span className="font-semibold">{formatMetric(p.metric, p.value)}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="O que encontramos" className="mt-4">
        <ol className="space-y-3">
          {d.findings.map((f: any) => (
            <li key={f.code} className="rounded-xl bg-slate-50 p-3">
              <p className="font-medium text-navy">{f.rank}. {f.title}</p>
              <p className="text-sm text-slate-600">{f.body}</p>
              <Why items={f.evidence} confidence={`Impacto ${f.impact}/5 · Urgência ${f.urgency}/5`} />
            </li>
          ))}
        </ol>
      </Card>
      {cycle ? (
        <div className="mt-4"><Notice>Você já tem um ciclo ativo. Veja o <a className="font-semibold underline" href="/app/plano">plano</a>.</Notice></div>
      ) : (
        <Card title="Prioridades sugeridas para os próximos 90 dias" className="mt-4">
          <form action={approvePlanAction} className="space-y-3">
            <input type="hidden" name="diagnosisId" value={dx.id} />
            {pr.selected.map((p: any) => (
              <label key={p.code} className="flex gap-3 rounded-xl border border-brand bg-brand-50 p-3">
                <input type="checkbox" name="track" value={p.code} defaultChecked />
                <div>
                  <p className="font-semibold text-navy">{p.title}</p>
                  {p.tip && <p className="text-sm text-slate-600">{p.tip}</p>}
                  <Why items={p.reasons.map((x: string) => `Sinal que pesou: ${x}`)} />
                </div>
              </label>
            ))}
            {pr.deferred.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">Outras trilhas relevantes ({pr.deferred.length}) — por que ficaram para depois</summary>
                <ul className="mt-2 space-y-2">
                  {pr.deferred.map((p: any) => (
                    <li key={p.code} className="flex gap-3 rounded-lg border border-slate-200 p-2">
                      <input type="checkbox" name="track" value={p.code} />
                      <span><strong>{p.title}</strong> — {p.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-slate-500">No máximo 3. Focar em poucas coisas é o que faz o ciclo dar resultado.</p>
            <Button>Confirmar prioridades e criar o plano</Button>
          </form>
        </Card>
      )}
    </>
  );
}
