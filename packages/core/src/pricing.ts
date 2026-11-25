/**
 * Planos por faixa de faturamento (hipóteses do PRD v1.1, seção 21). Valores em centavos.
 */
export type PlanCode = "start" | "pro" | "scale";

export interface Plan {
  code: PlanCode;
  name: string;
  minRevenueCents: number;
  maxRevenueCents: number;
  monthlyCents: number;
  annualMonthlyCents: number;
  maxUsers: number;
  aiBudgetCents: number;
}

const MI = 100_000_000; // R$ 1 milhão em centavos

export const PLANS: Plan[] = [
  { code: "start", name: "Start", minRevenueCents: 0, maxRevenueCents: 1 * MI, monthlyCents: 19_700, annualMonthlyCents: 16_700, maxUsers: 3, aiBudgetCents: 1_500 },
  { code: "pro", name: "Pro", minRevenueCents: 1 * MI, maxRevenueCents: 4.8 * MI, monthlyCents: 39_700, annualMonthlyCents: 33_700, maxUsers: 8, aiBudgetCents: 2_500 },
  { code: "scale", name: "Scale", minRevenueCents: 4.8 * MI, maxRevenueCents: 10 * MI, monthlyCents: 79_700, annualMonthlyCents: 67_700, maxUsers: 20, aiBudgetCents: 4_500 },
];

export const RAIO_X_PRICE_CENTS = 9_700;
export const RAIO_X_AI_BUDGET_CENTS = 300;

/** Faixas declaradas no onboarding (o cliente não informa o faturamento exato). */
export const REVENUE_BANDS = [
  { code: "ate_360k", label: "Até R$ 360 mil por ano", plan: "start" as PlanCode },
  { code: "360k_1m", label: "De R$ 360 mil a R$ 1 milhão", plan: "start" as PlanCode },
  { code: "1m_4m8", label: "De R$ 1 milhão a R$ 4,8 milhões", plan: "pro" as PlanCode },
  { code: "4m8_10m", label: "De R$ 4,8 milhões a R$ 10 milhões", plan: "scale" as PlanCode },
  { code: "acima_10m", label: "Acima de R$ 10 milhões", plan: null },
] as const;
export type RevenueBand = (typeof REVENUE_BANDS)[number]["code"];

export function planForBand(band: RevenueBand): Plan | null {
  const b = REVENUE_BANDS.find((x) => x.code === band);
  return b?.plan ? PLANS.find((p) => p.code === b.plan)! : null;
}

export interface Eligibility {
  eligible: boolean;
  reason?: string;
  /** Fora do ICP por porte: oferecer indicação (graduação) — ver seção 3.3 do PRD. */
  graduate?: boolean;
}

/** Critérios de elegibilidade do ICP (PRD seção 5.3). */
export function checkEligibility(i: { band: RevenueBand; monthsActive: number; teamSize: number; isMei: boolean }): Eligibility {
  if (i.band === "acima_10m") return { eligible: false, graduate: true, reason: "Empresas acima de R$ 10 milhões por ano têm um atendimento especializado." };
  if (i.isMei) return { eligible: false, reason: "No momento atendemos empresas com equipe (ME, EPP ou maiores), não MEI." };
  if (i.monthsActive < 12) return { eligible: false, reason: "Atendemos empresas com pelo menos 12 meses de operação." };
  if (i.teamSize < 3) return { eligible: false, reason: "O método funciona melhor a partir de 3 pessoas trabalhando no negócio." };
  return { eligible: true };
}
