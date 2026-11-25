import { parseAmount } from "../money";
import { parseDate } from "./dates";
import { StatementParseError, type ParsedStatement, type ParsedTransaction } from "./types";

/**
 * Parser OFX tolerante (SGML 1.x e XML 2.x). Bancos brasileiros frequentemente omitem tags de fechamento
 * de elementos folha e às vezes usam vírgula decimal — ambos são tratados.
 */
function leaf(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  const v = m?.[1]?.trim();
  return v ? v : undefined;
}

function blocks(text: string, tag: string): { body: string; index: number }[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  const out: { body: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ body: m[1] ?? "", index: m.index });
  return out;
}

const lineAt = (text: string, index: number) => text.slice(0, index).split(/\n/).length;

export function parseOfx(text: string): ParsedStatement {
  if (!/<OFX>/i.test(text)) throw new StatementParseError("Arquivo não parece ser OFX (tag <OFX> ausente).");
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];
  for (const { body, index } of blocks(text, "STMTTRN")) {
    const date = parseDate(leaf(body, "DTPOSTED") ?? "");
    const amount = parseAmount(leaf(body, "TRNAMT") ?? "");
    if (!date || amount === null) {
      warnings.push(`Lançamento ignorado na linha ${lineAt(text, index)}: data ou valor inválido.`);
      continue;
    }
    const memo = leaf(body, "MEMO");
    const name = leaf(body, "NAME");
    const description = [name, memo].filter(Boolean).join(" - ") || leaf(body, "TRNTYPE") || "SEM DESCRICAO";
    transactions.push({
      postedAt: date,
      amountCents: amount,
      description,
      externalId: leaf(body, "FITID"),
      provenance: { line: lineAt(text, index) },
    });
  }
  if (!transactions.length) throw new StatementParseError("Nenhum lançamento encontrado no OFX.");
  transactions.sort((a, b) => a.postedAt.localeCompare(b.postedAt));

  const ledger = blocks(text, "LEDGERBAL")[0]?.body;
  const closing = ledger ? parseAmount(leaf(ledger, "BALAMT") ?? "") : null;
  const tranList = blocks(text, "BANKTRANLIST")[0]?.body ?? text;
  const bankAcct = blocks(text, "BANKACCTFROM")[0]?.body ?? "";

  const st: ParsedStatement = {
    format: "ofx",
    bankId: leaf(bankAcct, "BANKID"),
    accountId: leaf(bankAcct, "ACCTID"),
    currency: "BRL",
    periodStart: parseDate(leaf(tranList, "DTSTART") ?? "") ?? transactions[0]!.postedAt,
    periodEnd: parseDate(leaf(tranList, "DTEND") ?? "") ?? transactions.at(-1)!.postedAt,
    closingBalanceCents: closing ?? undefined,
    transactions,
    warnings,
  };
  const cur = leaf(text, "CURDEF");
  if (cur && cur.toUpperCase() !== "BRL") warnings.push(`Moeda ${cur} diferente de BRL.`);
  return st;
}
