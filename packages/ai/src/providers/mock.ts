import type { CompletionRequest, CompletionResponse, LlmProvider } from "../types";

/**
 * Fornecedor determinístico para desenvolvimento, testes e CI (sem chave e sem custo).
 * Respostas simples por tarefa; nunca inventa números.
 */
export function mockProvider(): LlmProvider {
  return {
    name: "mock",
    modelFor: (tier) => `mock-${tier}`,
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const last = req.messages.at(-1)?.content ?? "";
      const text = respond(req.task, last);
      return { text, inputTokens: Math.ceil((req.system.length + last.length) / 4), outputTokens: Math.ceil(text.length / 4) };
    },
  };
}

function respond(task: CompletionRequest["task"], input: string): string {
  switch (task) {
    case "categorize_txn": {
      const ids = [...input.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
      return JSON.stringify({ items: ids.map((id) => ({ id, categoryCode: "outros_saidas", confidence: 0.5 })) });
    }
    case "ritual_interpret":
      return JSON.stringify({ action: /fiz|feito|sim/i.test(input) ? "done" : null, metric: null, blocker: null });
    case "advisor_plan": {
      const q = input.toLowerCase();
      if (/pre[çc]o|cobrar|margem/.test(q)) return JSON.stringify({ intent: "calculate", tool: "price_from_cost", args: {} });
      if (/equil[ií]brio/.test(q)) return JSON.stringify({ intent: "calculate", tool: "break_even", args: {} });
      return JSON.stringify({ intent: "explain", tool: null, args: {} });
    }
    case "track_tip":
      return "Comece pela ação mais simples desta semana e reserve um horário fixo na agenda para ela.";
    case "raiox_narrative":
      return "Este é um resumo de demonstração do seu Raio-X. Os números ao lado mostram de onde vem e para onde vai o dinheiro.";
    case "diagnosis_narrative":
      return "Resumo de demonstração: as prioridades sugeridas atacam primeiro o que mais pesa no caixa e na rotina.";
    case "advisor_answer":
      return "Resposta de demonstração (modo sem IA). Configure um fornecedor de IA para respostas completas.";
    default:
      return "{}";
  }
}
