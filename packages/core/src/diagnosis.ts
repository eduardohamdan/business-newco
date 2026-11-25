import { getMethod, type DimensionCode, type StageCode } from "@beos/method";
import { computeConfidence, confidenceLabel, type ConfidenceLabel } from "./confidence";
import type { MaturityResult } from "./maturity";
import type { RaioX } from "./raiox";
import { classifyStage, type StageResult } from "./stage";
import type { Signals } from "./signals";

/** Indicadores essenciais para um diagnóstico conclusivo. */
export const ESSENTIAL_METRICS = [
  "folego_caixa_dias",
  "despesas_pessoais_pj_pct",
  "faturamento_mensal",
  "meses_caixa_negativo",
  "margem_bruta_pct",
] as const;

export interface PanelItem {
  metric: string;
  name: string;
  value: number | null;
  unit: string;
  source: "raiox" | "manual" | "ritual" | "system";
  asOf?: string;
}

export interface Finding {
  code: string;
  dimension: DimensionCode;
  title: string;
  body: string;
  evidence: string[];
  impact: number; // 1–5
  urgency: number; // 1–5
  confidence: number; // 0–1
  rank: number;
}

export interface DiagnosisInput {
  maturity: MaturityResult;
  raiox?: RaioX;
  /** Indicadores informados manualmente (ex.: margem_bruta_pct, inadimplencia_pct). */
  manualMetrics?: Partial<Record<string, number>>;
  facts?: { teamSize?: number; revenueBand?: string; sector?: string };
  dataAsOf?: string;
  today?: string;
}

export interface Diagnosis {
  stage: StageResult;
  maturity: MaturityResult;
  panel: PanelItem[];
  findings: Finding[];
  coverage: number;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  /** false = só hipóteses; o sistema deve pedir os dados listados em missingData. */
  sufficient: boolean;
  missingData: { metric: string; request: string }[];
  signals: Signals;
  methodVersion: string;
}

export function buildSignals(i: DiagnosisInput): Signals {
  const metrics: Record<string, number> = {};
  if (i.raiox) for (const [k, v] of Object.entries(i.raiox.metrics)) if (v.value !== null) metrics[k] = v.value;
  for (const [k, v] of Object.entries(i.manualMetrics ?? {})) if (typeof v === "number") metrics[k] = v;
  const dimensions: Signals["dimensions"] = {};
  for (const d of Object.values(i.maturity.dimensions)) if (d.score !== null) dimensions[d.code] = d.score;
  return {
    metrics,
    dimensions,
    maturityAvg: i.maturity.avg ?? undefined,
    facts: { team_size: i.facts?.teamSize ?? 1, revenue_band: i.facts?.revenueBand ?? "", sector: i.facts?.sector ?? "" },
  };
}

const REQUEST_TEXT: Record<string, string> = {
  folego_caixa_dias: "Envie o extrato bancário PJ dos últimos 3 meses (OFX, CSV ou PDF).",
  despesas_pessoais_pj_pct: "Envie o extrato bancário PJ para identificarmos gastos pessoais.",
  faturamento_mensal: "Informe o faturamento dos últimos 3 meses ou envie o extrato.",
  meses_caixa_negativo: "Envie o extrato dos últimos 3 meses.",
  margem_bruta_pct: "Informe a margem bruta aproximada (ou use a calculadora de preço com seus 5 principais itens).",
};

export function diagnose(i: DiagnosisInput): Diagnosis {
  const m = getMethod();
  const signals = buildSignals(i);
  const stage = classifyStage(signals);

  const available = ESSENTIAL_METRICS.filter((k) => signals.metrics[k] !== undefined);
  const dataCoverage = available.length / ESSENTIAL_METRICS.length;
  const coverage = Math.round((0.6 * i.maturity.coverage + 0.4 * dataCoverage) * 100) / 100;
  const consistency = !i.raiox ? 0.6 : i.raiox.coverage.reconcileStatus === "ok" ? 1 : i.raiox.coverage.reconcileStatus === "derived" ? 0.85 : i.raiox.coverage.reconcileStatus === "unverifiable" ? 0.6 : 0;
  const freshnessDays = i.dataAsOf && i.today ? Math.max(0, (Date.parse(i.today) - Date.parse(i.dataAsOf)) / 86_400_000) : undefined;
  const confidence = computeConfidence({
    coverage,
    freshnessDays,
    consistency,
    dataQuality: i.raiox ? i.raiox.coverage.categorizedValuePct / 100 : undefined,
  });

  const panel: PanelItem[] = m.metrics
    .filter((x) => signals.metrics[x.code] !== undefined || (ESSENTIAL_METRICS as readonly string[]).includes(x.code))
    .map((x) => ({
      metric: x.code,
      name: x.name,
      value: signals.metrics[x.code] ?? null,
      unit: x.unit,
      source: i.manualMetrics?.[x.code] !== undefined ? "manual" : x.source,
      asOf: i.dataAsOf,
    }));

  const findings = buildFindings(i, stage.stage, confidence);
  return {
    stage,
    maturity: i.maturity,
    panel,
    findings,
    coverage,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    sufficient: coverage >= m.manifest.limits.min_coverage_for_diagnosis && confidenceLabel(confidence) !== "insuficiente",
    missingData: ESSENTIAL_METRICS.filter((k) => signals.metrics[k] === undefined).map((k) => ({ metric: k, request: REQUEST_TEXT[k]! })),
    signals,
    methodVersion: m.manifest.version,
  };
}

const URGENCY: Record<StageCode, Partial<Record<DimensionCode, number>>> = {
  sobrevivencia: { caixa_financas: 5, vendas_clientes: 4 },
  organizacao: { vendas_clientes: 4, direcao_foco: 4, caixa_financas: 4 },
  crescimento: { pessoas_lideranca: 4, vendas_clientes: 4, operacao_entrega: 4 },
  escala: { pessoas_lideranca: 4, direcao_foco: 4 },
};

function buildFindings(i: DiagnosisInput, stage: StageCode, confidence: number): Finding[] {
  const m = getMethod();
  const out: Omit<Finding, "rank">[] = [];
  const dimName = (d: DimensionCode) => m.manifest.dimensions.find((x) => x.code === d)!.name;
  const dimWeight = (d: DimensionCode) => m.manifest.dimensions.find((x) => x.code === d)!.weight;

  // 1) Alertas do Raio-X viram achados com números.
  for (const a of i.raiox?.alerts ?? []) {
    if (a.code === "sem_alertas") continue;
    const metric = a.metric ? m.metrics.find((x) => x.code === a.metric) : undefined;
    const dim = metric?.dimension ?? "caixa_financas";
    out.push({
      code: `raiox_${a.code}`,
      dimension: dim,
      title: a.title,
      body: a.detail,
      evidence: [`Raio-X de Caixa (${i.raiox!.periodStart} a ${i.raiox!.periodEnd})`, metric ? `${metric.name}: ${a.value}` : ""].filter(Boolean),
      impact: a.severity === 3 ? 5 : 4,
      urgency: URGENCY[stage][dim] ?? 3,
      confidence,
    });
  }
  // 2) Dimensões frágeis no questionário.
  for (const d of Object.values(i.maturity.dimensions)) {
    if (d.score === null || d.score >= 55) continue;
    out.push({
      code: `maturidade_${d.code}`,
      dimension: d.code,
      title: `${dimName(d.code)} pede atenção`,
      body: `O índice de maturidade em ${dimName(d.code)} está em ${d.score} de 100.`,
      evidence: d.weakest.map((w) => `"${w.text}" → ${w.answer}`),
      impact: Math.min(5, Math.max(2, Math.round(dimWeight(d.code) * (d.score < 35 ? 4 : 3)))),
      urgency: URGENCY[stage][d.code] ?? 3,
      confidence: Math.min(confidence, 0.9),
    });
  }
  return out
    .sort((a, b) => b.impact * b.urgency - a.impact * a.urgency || a.code.localeCompare(b.code))
    .slice(0, 5)
    .map((f, idx) => ({ ...f, rank: idx + 1 }));
}
