import { getMethod } from "@beos/method";
import { round1 } from "./money";

export type ConfidenceLabel = "alta" | "moderada" | "insuficiente";

export interface ConfidenceInput {
  /** Fração dos sinais essenciais disponíveis (0–1). */
  coverage: number;
  /** Idade do dado mais recente relevante, em dias. */
  freshnessDays?: number;
  /** Concordância entre fontes (ex.: saldo conciliado = 1; não verificável = 0,6; divergente = 0). */
  consistency?: number;
  /** Fração do valor categorizado com confiança ≥ 0,7 (0–1). */
  dataQuality?: number;
}

/** Confiança interna 0–1. O cliente vê só o rótulo. */
export function computeConfidence(i: ConfidenceInput): number {
  const fresh = i.freshnessDays === undefined ? 0.7 : i.freshnessDays <= 35 ? 1 : i.freshnessDays >= 120 ? 0 : 1 - (i.freshnessDays - 35) / 85;
  const v = 0.45 * clamp(i.coverage) + 0.2 * fresh + 0.2 * clamp(i.consistency ?? 0.7) + 0.15 * clamp(i.dataQuality ?? 0.7);
  return Math.round(v * 100) / 100;
}

export function confidenceLabel(v: number): ConfidenceLabel {
  const { confidence_high, confidence_moderate } = getMethod().manifest.limits;
  return v >= confidence_high ? "alta" : v >= confidence_moderate ? "moderada" : "insuficiente";
}

export const LABEL_TEXT: Record<ConfidenceLabel, string> = {
  alta: "Confiança alta",
  moderada: "Confiança moderada",
  insuficiente: "Dados insuficientes",
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const pctOf = (n: number) => round1(n * 100);
