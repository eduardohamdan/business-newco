import type { Tier } from "./types";

export interface AiConfig {
  primary: string;
  fallback: string;
  models: Record<string, Record<Tier, string>>;
  /** USD por 1M tokens. */
  prices: Record<Tier, { in: number; out: number }>;
  usdBrl: number;
  keys: { anthropic?: string; openai?: string };
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return {
    primary: env.AI_PRIMARY_PROVIDER ?? "mock",
    fallback: env.AI_FALLBACK_PROVIDER ?? "mock",
    models: {
      anthropic: { fast: env.AI_MODEL_FAST_ANTHROPIC ?? "claude-haiku-5-5", reasoning: env.AI_MODEL_REASONING_ANTHROPIC ?? "claude-sonnet-5-5" },
      openai: { fast: env.AI_MODEL_FAST_OPENAI ?? "gpt-4.1-mini", reasoning: env.AI_MODEL_REASONING_OPENAI ?? "gpt-4.1" },
      mock: { fast: "mock-fast", reasoning: "mock-reasoning" },
    },
    prices: {
      fast: { in: num(env.AI_PRICE_FAST_IN, 1), out: num(env.AI_PRICE_FAST_OUT, 5) },
      reasoning: { in: num(env.AI_PRICE_REASONING_IN, 3), out: num(env.AI_PRICE_REASONING_OUT, 15) },
    },
    usdBrl: num(env.USD_BRL, 5.4),
    keys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
  };
}

/** Custo em micro-reais (1 real = 1.000.000) para somar sem perder precisão. */
export function costMicroBrl(cfg: AiConfig, tier: Tier, inputTokens: number, outputTokens: number): number {
  const p = cfg.prices[tier];
  const usd = (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  return Math.round(usd * cfg.usdBrl * 1_000_000);
}
