import { closeCycle, scoreMaturity } from "@beos/core";
import { repo, withTenant } from "@beos/db";

/** Semana 13 — fechamento: compara início, meta e resultado; marca "Empresa em Evolução". */
export async function closeActiveCycle(orgId: string, userId: string) {
  return withTenant(orgId, async (db) => {
    const c = await repo.getActiveCycle(db);
    if (!c) throw new Error("Não há ciclo ativo.");
    const metrics = await repo.latestMetrics(db);
    const stats = await repo.ritualStats(db, c.cycle.id);
    const first = (await db.query(`select a.answers from diagnoses d join assessments a on a.id = d.assessment_id where d.id = (select diagnosis_id from cycles where id = $1)`, [c.cycle.id])).rows[0];
    const latest = await repo.latestAssessment(db);
    const closing = closeCycle({
      priorities: c.priorities.map((p) => ({
        id: p.id,
        title: p.title,
        metric: p.metric_code,
        baseline: p.baseline,
        target: p.target,
        final: metrics[p.metric_code]?.value ?? null,
        actionsDone: p.actions.filter((a) => a.status === "done").length,
        actionsTotal: p.actions.length,
      })),
      ritualsAnswered: stats.answered,
      ritualsSent: stats.sent,
      maturityStart: first ? scoreMaturity(first.answers).avg : null,
      maturityEnd: latest ? scoreMaturity(latest.answers).avg : null,
    });
    const withCodes = { ...closing, priorities: closing.priorities.map((p) => ({ ...p, trackCode: c.priorities.find((x) => x.id === p.id)!.track_code })) };
    await repo.closeCycleRow(db, c.cycle.id, withCodes);
    await repo.audit(db, userId, "cycle.closed", c.cycle.id, { evolved: closing.evolved });
    return withCodes;
  });
}

/** RF08 — substituir prioridade exige justificativa; a nova entra na mesma posição. */
export async function replacePriority(orgId: string, userId: string, priorityId: string, reason: string) {
  if (reason.trim().length < 10) throw new Error("Explique o motivo da troca (mínimo de 10 caracteres).");
  await withTenant(orgId, async (db) => {
    await repo.replacePriority(db, priorityId, reason.trim());
    await repo.audit(db, userId, "priority.replaced", priorityId, { reason });
  });
}
