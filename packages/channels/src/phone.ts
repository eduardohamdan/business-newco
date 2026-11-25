/** Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO). Retorna null se inválido. */
export function toE164BR(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return null;
  // Celular sem o 9 (formato antigo usado pelo WhatsApp em algumas regiões): mantém como veio.
  return `+${d}`;
}

/** WhatsApp devolve wa_id sem "+". */
export const fromWaId = (waId: string): string => `+${waId.replace(/\D/g, "")}`;
export const toWaId = (e164: string): string => e164.replace(/\D/g, "");
