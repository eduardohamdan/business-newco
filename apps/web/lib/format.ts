import { formatBRL } from "@beos/core";
import { getMetric } from "@beos/method";

export function formatMetric(code: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const m = getMetric(code);
  switch (m.unit) {
    case "brl_cents":
      return formatBRL(value);
    case "pct":
      return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "dias":
      return `${Math.round(value)} dias`;
    case "hours":
      return `${value.toLocaleString("pt-BR")} h`;
    default:
      return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  }
}

export const formatDate = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const iso = v instanceof Date ? v.toISOString() : String(v);
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

export const STAGE_LABEL: Record<string, string> = {
  sobrevivencia: "Sobrevivência",
  organizacao: "Organização",
  crescimento: "Crescimento",
  escala: "Escala",
};

export const RISK_LABEL: Record<string, { text: string; tone: "green" | "amber" | "red" }> = {
  on_track: { text: "No ritmo", tone: "green" },
  at_risk: { text: "Atenção", tone: "amber" },
  off_track: { text: "Atrasado", tone: "red" },
};

export const CONFIDENCE_TEXT: Record<string, string> = { alta: "Confiança alta", moderada: "Confiança moderada", insuficiente: "Dados insuficientes" };
