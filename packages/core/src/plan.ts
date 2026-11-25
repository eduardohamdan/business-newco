import { getMetric, getMethod, type TargetRule, type Track } from "@beos/method";
import { addDays } from "./statement/dates";
import { round1 } from "./money";

export interface PlannedAction {
  key: string;
  title: string;
  week: number;
  dueDate: string;
  role: "owner" | "manager" | "member";
  minutes: number;
}

export interface PlannedMilestone {
  code: string;
  title: string;
  week: number;
  dueDate: string;
  evidence: string;
  actions: PlannedAction[];
}

export interface PlannedPriority {
  position: number;
  trackCode: string;
  trackVersion: number;
  title: string;
  dimension: string;
  objective: string;
  metric: string;
  metricName: string;
  baseline: number | null;
  target: number | null;
  /** Sem baseline, o ritual da semana 1 pede o número antes de fixar a meta. */
  needsBaseline: boolean;
  milestones: PlannedMilestone[];
}

export interface CyclePlan {
  methodVersion: string;
  startsOn: string;
  endsOn: string;
  weeks: number;
  priorities: PlannedPriority[];
  firstAction: PlannedAction | null;
}

/** Calcula a meta a partir da regra da trilha. Respeita mínimo/máximo. */
export function computeTarget(rule: TargetRule, baseline: number | null): number | null {
  let t: number | null;
  if (rule.type === "absolute") t = rule.value;
  else if (baseline === null) return null;
  else if (rule.type === "delta") t = baseline + rule.value;
  else t = baseline * (1 + rule.value);
  if (rule.min !== undefined) t = Math.max(t, rule.min);
  if (rule.max !== undefined) t = Math.min(t, rule.max);
  return round1(t);
}

/** Data de vencimento da semana N (semana 1 começa em startsOn). */
export const dueDateOfWeek = (startsOn: string, week: number): string => addDays(startsOn, week * 7 - 1);

export function buildPlan(input: {
  tracks: Track[];
  baselines: Partial<Record<string, number>>;
  startsOn: string;
}): CyclePlan {
  const m = getMethod();
  if (input.tracks.length > m.manifest.limits.max_priorities)
    throw new Error(`Máximo de ${m.manifest.limits.max_priorities} prioridades por ciclo.`);
  const execWeeks = m.manifest.limits.cycle_weeks - 1;
  const priorities: PlannedPriority[] = input.tracks.map((t, idx) => {
    const metric = getMetric(t.indicator.metric);
    const baseline = input.baselines[metric.code] ?? null;
    const target = computeTarget(t.indicator.target, baseline);
    return {
      position: idx + 1,
      trackCode: t.code,
      trackVersion: t.version,
      title: t.title,
      dimension: t.dimension,
      objective: t.objective,
      metric: metric.code,
      metricName: metric.name,
      baseline,
      target,
      needsBaseline: target === null,
      milestones: t.milestones.map((ms) => ({
        code: ms.code,
        title: ms.title,
        week: ms.week,
        dueDate: dueDateOfWeek(input.startsOn, ms.week),
        evidence: ms.evidence,
        actions: ms.actions.map((a, ai) => ({
          key: `${t.code}:${ms.code}:${ai}`,
          title: a.title,
          week: a.week,
          dueDate: dueDateOfWeek(input.startsOn, a.week),
          role: a.role,
          minutes: a.minutes,
        })),
      })),
    };
  });
  const allActions = priorities.flatMap((p) => p.milestones.flatMap((ms) => ms.actions));
  const firstAction = [...allActions].sort((a, b) => a.week - b.week || a.key.localeCompare(b.key))[0] ?? null;
  return {
    methodVersion: m.manifest.version,
    startsOn: input.startsOn,
    endsOn: dueDateOfWeek(input.startsOn, execWeeks),
    weeks: execWeeks,
    priorities,
    firstAction,
  };
}
