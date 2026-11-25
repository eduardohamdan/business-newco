import { getMetric } from "@beos/method";
import { daysBetween } from "./statement/dates";
import { parseAmount } from "./money";
import { normalizeText } from "./text";

export type ActionStatus = "todo" | "doing" | "done" | "blocked" | "skipped";
export type RiskLevel = "on_track" | "at_risk" | "off_track";

export interface RitualAction {
  id: string;
  priorityId: string;
  title: string;
  week: number;
  status: ActionStatus;
  assigneeName?: string;
}

export interface RitualPriority {
  id: string;
  title: string;
  metric: string;
  target: number | null;
  baseline: number | null;
  lastValue: number | null;
  actions: RitualAction[];
}

export interface RitualQuestion {
  id: "action" | "metric" | "blocker";
  kind: "action_status" | "metric_value" | "free_text";
  text: string;
  options?: { id: string; label: string }[];
  actionId?: string;
  priorityId?: string;
  metric?: string;
  optional?: boolean;
}

/** Semana do ciclo (1..12) para uma data. Semana 0 = antes do início. */
export function cycleWeek(startsOn: string, today: string): number {
  const d = daysBetween(startsOn, today);
  if (d < 0) return 0;
  return Math.min(12, Math.floor(d / 7) + 1);
}

/** Ação foco da semana: a mais antiga pendente da prioridade mais arriscada. */
export function focusAction(priorities: RitualPriority[], week: number): RitualAction | null {
  const ranked = [...priorities].sort((a, b) => riskRank(priorityRisk(b, week)) - riskRank(priorityRisk(a, week)));
  for (const p of ranked) {
    const pending = p.actions.filter((a) => a.week <= week + 1 && (a.status === "todo" || a.status === "doing" || a.status === "blocked"));
    pending.sort((a, b) => a.week - b.week);
    if (pending[0]) return pending[0];
  }
  return null;
}

/** No máximo 3 perguntas, sempre: ação da semana, número da semana e bloqueio (opcional). */
export function buildRitualQuestions(priorities: RitualPriority[], week: number): RitualQuestion[] {
  const qs: RitualQuestion[] = [];
  const action = focusAction(priorities, week);
  if (action) {
    qs.push({
      id: "action",
      kind: "action_status",
      text: `Você conseguiu fazer: "${action.title}"?`,
      options: [
        { id: "done", label: "Feito" },
        { id: "partial", label: "Em parte" },
        { id: "not_done", label: "Não deu" },
      ],
      actionId: action.id,
      priorityId: action.priorityId,
    });
  }
  const p = priorities.find((x) => getMetric(x.metric).source === "ritual") ?? priorities.find((x) => x.target === null) ?? priorities[0];
  if (p) {
    const metric = getMetric(p.metric);
    qs.push({
      id: "metric",
      kind: "metric_value",
      text: p.baseline === null ? `Para fixar a meta: qual é hoje o número de "${metric.name}"?` : `Qual foi o número da semana para "${metric.name}"?`,
      priorityId: p.id,
      metric: metric.code,
      optional: metric.periodicity !== "weekly",
    });
  }
  qs.push({ id: "blocker", kind: "free_text", text: "Tem algo travando? Pode responder por texto ou áudio. Se não, responda \"não\".", optional: true });
  return qs.slice(0, 3);
}

/** Interpreta respostas curtas em português (botões, texto ou transcrição de áudio). */
export function parseActionReply(input: string): "done" | "partial" | "not_done" | null {
  const s = normalizeText(input);
  if (/^(DONE|PARTIAL|NOT_DONE)$/.test(s)) return s.toLowerCase() as never;
  if (/\b(EM PARTE|PARCIAL|METADE|MAIS OU MENOS|COMECEI|QUASE)\b/.test(s)) return "partial";
  if (/^(NAO|N|NEGATIVO)\b|\bNAO (DEU|CONSEGUI|FIZ)\b|\bNEM\b/.test(s)) return "not_done";
  if (/\b(FEITO|FIZ|SIM|S|OK|CONCLUI|CONCLUIDO|PRONTO|FEITA|CONSEGUI)\b/.test(s)) return "done";
  return null;
}

export function parseMetricReply(input: string): number | null {
  const m = input.replace(/[^\d.,\-]/g, " ").trim().split(/\s+/)[0];
  if (!m) return null;
  const cents = parseAmount(m);
  return cents === null ? null : cents / 100;
}

export const isNoBlocker = (input: string): boolean => /^(NAO|NADA|NENHUM|TUDO CERTO|SEM BLOQUEIO|N)$/.test(normalizeText(input));

export interface RitualOutcome {
  actionUpdates: { actionId: string; status: ActionStatus }[];
  metricValues: { priorityId: string; metric: string; value: number }[];
  blocker: string | null;
  risks: { priorityId: string; risk: RiskLevel }[];
  overallRisk: RiskLevel;
  nextAction: RitualAction | null;
  summary: string;
}

/** Aplica as respostas: atualiza ações, registra número, recalcula risco e devolve a próxima ação. */
export function applyRitual(
  priorities: RitualPriority[],
  week: number,
  answers: { action?: string; metric?: string; blocker?: string },
  questions: RitualQuestion[],
): RitualOutcome {
  const actionUpdates: RitualOutcome["actionUpdates"] = [];
  const metricValues: RitualOutcome["metricValues"] = [];
  const qa = questions.find((q) => q.id === "action");
  if (qa?.actionId && answers.action) {
    const r = parseActionReply(answers.action);
    if (r) actionUpdates.push({ actionId: qa.actionId, status: r === "done" ? "done" : r === "partial" ? "doing" : "todo" });
  }
  const qm = questions.find((q) => q.id === "metric");
  if (qm?.metric && qm.priorityId && answers.metric) {
    const v = parseMetricReply(answers.metric);
    if (v !== null) metricValues.push({ priorityId: qm.priorityId, metric: qm.metric, value: v });
  }
  const blocker = answers.blocker && !isNoBlocker(answers.blocker) ? answers.blocker.trim() : null;

  // Estado após as respostas
  const updated = priorities.map((p) => ({
    ...p,
    lastValue: metricValues.find((mv) => mv.priorityId === p.id)?.value ?? p.lastValue,
    actions: p.actions.map((a) => {
      const u = actionUpdates.find((x) => x.actionId === a.id);
      return u ? { ...a, status: u.status } : a;
    }),
  }));
  if (blocker && qa?.actionId) {
    for (const p of updated) for (const a of p.actions) if (a.id === qa.actionId && a.status !== "done") a.status = "blocked";
  }
  const risks = updated.map((p) => ({ priorityId: p.id, risk: priorityRisk(p, week) }));
  const overallRisk = risks.reduce<RiskLevel>((w, r) => (riskRank(r.risk) > riskRank(w) ? r.risk : w), "on_track");
  const nextAction = focusAction(updated, week + 1);
  const done = actionUpdates.filter((u) => u.status === "done").length;
  const summary = [
    done ? "Boa! Ação da semana concluída." : actionUpdates.length ? "Anotado. A ação segue em aberto." : "Sem atualização da ação nesta semana.",
    metricValues[0] ? `Número registrado: ${metricValues[0].value.toLocaleString("pt-BR")}.` : "",
    blocker ? "Registrei o bloqueio e vou considerar no próximo passo." : "",
    overallRisk === "off_track" ? "O plano está atrasado: vamos focar em uma ação só." : overallRisk === "at_risk" ? "Atenção: o ritmo está abaixo do previsto." : "O plano está no ritmo.",
    nextAction ? `Próxima ação: ${nextAction.title}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { actionUpdates, metricValues, blocker, risks, overallRisk, nextAction, summary };
}

/** Risco = ações concluídas / ações previstas até a semana. */
export function priorityRisk(p: RitualPriority, week: number): RiskLevel {
  const expected = p.actions.filter((a) => a.week <= week && a.status !== "skipped");
  if (!expected.length) return "on_track";
  const done = expected.filter((a) => a.status === "done").length + 0.5 * expected.filter((a) => a.status === "doing").length;
  const ratio = done / expected.length;
  return ratio >= 0.75 ? "on_track" : ratio >= 0.45 ? "at_risk" : "off_track";
}

const riskRank = (r: RiskLevel) => (r === "off_track" ? 2 : r === "at_risk" ? 1 : 0);

export interface AlertInput {
  missedRitualsInRow: number;
  lateMilestones: { title: string; dueDate: string }[];
  metricDeviations: { metric: string; value: number; target: number; direction: "up" | "down"; tolerance: number }[];
}

export interface Alert {
  code: "ritual_ausente" | "marco_atrasado" | "indicador_fora";
  severity: 1 | 2 | 3;
  text: string;
}

/** RF14: alertas de desvio, ausência de ritual e marco atrasado. */
export function evaluateAlerts(i: AlertInput): Alert[] {
  const out: Alert[] = [];
  if (i.missedRitualsInRow >= 2)
    out.push({ code: "ritual_ausente", severity: 3, text: `Já são ${i.missedRitualsInRow} semanas sem ritual. Que tal 5 minutos agora para retomar?` });
  for (const ms of i.lateMilestones) out.push({ code: "marco_atrasado", severity: 2, text: `O marco "${ms.title}" venceu em ${ms.dueDate}.` });
  for (const d of i.metricDeviations) {
    const off = d.direction === "up" ? d.value < d.target - d.tolerance : d.value > d.target + d.tolerance;
    if (off) out.push({ code: "indicador_fora", severity: 2, text: `${getMetric(d.metric).name} está em ${d.value}, fora da tolerância da meta (${d.target}).` });
  }
  return out.sort((a, b) => b.severity - a.severity);
}
