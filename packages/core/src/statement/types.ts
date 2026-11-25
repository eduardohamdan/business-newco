import type { Cents } from "../money";

export interface ParsedTransaction {
  /** Data de lançamento ISO (YYYY-MM-DD). */
  postedAt: string;
  /** Positivo = entrada; negativo = saída. */
  amountCents: Cents;
  description: string;
  /** Identificador do banco (FITID no OFX), quando existir. */
  externalId?: string;
  /** Saldo após o lançamento, quando o arquivo informa. */
  balanceAfterCents?: Cents;
  /** Proveniência: linha/página do arquivo original. */
  provenance: { line?: number; page?: number };
}

export interface ParsedStatement {
  format: "ofx" | "csv" | "pdf";
  bankId?: string;
  bankName?: string;
  accountId?: string;
  currency: "BRL";
  periodStart?: string;
  periodEnd?: string;
  openingBalanceCents?: Cents;
  closingBalanceCents?: Cents;
  transactions: ParsedTransaction[];
  warnings: string[];
}

export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementParseError";
  }
}
