import { createHash } from "node:crypto";
import { isValidCnpj, isValidCpf } from "../cnpj";
import { normalizeText, onlyDigits } from "../text";

export interface Counterparty {
  kind: "pf" | "pj" | "unknown";
  /** Hash do documento (nunca guardamos CPF de terceiros em claro). */
  docHash?: string;
  /** Nome aproximado extraído da descrição (ex.: após "PIX RECEBIDO -"). */
  name?: string;
}

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const PIX_NAME_RE = /PIX (?:RECEBIDO|ENVIADO|REC|ENV|TRANSF|TRANSFERENCIA)[^A-Z]*(?:DE|PARA|-)?\s*([A-Z][A-Z .]{2,60})/;

/**
 * Minimiza dados de terceiros (LGPD): mascara CPF na descrição e devolve só o hash do documento.
 * `salt` deve ser por organização para impedir correlação entre clientes.
 */
export function sanitizeDescription(description: string, salt: string): { description: string; counterparty: Counterparty } {
  let out = description;
  let counterparty: Counterparty = { kind: "unknown" };
  for (const m of description.match(CNPJ_RE) ?? []) {
    if (isValidCnpj(onlyDigits(m))) {
      counterparty = { kind: "pj", docHash: hash(onlyDigits(m), salt) };
    }
  }
  for (const m of description.match(CPF_RE) ?? []) {
    const d = onlyDigits(m);
    if (d.length === 11 && isValidCpf(d)) {
      counterparty = { kind: "pf", docHash: hash(d, salt) };
      out = out.replace(m, `***.${d.slice(3, 6)}.***-**`);
    }
  }
  const nm = normalizeText(out).match(PIX_NAME_RE);
  if (nm?.[1]) counterparty.name = nm[1].trim().replace(/\s+/g, " ");
  return { description: out, counterparty };
}

function hash(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}
