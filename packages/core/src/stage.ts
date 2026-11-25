import { getMethod, type Condition, type StageCode } from "@beos/method";
import { evaluateGroup, type Signals } from "./signals";

export interface StageResult {
  stage: StageCode;
  /** Condições que levaram ao estágio (explicação). */
  reasons: Condition[];
  /** Sinais que faltaram nas regras avaliadas (reduzem a confiança). */
  missingSignals: string[];
  methodVersion: string;
}

/**
 * Estágio é determinístico: o primeiro estágio, em ordem, cuja regra casar. O último é o padrão.
 * Sinais ausentes nunca casam (não presumimos), mas ficam registrados.
 */
export function classifyStage(signals: Signals): StageResult {
  const m = getMethod();
  const missing = new Set<string>();
  for (const st of [...m.manifest.stages].sort((a, b) => a.order - b.order)) {
    if (!st.rule) return { stage: st.code, reasons: [], missingSignals: [...missing], methodVersion: m.manifest.version };
    const ev = evaluateGroup(st.rule, signals);
    ev.missingSignals.forEach((s) => missing.add(s));
    if (ev.matched) return { stage: st.code, reasons: ev.matchedConditions, missingSignals: [...missing], methodVersion: m.manifest.version };
  }
  throw new Error("Método sem estágio padrão");
}

export const stageOrder = (code: StageCode): number => getMethod().manifest.stages.find((s) => s.code === code)!.order;
