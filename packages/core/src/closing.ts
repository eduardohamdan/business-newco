import { getMetric } from "@beos/method";
import { round1 } from "./money";

export type PriorityOutcome = "atingida" | "avancou" | "nao_avancou" | "sem_dados";

export interface ClosingPriorityInput {
  id: string;
  title: string;
  metric: string;
  baseline: number | null;
  target: number | null;
  final: number | null;
  actionsDone: number;
  actionsTotal: number;
}

export interface CycleClosing {
  priorities: (ClosingPriorityInput & { outcome: PriorityOutcome; progressPct: number | null })[];
  /** "Empresa em Evolução": melhora comprovada em ao menos um indicador prioritário. */
  evolved: boolean;
  ritualRate: number;
  maturityDelta: number | null;
  nextCycleSuggestions: string[];
}

export function closeCycle(i: {
  priorities: ClosingPriorityInput[];
  ritualsAnswered: number;
  ritualsSent: number;
  maturityStart: number | null;
  maturityEnd: number | null;
}): CycleClosing {
  const priorities = i.priorities.map((p) => {
    const dir = getMetric(p.metric).direction;
    if (p.baseline === null || p.final === null) return { ...p, outcome: "sem_dados" as const, progressPct: null };
    const improved = dir === "up" ? p.final > p.baseline : p.final < p.baseline;
    const hit = p.target !== null && (dir === "up" ? p.final >= p.target : p.final <= p.target);
    const span = p.target !== null ? p.target - p.baseline : null;
    const progressPct = span ? round1(Math.max(0, Math.min(150, ((p.final - p.baseline) / span) * 100))) : null;
    return { ...p, outcome: hit ? ("atingida" as const) : improved ? ("avancou" as const) : ("nao_avancou" as const), progressPct };
  });
  const suggestions: string[] = [];
  for (const p of priorities) {
    if (p.outcome === "avancou") suggestions.push(`Manter "${p.title}" no próximo ciclo para chegar à meta.`);
    if (p.outcome === "nao_avancou") suggestions.push(`Rever "${p.title}": trocar a abordagem ou dividir em passos menores.`);
    if (p.outcome === "sem_dados") suggestions.push(`Garantir a medição de "${p.title}" desde a primeira semana.`);
  }
  if (!suggestions.length) suggestions.push("Todas as metas foram atingidas: escolher novas prioridades a partir do diagnóstico atualizado.");
  return {
    priorities,
    evolved: priorities.some((p) => p.outcome === "atingida" || p.outcome === "avancou"),
    ritualRate: i.ritualsSent ? round1((i.ritualsAnswered / i.ritualsSent) * 100) : 0,
    maturityDelta: i.maturityStart !== null && i.maturityEnd !== null ? round1(i.maturityEnd - i.maturityStart) : null,
    nextCycleSuggestions: suggestions,
  };
}
