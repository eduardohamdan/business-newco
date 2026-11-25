import type { Condition, ConditionGroup, DimensionCode } from "@beos/method";

/** Conjunto de sinais disponíveis para regras determinísticas (estágio, gatilhos de trilha). */
export interface Signals {
  metrics: Partial<Record<string, number>>;
  dimensions: Partial<Record<DimensionCode, number>>;
  maturityAvg?: number;
  facts: Partial<Record<string, string | number>>;
}

export const emptySignals = (): Signals => ({ metrics: {}, dimensions: {}, facts: {} });

/** Lê um sinal ("metric:x", "dimension:y", "maturity:avg", "fact:z"). Retorna undefined se ausente. */
export function readSignal(signal: string, s: Signals): number | string | undefined {
  const [kind, code] = signal.split(":") as [string, string];
  switch (kind) {
    case "metric":
      return s.metrics[code];
    case "dimension":
      return s.dimensions[code as DimensionCode];
    case "maturity":
      return code === "avg" ? s.maturityAvg : undefined;
    case "fact":
      return s.facts[code];
    default:
      return undefined;
  }
}

/** true/false quando o sinal existe; undefined quando falta o dado (nunca presumimos). */
export function evaluateCondition(c: Condition, s: Signals): boolean | undefined {
  const v = readSignal(c.signal, s);
  if (v === undefined || v === null) return undefined;
  switch (c.op) {
    case "lt":
      return Number(v) < Number(c.value);
    case "lte":
      return Number(v) <= Number(c.value);
    case "gt":
      return Number(v) > Number(c.value);
    case "gte":
      return Number(v) >= Number(c.value);
    case "eq":
      return String(v) === String(c.value);
    case "neq":
      return String(v) !== String(c.value);
  }
}

export interface GroupEvaluation {
  matched: boolean;
  matchedConditions: Condition[];
  missingSignals: string[];
}

export function evaluateGroup(g: ConditionGroup, s: Signals): GroupEvaluation {
  const results = g.conditions.map((c) => ({ c, r: evaluateCondition(c, s) }));
  const matchedConditions = results.filter((x) => x.r === true).map((x) => x.c);
  const missingSignals = results.filter((x) => x.r === undefined).map((x) => x.c.signal);
  const matched =
    g.mode === "any"
      ? matchedConditions.length > 0
      : results.length > 0 && results.every((x) => x.r === true);
  return { matched, matchedConditions, missingSignals };
}

export function describeCondition(c: Condition): string {
  const ops: Record<Condition["op"], string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=", neq: "≠" };
  return `${c.signal} ${ops[c.op]} ${c.value}`;
}
