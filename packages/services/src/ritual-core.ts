export { applyRitual, buildRitualQuestions, computeTarget, cycleWeek, evaluateAlerts, type RitualPriority, type RitualQuestion } from "@beos/core";

/** Extrai o título da ação da pergunta 'Você conseguiu fazer: "..."?'. */
export function getActionTitle(questionText: string): string {
  return questionText.match(/"(.+)"/)?.[1] ?? questionText;
}
