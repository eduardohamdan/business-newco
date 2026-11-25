import { round1, type Cents } from "./money";

/**
 * Calculadoras do Advisor e das trilhas. Todas puras e com passos explicáveis ("Por que isso?").
 * Percentuais são números de 0 a 100.
 */
export interface CalcResult<T> {
  value: T;
  steps: string[];
}

const assertPct = (n: number, name: string) => {
  if (!Number.isFinite(n) || n < 0 || n >= 100) throw new RangeError(`${name} deve estar entre 0 e 100`);
};

/** Preço = custo / (1 − (impostos + taxas + comissão + margem)). */
export function priceFromCost(i: {
  unitCostCents: Cents;
  taxPct: number;
  cardFeePct?: number;
  commissionPct?: number;
  targetMarginPct: number;
}): CalcResult<Cents> {
  const parts = i.taxPct + (i.cardFeePct ?? 0) + (i.commissionPct ?? 0) + i.targetMarginPct;
  if (parts >= 100) throw new RangeError("A soma de impostos, taxas, comissão e margem precisa ser menor que 100%.");
  [i.taxPct, i.targetMarginPct].forEach((v, idx) => assertPct(v, idx ? "Margem" : "Impostos"));
  const price = Math.ceil(i.unitCostCents / (1 - parts / 100));
  return {
    value: price,
    steps: [
      `Percentuais sobre o preço: impostos ${i.taxPct}% + taxas ${i.cardFeePct ?? 0}% + comissão ${i.commissionPct ?? 0}% + margem ${i.targetMarginPct}% = ${round1(parts)}%`,
      `Preço = custo ÷ (1 − ${round1(parts)}%)`,
    ],
  };
}

/** Margem de contribuição de um preço praticado. */
export function contributionMargin(i: {
  priceCents: Cents;
  unitCostCents: Cents;
  taxPct: number;
  cardFeePct?: number;
  commissionPct?: number;
}): CalcResult<{ marginCents: Cents; marginPct: number }> {
  if (i.priceCents <= 0) throw new RangeError("Preço deve ser maior que zero.");
  const variable = Math.round(i.priceCents * ((i.taxPct + (i.cardFeePct ?? 0) + (i.commissionPct ?? 0)) / 100));
  const marginCents = i.priceCents - i.unitCostCents - variable;
  return {
    value: { marginCents, marginPct: round1((marginCents / i.priceCents) * 100) },
    steps: [`Custos variáveis sobre o preço: ${variable / 100} reais`, `Margem = preço − custo − variáveis`],
  };
}

/** Ponto de equilíbrio em faturamento: custos fixos ÷ margem de contribuição %. */
export function breakEven(i: { fixedCostsCents: Cents; contributionMarginPct: number }): CalcResult<Cents> {
  if (i.contributionMarginPct <= 0) throw new RangeError("Com margem de contribuição zero ou negativa não existe ponto de equilíbrio.");
  return {
    value: Math.ceil(i.fixedCostsCents / (i.contributionMarginPct / 100)),
    steps: [`Ponto de equilíbrio = custos fixos ÷ ${i.contributionMarginPct}%`],
  };
}

/** Meta de faturamento para atingir um lucro desejado. */
export function salesTarget(i: { fixedCostsCents: Cents; contributionMarginPct: number; desiredProfitCents: Cents }): CalcResult<Cents> {
  const be = breakEven({ fixedCostsCents: i.fixedCostsCents + i.desiredProfitCents, contributionMarginPct: i.contributionMarginPct });
  return { value: be.value, steps: [`Meta = (custos fixos + lucro desejado) ÷ ${i.contributionMarginPct}%`] };
}

/** Fôlego de caixa em dias. */
export function cashRunwayDays(i: { balanceCents: Cents; avgMonthlyOutflowCents: Cents }): CalcResult<number> {
  if (i.avgMonthlyOutflowCents <= 0) throw new RangeError("Média de saídas deve ser maior que zero.");
  return {
    value: Math.max(0, Math.round((i.balanceCents / i.avgMonthlyOutflowCents) * 30)),
    steps: ["Fôlego = saldo ÷ média mensal de saídas × 30"],
  };
}

/** Quanto o volume precisa crescer para compensar um desconto, mantendo a margem total. */
export function discountImpact(i: { contributionMarginPct: number; discountPct: number }): CalcResult<number> {
  if (i.discountPct >= i.contributionMarginPct)
    throw new RangeError("O desconto consome toda a margem: nenhum aumento de volume compensa.");
  const extra = (i.contributionMarginPct / (i.contributionMarginPct - i.discountPct) - 1) * 100;
  return {
    value: round1(extra),
    steps: [`Volume extra = margem ÷ (margem − desconto) − 1 = ${i.contributionMarginPct} ÷ (${i.contributionMarginPct} − ${i.discountPct}) − 1`],
  };
}
