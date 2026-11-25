import { getMethod, type CategoryGroup } from "@beos/method";
import { pct, round1, sumCents, type Cents } from "./money";
import { monthOf } from "./statement/dates";
import type { ReconcileResult } from "./statement/reconcile";

export interface RaioXTransaction {
  postedAt: string;
  amountCents: Cents;
  categoryCode: string;
  confidence: number;
  personalSuspect: boolean;
  /** Chave da contraparte (hash do documento ou nome normalizado), para concentração de receita. */
  counterpartyKey?: string;
}

export interface MonthSummary {
  month: string;
  inflowCents: Cents;
  outflowCents: Cents;
  netCents: Cents;
}

export interface RaioXAlert {
  code: string;
  severity: 1 | 2 | 3;
  title: string;
  detail: string;
  metric?: string;
  value?: number;
}

export interface MetricResult {
  value: number | null;
  formula: string;
}

export interface RaioX {
  periodStart: string;
  periodEnd: string;
  months: MonthSummary[];
  byCategory: { categoryCode: string; group: CategoryGroup; totalCents: Cents; count: number }[];
  metrics: Record<
    | "folego_caixa_dias"
    | "meses_caixa_negativo"
    | "despesas_pessoais_pj_pct"
    | "tarifas_bancarias_pct"
    | "concentracao_receita_pct"
    | "faturamento_mensal"
    | "custo_variavel_pct",
    MetricResult
  >;
  closingBalanceCents?: Cents;
  avgMonthlyOutflowCents: Cents;
  coverage: { months: number; categorizedValuePct: number; reconcileStatus: ReconcileResult["status"] };
  alerts: RaioXAlert[];
  /** Os 3 achados principais, em ordem de severidade. */
  highlights: RaioXAlert[];
}

/** Grupos que não são operação: não entram em "entradas/saídas operacionais". */
const NON_OPERATIONAL: CategoryGroup[] = ["transferencia_interna", "investimento"];
const NON_OPERATIONAL_INFLOW: CategoryGroup[] = [...NON_OPERATIONAL, "financeiro"];

/**
 * Calcula o Raio-X de Caixa de forma 100% determinística. A IA só redige o texto a partir destes números.
 */
export function computeRaioX(
  txns: readonly RaioXTransaction[],
  opts: { closingBalanceCents?: Cents; reconcile: ReconcileResult },
): RaioX {
  if (!txns.length) throw new Error("Raio-X sem lançamentos.");
  const groupOf = new Map(getMethod().categories.map((c) => [c.code, c.group]));
  const g = (code: string): CategoryGroup => groupOf.get(code) ?? "outros";
  const sorted = [...txns].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  const periodStart = sorted[0]!.postedAt;
  const periodEnd = sorted.at(-1)!.postedAt;

  // Mensal (operacional)
  const monthsMap = new Map<string, MonthSummary>();
  for (const t of sorted) {
    const m = monthOf(t.postedAt);
    const row = monthsMap.get(m) ?? { month: m, inflowCents: 0, outflowCents: 0, netCents: 0 };
    const grp = g(t.categoryCode);
    if (t.amountCents > 0 && !NON_OPERATIONAL_INFLOW.includes(grp) && grp !== "outros") row.inflowCents += t.amountCents;
    if (t.amountCents > 0 && grp === "outros" && t.categoryCode === "outros_entradas") row.inflowCents += t.amountCents;
    if (t.amountCents < 0 && !NON_OPERATIONAL.includes(grp)) row.outflowCents += -t.amountCents;
    row.netCents = row.inflowCents - row.outflowCents;
    monthsMap.set(m, row);
  }
  const months = [...monthsMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  // Meses completos: ignora o mês parcial se houver mais de um mês (evita distorcer médias).
  const full = months.length > 1 ? months.filter((m) => isFullMonth(m.month, periodStart, periodEnd)) : months;
  const base = full.length ? full : months;

  // Por categoria
  const catMap = new Map<string, { categoryCode: string; group: CategoryGroup; totalCents: number; count: number }>();
  for (const t of sorted) {
    const row = catMap.get(t.categoryCode) ?? { categoryCode: t.categoryCode, group: g(t.categoryCode), totalCents: 0, count: 0 };
    row.totalCents += t.amountCents;
    row.count++;
    catMap.set(t.categoryCode, row);
  }
  const byCategory = [...catMap.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents));

  const sumGroup = (grp: CategoryGroup, sign: 1 | -1) =>
    sumCents(sorted.filter((t) => g(t.categoryCode) === grp && Math.sign(t.amountCents) === sign).map((t) => Math.abs(t.amountCents)));
  const totalOperationalOutflow = sumCents(base.map((m) => m.outflowCents));
  const totalOperationalInflow = sumCents(base.map((m) => m.inflowCents));
  const avgMonthlyOutflow = Math.round(totalOperationalOutflow / base.length);
  const receita = sumGroup("receita", 1);
  const allOutflow = sumCents(sorted.filter((t) => t.amountCents < 0 && !NON_OPERATIONAL.includes(g(t.categoryCode))).map((t) => -t.amountCents));
  const pessoal = sumCents(sorted.filter((t) => t.amountCents < 0 && t.personalSuspect).map((t) => -t.amountCents));
  const tarifas = sumCents(
    sorted.filter((t) => ["tarifas_bancarias", "juros_emprestimos"].includes(t.categoryCode)).map((t) => Math.abs(t.amountCents)),
  );
  const custoVar = sumGroup("custo_variavel", -1);

  // Concentração: maior pagador / receita total
  const byPayer = new Map<string, number>();
  for (const t of sorted) {
    if (t.amountCents > 0 && g(t.categoryCode) === "receita" && t.counterpartyKey) {
      byPayer.set(t.counterpartyKey, (byPayer.get(t.counterpartyKey) ?? 0) + t.amountCents);
    }
  }
  const topPayer = Math.max(0, ...byPayer.values());

  const closing = opts.closingBalanceCents ?? opts.reconcile.closingCents;
  const last3 = months.slice(-3);

  const metrics: RaioX["metrics"] = {
    folego_caixa_dias: {
      value: closing !== undefined && avgMonthlyOutflow > 0 ? Math.max(0, Math.round((closing / avgMonthlyOutflow) * 30)) : null,
      formula: "saldo final / média mensal de saídas operacionais × 30",
    },
    meses_caixa_negativo: {
      value: last3.filter((m) => m.netCents < 0).length,
      formula: "meses (dos últimos 3) com saídas operacionais maiores que as entradas",
    },
    despesas_pessoais_pj_pct: {
      value: pct(pessoal, allOutflow),
      formula: "saídas com indício de gasto pessoal / saídas operacionais × 100",
    },
    tarifas_bancarias_pct: {
      value: pct(tarifas, totalOperationalInflow || receita),
      formula: "tarifas, IOF e juros / entradas operacionais × 100",
    },
    concentracao_receita_pct: {
      value: byPayer.size >= 3 ? pct(topPayer, receita) : null,
      formula: "receita do maior pagador / receita total × 100 (exige ao menos 3 pagadores identificados)",
    },
    faturamento_mensal: {
      value: base.length ? Math.round(sumCents(base.map((m) => m.inflowCents)) / base.length) : null,
      formula: "média mensal das entradas operacionais (centavos)",
    },
    custo_variavel_pct: {
      value: pct(custoVar, receita),
      formula: "fornecedores, fretes e taxas / receita × 100",
    },
  };

  const totalAbs = sumCents(sorted.map((t) => Math.abs(t.amountCents)));
  const categorizedAbs = sumCents(sorted.filter((t) => t.confidence >= 0.7).map((t) => Math.abs(t.amountCents)));

  const alerts = buildAlerts(metrics, months);
  return {
    periodStart,
    periodEnd,
    months,
    byCategory,
    metrics,
    closingBalanceCents: closing,
    avgMonthlyOutflowCents: avgMonthlyOutflow,
    coverage: {
      months: months.length,
      categorizedValuePct: round1((categorizedAbs / Math.max(1, totalAbs)) * 100),
      reconcileStatus: opts.reconcile.status,
    },
    alerts,
    highlights: alerts.slice(0, 3),
  };
}

function isFullMonth(month: string, start: string, end: string): boolean {
  const first = `${month}-01`;
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  const last = d.toISOString().slice(0, 10);
  // Tolerância de 3 dias nas bordas (feriados/fins de semana sem lançamento).
  const startOk = start <= addDaysIso(first, 3);
  const endOk = end >= addDaysIso(last, -3);
  return startOk && endOk;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildAlerts(m: RaioX["metrics"], months: MonthSummary[]): RaioXAlert[] {
  const a: RaioXAlert[] = [];
  const v = (k: keyof RaioX["metrics"]) => m[k].value;
  const folego = v("folego_caixa_dias");
  if (folego !== null && folego < 15)
    a.push({ code: "folego_critico", severity: 3, title: "Caixa para menos de 15 dias", detail: `Com o saldo atual, a empresa cobre cerca de ${folego} dias de saídas.`, metric: "folego_caixa_dias", value: folego });
  else if (folego !== null && folego < 30)
    a.push({ code: "folego_baixo", severity: 2, title: "Fôlego de caixa abaixo de 30 dias", detail: `O saldo cobre cerca de ${folego} dias de saídas. O recomendado é pelo menos 30.`, metric: "folego_caixa_dias", value: folego });
  const neg = v("meses_caixa_negativo");
  if (neg !== null && neg >= 2)
    a.push({ code: "caixa_negativo", severity: 3, title: "Saídas maiores que entradas", detail: `Em ${neg} dos últimos ${Math.min(3, months.length)} meses saiu mais dinheiro do que entrou.`, metric: "meses_caixa_negativo", value: neg });
  const pessoal = v("despesas_pessoais_pj_pct");
  if (pessoal !== null && pessoal > 10)
    a.push({ code: "pf_pj_alto", severity: 3, title: "Despesas pessoais na conta da empresa", detail: `Cerca de ${pessoal}% das saídas parecem gastos pessoais. Isso esconde o lucro real.`, metric: "despesas_pessoais_pj_pct", value: pessoal });
  else if (pessoal !== null && pessoal > 5)
    a.push({ code: "pf_pj_medio", severity: 2, title: "Alguns gastos pessoais na conta PJ", detail: `Cerca de ${pessoal}% das saídas parecem pessoais.`, metric: "despesas_pessoais_pj_pct", value: pessoal });
  const tarifas = v("tarifas_bancarias_pct");
  if (tarifas !== null && tarifas > 2)
    a.push({ code: "tarifas_altas", severity: 2, title: "Tarifas e juros pesando", detail: `Tarifas, IOF e juros consomem ${tarifas}% das entradas.`, metric: "tarifas_bancarias_pct", value: tarifas });
  const conc = v("concentracao_receita_pct");
  if (conc !== null && conc > 30)
    a.push({ code: "concentracao", severity: 2, title: "Receita concentrada", detail: `Um único pagador responde por ${conc}% das entradas.`, metric: "concentracao_receita_pct", value: conc });
  const cv = v("custo_variavel_pct");
  if (cv !== null && cv > 55)
    a.push({ code: "custo_variavel_alto", severity: 2, title: "Custo variável alto", detail: `Compras e insumos somam ${cv}% da receita.`, metric: "custo_variavel_pct", value: cv });
  if (!a.length)
    a.push({ code: "sem_alertas", severity: 1, title: "Caixa sem alertas graves", detail: "Nenhum sinal crítico no período. O foco pode ir para crescimento e organização." });
  return a.sort((x, y) => y.severity - x.severity);
}
