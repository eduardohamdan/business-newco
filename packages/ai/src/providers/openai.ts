import type { AiConfig } from "../config";
import type { CompletionRequest, CompletionResponse, LlmProvider, Tier } from "../types";
import { postJson } from "./http";

/** OpenAI Chat Completions como fornecedor de fallback. */
export function openaiProvider(cfg: AiConfig): LlmProvider {
  return {
    name: "openai",
    modelFor: (tier: Tier) => cfg.models.openai![tier],
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      if (!cfg.keys.openai) throw new Error("OPENAI_API_KEY ausente");
      const r = await postJson(
        "https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${cfg.keys.openai}` },
        {
          model: req.model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        },
      );
      return { text: r.choices?.[0]?.message?.content ?? "", inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0 };
    },
  };
}
