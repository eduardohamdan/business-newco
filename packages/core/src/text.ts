/** Normaliza texto para comparação: maiúsculas, sem acentos, espaços colapsados. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^\w\s*./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai apenas dígitos. */
export const onlyDigits = (s: string): string => s.replace(/\D/g, "");
