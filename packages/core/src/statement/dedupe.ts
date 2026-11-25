import { createHash } from "node:crypto";
import { normalizeText } from "../text";
import type { ParsedTransaction } from "./types";

/**
 * Hash determinístico por lançamento para que reenviar o mesmo extrato não duplique dados.
 * Lançamentos idênticos no mesmo dia (ex.: duas tarifas iguais) recebem ordinal.
 */
export function dedupeHashes(accountKey: string, txns: readonly ParsedTransaction[]): string[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const base = t.externalId
      ? `${accountKey}|fitid|${t.externalId}|${t.postedAt}|${t.amountCents}`
      : `${accountKey}|${t.postedAt}|${t.amountCents}|${normalizeText(t.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("sha256").update(`${base}|${n}`).digest("hex");
  });
}
