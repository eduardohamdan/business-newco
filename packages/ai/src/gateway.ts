import type { z } from "zod";
import { costMicroBrl, loadAiConfig, type AiConfig } from "./config";
import { numericGuard, UNTRUSTED_RULE } from "./guards";
import { anthropicProvider } from "./providers/anthropic";
import { mockProvider } from "./providers/mock";
import { openaiProvider } from "./providers/openai";
import { AiError, TASK_TIER, type AiCallLog, type AiTask, type ChatMessage, type LlmProvider, type Tier } from "./types";

export interface Budget {
  /** Gasto de IA da organização no mês (centavos). */
  spentCents: number;
  /** Teto do plano (centavos). */
  limitCents: number;
}

export interface GatewayOptions {
  config?: AiConfig;
  providers?: LlmProvider[];
  /** Persistência do log de custo/guarda (ai_call_logs). */
  log?: (entry: AiCallLog) => Promise<void> | void;
  budget?: Budget;
}

export interface RunOptions<T> {
  task: AiTask;
  promptVersion: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Se definido, a saída deve ser JSON válido para o esquema. */
  schema?: z.ZodType<T>;
  /** Números permitidos no texto (guarda numérica). Omitido = sem checagem (só para tarefas JSON). */
  allowedNumbers?: number[];
}

export interface RunResult<T> {
  output: T;
  provider: string;
  model: string;
  degraded: boolean;
}

function buildProvider(name: string, cfg: AiConfig): LlmProvider {
  if (name === "anthropic") return anthropicProvider(cfg);
  if (name === "openai") return openaiProvider(cfg);
  return mockProvider();
}

/**
 * Gateway de IA: roteamento por tarefa, fallback entre fornecedores, validação de esquema com 1 reparo,
 * guarda numérica, teto de custo por organização e log de cada chamada.
 */
export function createGateway(opts: GatewayOptions = {}) {
  const cfg = opts.config ?? loadAiConfig();
  const providers = opts.providers ?? [...new Set([cfg.primary, cfg.fallback])].map((n) => buildProvider(n, cfg));

  async function run<T = string>(o: RunOptions<T>): Promise<RunResult<T>> {
    let tier: Tier = TASK_TIER[o.task];
    let degraded = false;
    if (opts.budget && opts.budget.spentCents >= opts.budget.limitCents) {
      if (o.task === "advisor_answer" || o.task === "advisor_plan") {
        await opts.log?.({ task: o.task, provider: "-", model: "-", promptVersion: o.promptVersion, inputTokens: 0, outputTokens: 0, costMicroBrl: 0, latencyMs: 0, guardStatus: "blocked", error: "budget" });
        throw new AiError("Limite mensal de uso do Advisor atingido para o seu plano.", "budget_exceeded");
      }
      tier = "fast";
      degraded = true;
    }
    const system = `${o.system}\n\n${UNTRUSTED_RULE}`;
    let lastError: unknown;
    for (const p of providers) {
      const model = p.modelFor(tier);
      const started = Date.now();
      let messages: ChatMessage[] = [{ role: "user", content: o.user }];
      for (let attempt = 0; attempt < 2; attempt++) {
        let res;
        try {
          res = await p.complete({ model, system, messages, maxTokens: o.maxTokens ?? 800, temperature: o.temperature ?? 0.2, json: !!o.schema, task: o.task });
        } catch (e) {
          lastError = e;
          await opts.log?.({ task: o.task, provider: p.name, model, promptVersion: o.promptVersion, inputTokens: 0, outputTokens: 0, costMicroBrl: 0, latencyMs: Date.now() - started, guardStatus: "provider_error", error: String((e as Error).message).slice(0, 300) });
          break; // próximo fornecedor
        }
        const base = { task: o.task, provider: p.name, model, promptVersion: o.promptVersion, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costMicroBrl: costMicroBrl(cfg, tier, res.inputTokens, res.outputTokens), latencyMs: Date.now() - started };
        if (o.schema) {
          const parsed = safeJson(res.text);
          const v = parsed === undefined ? null : o.schema.safeParse(parsed);
          if (v?.success) {
            await opts.log?.({ ...base, guardStatus: degraded ? "budget_degraded" : "ok" });
            return { output: v.data, provider: p.name, model, degraded };
          }
          await opts.log?.({ ...base, guardStatus: "schema_error", error: v ? v.error.message.slice(0, 300) : "JSON inválido" });
          messages = [...messages, { role: "assistant", content: res.text }, { role: "user", content: "A resposta não segue o formato JSON pedido. Responda novamente apenas com o JSON válido." }];
          lastError = new AiError("Saída fora do esquema", "schema_error");
          continue;
        }
        const text = res.text.trim();
        if (o.allowedNumbers) {
          const g = numericGuard(text, o.allowedNumbers);
          if (!g.ok) {
            await opts.log?.({ ...base, guardStatus: "numeric_violation", error: `números não suportados: ${g.offending.join(", ")}` });
            messages = [...messages, { role: "assistant", content: text }, { role: "user", content: `Você citou números que não estão nos dados (${g.offending.join(", ")}). Reescreva usando apenas os números fornecidos.` }];
            lastError = new AiError("Guarda numérica bloqueou a resposta", "guard_failed");
            continue;
          }
        }
        await opts.log?.({ ...base, guardStatus: degraded ? "budget_degraded" : "ok" });
        return { output: text as T, provider: p.name, model, degraded };
      }
    }
    if (lastError instanceof AiError) throw lastError;
    throw new AiError(`Nenhum fornecedor de IA respondeu: ${(lastError as Error)?.message ?? "erro desconhecido"}`, "all_providers_failed");
  }

  return { run, config: cfg };
}

export type Gateway = ReturnType<typeof createGateway>;

function safeJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return undefined;
    try {
      return JSON.parse(m[0]);
    } catch {
      return undefined;
    }
  }
}
