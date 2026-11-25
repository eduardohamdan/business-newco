/**
 * Dinheiro é sempre inteiro em centavos. Nunca usar float para somar valores monetários.
 */
export type Cents = number;

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: Cents): string {
  return BRL.format(cents / 100);
}

/** Formata um percentual com uma casa decimal no padrão brasileiro. */
export function formatPct(value: number, digits = 1): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/**
 * Converte valores escritos em formatos brasileiros ou internacionais para centavos.
 * Aceita: "1.234,56", "-1.234,56", "1234.56", "R$ 1.234,56", "(1.234,56)", "1.234,56 D", "1.234,56-", "1,234.56".
 * Retorna null se não for um número.
 */
export function parseAmount(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.trim().toUpperCase();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Sufixo de débito/crédito usado por vários bancos: "123,45 D" / "123,45 C".
  const dc = s.match(/\s*([DC])$/);
  if (dc) {
    if (dc[1] === "D") negative = true;
    s = s.slice(0, -dc[0].length);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/R\$|\s/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // O separador que aparece por último é o decimal.
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const commas = (s.match(/,/g) ?? []).length;
    normalized = commas > 1 || decimals === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    const dots = (s.match(/\./g) ?? []).length;
    normalized = dots > 1 || decimals === 3 ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`Valor monetário não inteiro: ${v}`);
    total += v;
  }
  return total;
}

/** Percentual a partir de duas grandezas; retorna null quando o denominador é zero. */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return round1((numerator / denominator) * 100);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
