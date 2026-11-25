import { sumCents, type Cents } from "../money";
import type { ParsedStatement } from "./types";

export type ReconcileStatus = "ok" | "mismatch" | "derived" | "unverifiable";

export interface ReconcileResult {
  status: ReconcileStatus;
  openingCents?: Cents;
  closingCents?: Cents;
  movementCents: Cents;
  diffCents: Cents;
  message: string;
}

/**
 * Saldo inicial + movimentos = saldo final. Divergência BLOQUEIA o Raio-X (regra do PRD).
 * Se só há saldo final, o inicial é derivado (status "derived"). Sem saldos, o Raio-X segue com confiança menor.
 */
export function reconcile(st: ParsedStatement): ReconcileResult {
  const movement = sumCents(st.transactions.map((t) => t.amountCents));
  const { openingBalanceCents: o, closingBalanceCents: c } = st;
  if (o !== undefined && c !== undefined) {
    const diff = o + movement - c;
    return diff === 0
      ? { status: "ok", openingCents: o, closingCents: c, movementCents: movement, diffCents: 0, message: "Saldos conferem com os lançamentos." }
      : {
          status: "mismatch",
          openingCents: o,
          closingCents: c,
          movementCents: movement,
          diffCents: diff,
          message: "Saldo inicial + lançamentos não bate com o saldo final. Pode faltar um período ou um lançamento no arquivo.",
        };
  }
  if (c !== undefined) {
    return { status: "derived", openingCents: c - movement, closingCents: c, movementCents: movement, diffCents: 0, message: "Saldo inicial calculado a partir do saldo final." };
  }
  if (o !== undefined) {
    return { status: "derived", openingCents: o, closingCents: o + movement, movementCents: movement, diffCents: 0, message: "Saldo final calculado a partir do saldo inicial." };
  }
  return { status: "unverifiable", movementCents: movement, diffCents: 0, message: "O arquivo não traz saldos; não foi possível conferir." };
}
