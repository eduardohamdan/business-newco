import { narrateDiagnosis, trackTip } from "@beos/ai";
import { buildPlan, diagnose, prioritize, scoreMaturity, visibleQuestions, type Answers, type Diagnosis, type PrioritizationResult } from "@beos/core";
import { repo, withTenant } from "@beos/db";
import { getQuestions, getTrack, methodVersion } from "@beos/method";
import { aiFor } from "./ai";

const MANUAL_METRICS = ["margem_bruta_pct", "inadimplencia_pct", "ticket_medio", "entregas_no_prazo_pct", "rotatividade_trimestral_pct"];

export async function saveAssessment(orgId: string, userId: string, answers: Answers) {
  const valid = new Set(getQuestions().map((q) => q.code));
  const clean: Answers = Object.fromEntries(Object.entries(answers).filter(([k, v]) => valid.has(k) && typeof v === "string"));
  const visible = new Set(visibleQuestions(clean).map((q) => q.code));
  for (const k of Object.keys(clean)) if (!visible.has(k)) delete clean[k];
  const m = scoreMaturity(clean);
  return withTenant(orgId, (db) => repo.insertAssessment(db, { methodVersion: m.methodVersion, answers: clean, dimensionScores: m.dimensions, maturityAvg: m.avg, coverage: m.coverage, createdBy: userId }));
}

export async function saveManualMetrics(orgId: string, userId: string, values: Partial<Record<string, number>>) {
  const today = new Date().toISOString().slice(0, 10);
  await withTenant(orgId, async (db) => {
    for (const [code, v] of Object.entries(values)) {
      if (typeof v === "number" && Number.isFinite(v) && MANUAL_METRICS.includes(code)) {
        await repo.recordMetric(db, { metricCode: code, periodStart: today, periodEnd: today, value: v, source: "manual", recordedBy: userId });
      }
    }
  });
}

export interface DiagnosisView {
  id: string;
  dx: Diagnosis;
  prioritization: { selected: { code: string; title: string; score: number; reasons: string[]; tip?: string }[]; deferred: { code: string; title: string; reason: string }[]; blocked: { code: string; title: string; reason: string }[] };
  narrative?: string;
}

/** RF05–RF08: estágio, índice, painel, achados e até 3 prioridades sugeridas. */
export async function runDiagnosis(orgId: string): Promise<DiagnosisView> {
  const data = await withTenant(orgId, async (db) => ({
    org: await repo.getOrganization(db),
    asm: await repo.latestAssessment(db),
    rx: await repo.latestRaioX(db),
    metrics: await repo.latestMetrics(db),
    cycles: await repo.listCycles(db),
  }));
  if (!data.asm) throw new Error("Responda o questionário antes do diagnóstico.");
  const maturity = scoreMaturity(data.asm.answers);
  const manual = Object.fromEntries(Object.entries(data.metrics).filter(([, v]) => v.source === "manual").map(([k, v]) => [k, v.value]));
  const today = new Date().toISOString().slice(0, 10);
  const dx = diagnose({ maturity, raiox: data.rx?.result, manualMetrics: manual, facts: { teamSize: data.org.team_size, revenueBand: data.org.revenue_band, sector: data.org.sector ?? undefined }, dataAsOf: data.rx?.period_end, today });
  const completed = data.cycles.filter((c) => c.status === "closed").flatMap((c) => (c.closing?.priorities ?? []).filter((p: any) => p.outcome === "atingida").map((p: any) => p.trackCode as string));
  const pr: PrioritizationResult = prioritize(dx, { teamSize: data.org.team_size, hasBankStatement: !!data.rx, completedTracks: completed });

  let narrative: string | undefined;
  const tips: Record<string, string> = {};
  try {
    const gw = await aiFor(orgId);
    if (dx.sufficient) narrative = await narrateDiagnosis(gw, dx, pr.selected);
    for (const s of pr.selected) tips[s.track.code] = await trackTip(gw, s.track, { sector: data.org.sector, teamSize: data.org.team_size });
  } catch (e) {
    console.warn("[diagnosis] narrativa indisponível:", (e as Error).message);
  }

  const prioritization: DiagnosisView["prioritization"] = {
    selected: pr.selected.map((s) => ({ code: s.track.code, title: s.track.title, score: s.score, reasons: s.reasons, tip: tips[s.track.code] })),
    deferred: pr.deferred.map((d) => ({ code: d.track.code, title: d.track.title, reason: d.reason })),
    blocked: pr.blocked.map((b) => ({ code: b.track.code, title: b.track.title, reason: b.reason })),
  };
  const row = await withTenant(orgId, (db) =>
    repo.insertDiagnosis(db, {
      assessmentId: data.asm!.id,
      raioxId: data.rx?.id,
      methodVersion: methodVersion(),
      stage: dx.stage.stage,
      coverage: dx.coverage,
      confidence: dx.confidence,
      sufficient: dx.sufficient,
      result: { dx, prioritization, narrative },
      suggestedTracks: prioritization.selected,
    }),
  );
  return { id: row.id, dx, prioritization, narrative };
}

/** RF09 — o dono confirma as prioridades (até 3) e o ciclo de 90 dias nasce com trilhas, metas e ações. */
export async function approvePlan(orgId: string, userId: string, diagnosisId: string, trackCodes: string[], startsOn?: string) {
  if (!trackCodes.length || trackCodes.length > 3) throw new Error("Escolha de 1 a 3 prioridades.");
  const d = await withTenant(orgId, (db) => repo.getDiagnosis(db, diagnosisId));
  if (!d) throw new Error("Diagnóstico não encontrado.");
  if (!d.sufficient) throw new Error("O diagnóstico ainda não tem dados suficientes. Complete os dados pedidos antes de montar o plano.");
  const dx = d.result.dx as Diagnosis;
  const allowed = new Set([...(d.result.prioritization?.selected ?? []), ...(d.result.prioritization?.deferred ?? [])].map((x: any) => x.code));
  for (const c of trackCodes) if (!allowed.has(c)) throw new Error(`A trilha ${c} não é elegível para este diagnóstico.`);
  const plan = buildPlan({ tracks: trackCodes.map(getTrack), baselines: dx.signals.metrics, startsOn: startsOn ?? nextMonday() });
  const rationale = Object.fromEntries((d.result.prioritization?.selected ?? []).map((s: any) => [s.code, { score: s.score, reasons: s.reasons, tip: s.tip }]));
  return withTenant(orgId, async (db) => {
    const id = await repo.createCycleFromPlan(db, { plan, diagnosisId, ownerUserId: userId, rationale });
    await repo.audit(db, userId, "cycle.created", id, { tracks: trackCodes });
    return id;
  });
}

export function nextMonday(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const add = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
