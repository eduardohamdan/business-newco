export * from "./types";
export * from "./dates";
export * from "./decode";
export * from "./ofx";
export * from "./csv";
export * from "./normalize";
export * from "./dedupe";
export * from "./reconcile";

import { parseCsv } from "./csv";
import { decodeStatementBytes, sniffFormat } from "./decode";
import { parseOfx } from "./ofx";
import { StatementParseError, type ParsedStatement } from "./types";

/** Ponto de entrada para OFX/CSV. PDF é tratado pelo serviço services/pdf-extractor. */
export function parseStatementFile(filename: string, bytes: Uint8Array): ParsedStatement {
  const fmt = sniffFormat(filename, bytes);
  const text = decodeStatementBytes(bytes);
  if (fmt === "ofx") return parseOfx(text);
  if (fmt === "csv") return parseCsv(text);
  if (fmt === "pdf") throw new StatementParseError("PDF deve ser enviado ao extrator de PDF.");
  // Tenta adivinhar pelo conteúdo.
  if (/<OFX>/i.test(text)) return parseOfx(text);
  return parseCsv(text);
}
