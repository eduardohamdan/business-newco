/** Converte datas comuns em extratos brasileiros para ISO YYYY-MM-DD. Retorna null se inválida. */
export function parseDate(input: string, fallbackYear?: number): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else if ((mt = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    d = Number(mt[1]);
    m = Number(mt[2]);
    y = Number(mt[3]);
    if (y < 100) y += 2000;
  } else if ((mt = s.match(/^(\d{1,2})[/.-](\d{1,2})$/)) && fallbackYear) {
    d = Number(mt[1]);
    m = Number(mt[2]);
    y = fallbackYear;
  } else if ((mt = s.match(/^(\d{4})(\d{2})(\d{2})/))) {
    // OFX: YYYYMMDD[HHMMSS...]
    [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

export function addDays(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
