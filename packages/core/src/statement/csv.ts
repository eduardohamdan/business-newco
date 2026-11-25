import { parseAmount } from "../money";
import { normalizeText } from "../text";
import { parseDate } from "./dates";
import { StatementParseError, type ParsedStatement, type ParsedTransaction } from "./types";

/** Divide uma linha CSV respeitando aspas. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(lines: string[]): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.slice(0, 15).map((l) => splitCsvLine(l, d).length);
    const consistent = counts.filter((c) => c === counts[0] && c > 1).length;
    const score = consistent * (counts[0] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

type Col = "date" | "description" | "amount" | "credit" | "debit" | "balance" | "dc" | "doc";
const MATCHERS: [Col, RegExp][] = [
  ["date", /^(DATA|DATE|DT)( (LANCAMENTO|MOVIMENTO|MOV))?$|^DATA/],
  ["balance", /SALDO|BALANCE/],
  ["credit", /CREDITO|ENTRADA/],
  ["debit", /DEBITO|SAIDA/],
  ["amount", /^VALOR|AMOUNT|QUANTIA|^MONTANTE/],
  ["dc", /^(D\/C|C\/D|TIPO|NATUREZA)$/],
  ["doc", /DOCUMENTO|^DOC|N DOC/],
  ["description", /HISTORICO|DESCRI|LANCAMENTO|MEMO|DETALHE|ESTABELECIMENTO|TITULO/],
];

function mapHeader(cells: string[]): Partial<Record<Col, number>> {
  const map: Partial<Record<Col, number>> = {};
  cells.forEach((raw, idx) => {
    const h = normalizeText(raw);
    for (const [col, re] of MATCHERS) {
      if (map[col] === undefined && re.test(h)) {
        map[col] = idx;
        break;
      }
    }
  });
  return map;
}

const BALANCE_ROW = /^SALDO( ANTERIOR| INICIAL| DO DIA| FINAL| ATUAL| EM C ?C)?\b|^S A L D O/;

export function parseCsv(text: string): ParsedStatement {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new StatementParseError("CSV vazio ou sem lançamentos.");
  const delimiter = detectDelimiter(lines);
  let headerIdx = -1;
  let map: Partial<Record<Col, number>> = {};
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const m = mapHeader(splitCsvLine(lines[i]!, delimiter));
    if (m.date !== undefined && (m.amount !== undefined || m.credit !== undefined || m.debit !== undefined)) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (headerIdx < 0)
    throw new StatementParseError("Não encontrei o cabeçalho do CSV (preciso de colunas de data e valor).");

  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];
  let openingFromRow: number | undefined;
  /** Linhas de saldo (exceto "saldo anterior") na ordem do arquivo. */
  const balanceRows: number[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, delimiter);
    const get = (c: Col) => (map[c] !== undefined ? (cells[map[c]!] ?? "") : "");
    const description = get("description") || get("doc") || "SEM DESCRICAO";
    const normDesc = normalizeText(description);
    const balance = get("balance") ? parseAmount(get("balance")) : null;
    if (BALANCE_ROW.test(normDesc)) {
      // Linhas de saldo não são lançamentos.
      const v = balance ?? parseAmount(get("amount"));
      if (v !== null) {
        if (/ANTERIOR|INICIAL/.test(normDesc) && openingFromRow === undefined) openingFromRow = v;
        else balanceRows.push(v);
      }
      continue;
    }
    const date = parseDate(get("date"));
    if (!date) {
      if (cells.some((c) => c)) warnings.push(`Linha ${i + 1} ignorada: data inválida.`);
      continue;
    }
    let amount: number | null = null;
    if (map.amount !== undefined) {
      amount = parseAmount(get("amount"));
      const dc = normalizeText(get("dc"));
      if (amount !== null && (dc === "D" || dc.startsWith("DEB")) && amount > 0) amount = -amount;
    } else {
      const cr = parseAmount(get("credit")) ?? 0;
      const db = parseAmount(get("debit")) ?? 0;
      amount = Math.abs(cr) - Math.abs(db);
    }
    if (amount === null || amount === 0) {
      warnings.push(`Linha ${i + 1} ignorada: valor inválido ou zero.`);
      continue;
    }
    transactions.push({
      postedAt: date,
      amountCents: amount,
      description: description.trim(),
      externalId: get("doc") || undefined,
      balanceAfterCents: balance ?? undefined,
      provenance: { line: i + 1 },
    });
  }
  if (!transactions.length) throw new StatementParseError("Nenhum lançamento válido no CSV.");

  // Alguns bancos exportam do mais recente para o mais antigo.
  const descending = transactions[0]!.postedAt > transactions.at(-1)!.postedAt;
  if (descending) transactions.reverse();

  let opening = openingFromRow;
  // Em arquivos do mais recente para o mais antigo, o primeiro saldo do arquivo é o final.
  let closing = descending ? balanceRows[0] : balanceRows.at(-1);
  const first = transactions[0]!;
  const last = transactions.at(-1)!;
  if (opening === undefined && first.balanceAfterCents !== undefined)
    opening = first.balanceAfterCents - first.amountCents;
  if (closing === undefined && last.balanceAfterCents !== undefined) closing = last.balanceAfterCents;

  return {
    format: "csv",
    currency: "BRL",
    periodStart: first.postedAt,
    periodEnd: last.postedAt,
    openingBalanceCents: opening,
    closingBalanceCents: closing,
    transactions,
    warnings,
  };
}
