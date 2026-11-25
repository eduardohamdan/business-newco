/**
 * Extratos brasileiros chegam em UTF-8 ou Latin-1 (Windows-1252). Tenta UTF-8 estrito e cai para Latin-1.
 */
export function decodeStatementBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export type StatementFormat = "ofx" | "csv" | "pdf" | "unknown";

export function sniffFormat(filename: string, head: Uint8Array): StatementFormat {
  const name = filename.toLowerCase();
  const text = new TextDecoder("latin1").decode(head.slice(0, 512));
  if (text.startsWith("%PDF")) return "pdf";
  if (/OFXHEADER|<OFX>/i.test(text) || name.endsWith(".ofx")) return "ofx";
  if (name.endsWith(".csv") || name.endsWith(".txt")) return "csv";
  return "unknown";
}
