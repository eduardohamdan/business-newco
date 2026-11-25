/**
 * Validação de CNPJ nos dois formatos:
 * - numérico (14 dígitos)
 * - alfanumérico (Receita Federal, a partir de julho/2026): 12 posições com [0-9A-Z] + 2 dígitos verificadores numéricos.
 * O cálculo do DV usa o valor ASCII do caractere menos 48, com os pesos tradicionais e módulo 11.
 */
const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(input: string): string {
  return input.toUpperCase().replace(/[.\-/\s]/g, "");
}

function dv(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += (base.charCodeAt(i) - 48) * weights[i]!;
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function computeCnpjCheckDigits(base12: string): string {
  const b = normalizeCnpj(base12);
  if (!/^[0-9A-Z]{12}$/.test(b)) throw new Error("Base de CNPJ deve ter 12 caracteres alfanuméricos");
  const d1 = dv(b, W1);
  const d2 = dv(b + String(d1), W2);
  return `${d1}${d2}`;
}

export function isValidCnpj(input: string): boolean {
  const c = normalizeCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // 00000000000000, 11111111111111...
  return computeCnpjCheckDigits(c.slice(0, 12)) === c.slice(12);
}

export function formatCnpj(input: string): string {
  const c = normalizeCnpj(input);
  if (c.length !== 14) return input;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** CPF (para mascarar contrapartes pessoa física em extratos). */
export function isValidCpf(input: string): boolean {
  const c = input.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}
