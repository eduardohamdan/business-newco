import { cycleWeek } from "@beos/core";
import { repo, withTenant } from "@beos/db";
import { Badge, Button, Card, Empty, Field, Flash, inputCls, LinkButton, PageTitle } from "@/components/ui";
import { formatDate, RISK_LABEL } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { startWebRitual, submitRitualAction } from "../actions";

export const metadata = { title: "Ritual semanal" };

export default async function Ritual({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireOrg();
  const { ok, erro } = await searchParams;
  const data = await withTenant(s.orgId, async (db) => {
    const cycle = await repo.getActiveCycle(db);
    if (!cycle) return null;
    const week = Math.max(1, cycleWeek(cycle.cycle.starts_on, new Date().toISOString().slice(0, 10)));
    const current = await repo.currentRitualSession(db, cycle.cycle.id, week);
    const history = (await db.query(`select week, status, answered_at, outcome from ritual_sessions where cycle_id = $1 order by week desc`, [cycle.cycle.id])).rows;
    return { week, current, history };
  });
  if (!data)
    return (<><PageTitle title="Ritual semanal" /><Empty title="Sem ciclo ativo" action={<LinkButton href="/app/diagnostico">Criar plano</LinkButton>}>O ritual começa quando o plano de 90 dias é criado.</Empty></>);
  const { week, current, history } = data;
  const open = current && current.status !== "answered";
  return (
    <>
      <PageTitle title={`Ritual da semana ${week}`} subtitle="5 minutos: o que foi feito, o número da semana e o que está travando." />
      <Flash ok={ok} erro={erro} />
      {!current && (
        <Card><p className="text-sm text-grafite-2">O ritual desta semana ainda não foi enviado. Você pode fazer agora pelo app.</p><form action={startWebRitual} className="mt-3"><Button>Fazer o ritual agora</Button></form></Card>
      )}
      {open && (
        <Card>
          <form action={submitRitualAction} className="space-y-4">
            <input type="hidden" name="sessionId" value={current.id} />
            {current.questions.map((q: any) => (
              <div key={q.id}>
                {q.kind === "action_status" && (
                  <fieldset>
                    <legend className="text-sm font-medium text-grafite">{q.text}</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {q.options.map((o: any) => (
                        <label key={o.id} className="flex items-center gap-2 rounded-xl border border-pauta px-3 py-2 text-sm"><input type="radio" name="action" value={o.id} required /> {o.label}</label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {q.kind === "metric_value" && <Field label={q.text} hint={q.optional ? "Opcional nesta semana." : undefined}><input name="metric" inputMode="decimal" className={inputCls} /></Field>}
                {q.kind === "free_text" && <Field label={q.text}><textarea name="blocker" rows={2} className={inputCls} /></Field>}
              </div>
            ))}
            <Button>Enviar ritual</Button>
          </form>
        </Card>
      )}
      {current?.status === "answered" && current.outcome && (
        <Card title="Resumo da semana"><p className="text-sm">{current.outcome.summary}</p></Card>
      )}
      <Card title="Histórico" className="mt-4">
        <ul className="divide-y divide-pauta text-sm">
          {history.map((h: any) => (
            <li key={h.week} className="flex items-center justify-between py-2">
              <span>Semana {h.week}{h.answered_at && ` · ${formatDate(h.answered_at)}`}</span>
              <span className="flex gap-2">
                {h.outcome?.overallRisk && <Badge tone={RISK_LABEL[h.outcome.overallRisk]?.tone}>{RISK_LABEL[h.outcome.overallRisk]?.text}</Badge>}
                <Badge tone={h.status === "answered" ? "green" : h.status === "missed" ? "red" : "slate"}>{h.status === "answered" ? "Respondido" : h.status === "missed" ? "Perdido" : "Aberto"}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
