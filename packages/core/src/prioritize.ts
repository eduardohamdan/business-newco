import type { Diagnosis } from "./diagnosis";
import { describeCondition, evaluateCondition } from "./signals";
import { getMethod, getStage, type Track } from "@beos/method";

export interface PriorityPick {
  track: Track;
  score: number;
  fit: number;
  reasons: string[];
}

export interface PrioritizationResult {
  selected: PriorityPick[];
  /** Relevantes, mas fora do top 3 — com o motivo (explicação das adiadas). */
  deferred: { track: Track; score: number; reason: string }[];
  /** Bloqueadas por estágio ou pré-requisito. */
  blocked: { track: Track; reason: string }[];
}

export interface PrioritizeOptions {
  teamSize: number;
  hasBankStatement: boolean;
  /** Trilhas já concluídas em ciclos anteriores (não repetir). */
  completedTracks?: string[];
  /** Forçar inclusão (o dono escolheu) — ainda respeita bloqueios. */
  pinned?: string[];
}

/**
 * Prioriza até 3 trilhas de forma determinística:
 * elegibilidade (estágio, tags bloqueadas, pré-requisitos) → aderência (gatilhos) → score → diversidade.
 */
export function prioritize(dx: Diagnosis, opts: PrioritizeOptions): PrioritizationResult {
  const m = getMethod();
  const { max_priorities, max_priorities_per_dimension } = m.manifest.limits;
  const stage = getStage(dx.stage.stage);
  const blocked: PrioritizationResult["blocked"] = [];
  const candidates: PriorityPick[] = [];

  for (const t of m.tracks) {
    if (opts.completedTracks?.includes(t.code)) continue;
    if (!t.stages.includes(stage.code)) {
      blocked.push({ track: t, reason: `Não indicada para o estágio ${stage.name}.` });
      continue;
    }
    const blockedTag = t.tags.find((tag) => stage.blocked_track_tags.includes(tag));
    if (blockedTag) {
      blocked.push({ track: t, reason: `No estágio ${stage.name}, iniciativas de ${blockedTag} ficam para depois.` });
      continue;
    }
    if (t.requires.bank_statement && !opts.hasBankStatement) {
      blocked.push({ track: t, reason: "Precisa do extrato bancário para acompanhar o indicador." });
      continue;
    }
    if (opts.teamSize < t.requires.team_min) {
      blocked.push({ track: t, reason: `Indicada para equipes com pelo menos ${t.requires.team_min} pessoas.` });
      continue;
    }
    let fit = 0;
    const reasons: string[] = [];
    for (const trg of t.triggers) {
      if (evaluateCondition(trg, dx.signals) === true) {
        fit += trg.weight;
        reasons.push(describeCondition(trg));
      }
    }
    const pinned = opts.pinned?.includes(t.code);
    if (fit === 0 && !pinned) continue;
    const dimScore = dx.signals.dimensions[t.dimension] ?? 50;
    const dimWeight = m.manifest.dimensions.find((d) => d.code === t.dimension)!.weight;
    const urgency = stage.code === "sobrevivencia" && t.dimension === "caixa_financas" ? 1.5 : 1;
    // Trilhas de base (fundação) vêm antes nos estágios iniciais.
    const baseBoost = t.tags.includes("base") && stage.order <= 2 ? 1.25 : 1;
    const score =
      Math.round((fit * t.impact * (1 + (100 - dimScore) / 100) * dimWeight * urgency * baseBoost * (pinned ? 10 : 1)) / Math.sqrt(t.effort) * 100) / 100;
    candidates.push({ track: t, score, fit, reasons });
  }

  candidates.sort((a, b) => b.score - a.score || a.track.code.localeCompare(b.track.code));
  const selected: PriorityPick[] = [];
  const deferred: PrioritizationResult["deferred"] = [];
  const perDim = new Map<string, number>();
  for (const c of candidates) {
    const n = perDim.get(c.track.dimension) ?? 0;
    if (selected.length >= max_priorities) {
      deferred.push({ track: c.track, score: c.score, reason: "Limite de 3 prioridades por ciclo: fica como candidata ao próximo ciclo." });
    } else if (n >= max_priorities_per_dimension) {
      deferred.push({ track: c.track, score: c.score, reason: "Já há prioridades suficientes nesta dimensão neste ciclo." });
    } else {
      selected.push(c);
      perDim.set(c.track.dimension, n + 1);
    }
  }
  return { selected, deferred, blocked };
}

/** Regra RF08: trocar uma prioridade exige justificativa; nunca mais de 3 ativas. */
export function assertCanAddPriority(activeCount: number, replacing?: { reason?: string }): void {
  const max = getMethod().manifest.limits.max_priorities;
  if (activeCount < max) return;
  if (!replacing) throw new Error(`Já existem ${max} prioridades ativas. Para incluir outra, substitua uma.`);
  if (!replacing.reason || replacing.reason.trim().length < 10)
    throw new Error("Para substituir uma prioridade, registre uma justificativa (mínimo de 10 caracteres).");
}
