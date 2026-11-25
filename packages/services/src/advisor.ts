import { advisor, AiError, type AdvisorContext } from "@beos/ai";
import { focusAction } from "@beos/core";
import { repo, withTenant } from "@beos/db";
import { methodVersion } from "@beos/method";
import { aiFor } from "./ai";
import { cycleWeek } from "./ritual-core";

/** RF13 — Advisor contextual: só dados da organização, números do sistema, recusa fora do escopo. */
export async function askAdvisor(orgId: string, userId: string, question: string) {
  const q = question.trim().slice(0, 1000);
  if (q.length < 3) throw new Error("Escreva sua pergunta.");
  const ctx = await withTenant(orgId, async (db): Promise<AdvisorContext> => {
    const org = await repo.getOrganization(db);
    const cycle = await repo.getActiveCycle(db);
    const metrics = await repo.latestMetrics(db);
    const week = cycle ? cycleWeek(cycle.cycle.starts_on, new Date().toISOString().slice(0, 10)) : 0;
    const next = cycle
      ? focusAction(cycle.priorities.map((p) => ({ id: p.id, title: p.title, metric: p.metric_code, target: p.target, baseline: p.baseline, lastValue: null, actions: p.actions.map((a) => ({ id: a.id, priorityId: p.id, title: a.title, week: a.week, status: a.status })) })), week)
      : null;
    return {
      empresa: { nome: org.trade_name, setor: org.sector, estagio: org.stage, equipe: org.team_size },
      prioridades: (cycle?.priorities ?? []).map((p) => ({ titulo: p.title, indicador: p.metric_code, baseline: p.baseline, meta: p.target, ultimo: metrics[p.metric_code]?.value ?? null })),
      indicadores: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, v.value])),
      proximaAcao: next?.title ?? null,
    };
  });
  try {
    const r = await advisor(await aiFor(orgId), q, ctx);
    await withTenant(orgId, (db) =>
      repo.insertRecommendation(db, { kind: "advisor", competency: r.intent, question: q, content: r.answer, sources: r.sources.map((s) => ({ label: s })), status: r.blocked ? "blocked" : "shown", methodVersion: methodVersion(), promptVersion: "advisor@1" }),
    );
    return r;
  } catch (e) {
    if (e instanceof AiError && e.code === "budget_exceeded") return { answer: e.message, intent: "explain" as const, sources: [], blocked: true };
    throw e;
  }
}
