import type { AiConfig } from "../config";
import type { CompletionRequest, CompletionResponse, LlmProvider, Tier } from "../types";
import { postJson } from "./http";

/** Anthropic Messages API (https://docs.claude.com). Contrato: sem retenção para treino conforme termos comerciais. */
export function anthropicProvider(cfg: AiConfig): LlmProvider {
  return {
    name: "anthropic",
    modelFor: (tier: Tier) => cfg.models.anthropic![tier],
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      if (!cfg.keys.anthropic) throw new Error("ANTHROPIC_API_KEY ausente");
      const r = await postJson(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": cfg.keys.anthropic, "anthropic-version": "2023-06-01" },
        {
          model: req.model,
          system: req.json ? `${req.system}\n\nResponda APENAS com um objeto JSON válido, sem texto antes ou depois.` : req.system,
          messages: req.messages,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
        },
      );
      const text = (r.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      return { text, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 };
    },
  };
}
