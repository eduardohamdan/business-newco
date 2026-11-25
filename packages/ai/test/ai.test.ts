import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { advisor, AiError, categorizeWithAi, collectNumbers, createGateway, extractNumbers, numericGuard, runEvals, type LlmProvider } from "../src";

const fake = (name: string, replies: (string | Error)[]): LlmProvider & { calls: number } => {
  const p = {
    name,
    calls: 0,
    modelFor: () => `${name}-model`,
    async complete() {
      const r = replies[Math.min(p.calls++, replies.length - 1)]!;
      if (r instanceof Error) throw r;
      return { text: r, inputTokens: 100, outputTokens: 50 };
    },
  };
  return p;
};

describe("guardas", () => {
  it("extrai números em formatos brasileiros", () => {
    expect(extractNumbers("R$ 1.234,56 e 38,5% em 2026, 47 dias")).toEqual([1234.56, 38.5, 2026, 47]);
  });
  it("aceita números dos dados e bloqueia inventados", () => {
    expect(numericGuard("saldo de R$ 1.234,56", collectNumbers({ saldo: 123456 })).ok).toBe(true);
    expect(numericGuard("margem de 61%", [40]).offending).toEqual([61]);
  });
});

describe("gateway", () => {
  it("cai para o segundo fornecedor quando o primeiro falha", async () => {
    const a = fake("a", [new Error("timeout")]);
    const b = fake("b", ["Tudo certo."]);
    const log = vi.fn();
    const gw = createGateway({ providers: [a, b], log });
    const r = await gw.run({ task: "raiox_narrative", promptVersion: "t@1", system: "s", user: "u", allowedNumbers: [] });
    expect(r.provider).toBe("b");
    expect(log.mock.calls.map((c) => c[0].guardStatus)).toEqual(["provider_error", "ok"]);
  });
  it("repara JSON inválido uma vez", async () => {
    const a = fake("a", ["isso não é json", '{"x": 1}']);
    const gw = createGateway({ providers: [a] });
    const r = await gw.run({ task: "advisor_plan", promptVersion: "t@1", system: "s", user: "u", schema: z.object({ x: z.number() }) });
    expect(r.output).toEqual({ x: 1 });
    expect(a.calls).toBe(2);
  });
  it("guarda numérica pede reescrita e falha se persistir", async () => {
    const a = fake("a", ["Seu fôlego é de 99 dias.", "Seu fôlego é de 99 dias."]);
    const gw = createGateway({ providers: [a] });
    await expect(gw.run({ task: "raiox_narrative", promptVersion: "t@1", system: "s", user: "u", allowedNumbers: [21] })).rejects.toBeInstanceOf(AiError);
  });
  it("teto de custo bloqueia o Advisor e degrada as demais tarefas", async () => {
    const a = fake("a", ["ok"]);
    const gw = createGateway({ providers: [a], budget: { spentCents: 1500, limitCents: 1500 } });
    await expect(gw.run({ task: "advisor_answer", promptVersion: "t", system: "s", user: "u" })).rejects.toMatchObject({ code: "budget_exceeded" });
    const r = await gw.run({ task: "diagnosis_narrative", promptVersion: "t", system: "s", user: "u" });
    expect(r.degraded).toBe(true);
  });
});

describe("fluxos", () => {
  it("categorização por IA respeita categorias e sentido", async () => {
    const a = fake("a", [JSON.stringify({ items: [{ id: "1", categoryCode: "receita_vendas", confidence: 0.99 }, { id: "2", categoryCode: "inventada", confidence: 0.9 }] })]);
    const out = await categorizeWithAi(createGateway({ providers: [a] }), [
      { id: "1", description: "PIX ENVIADO X", amountCents: -1000 },
      { id: "2", description: "Y", amountCents: -1000 },
    ]);
    expect(out).toEqual([{ id: "1", categoryCode: "outros_saidas", confidence: 0.3 }]);
  });
  it("advisor recusa assunto fora do escopo sem chamar o modelo", async () => {
    const a = fake("a", ["não deveria ser chamado"]);
    const r = await advisor(createGateway({ providers: [a] }), "Devo pegar um empréstimo para capital de giro?", { empresa: { nome: "X", equipe: 4 }, prioridades: [], indicadores: {} });
    expect(r.blocked).toBe(true);
    expect(a.calls).toBe(0);
  });
  it("advisor calcula com a ferramenta e só cita números permitidos", async () => {
    const plan = JSON.stringify({ intent: "calculate", tool: "break_even", args: { fixedCostsReais: 20000, contributionMarginPct: 40 } });
    const a = fake("a", [plan, "Seu ponto de equilíbrio é R$ 50.000,00 por mês."]);
    const r = await advisor(createGateway({ providers: [a] }), "Qual meu ponto de equilíbrio com custo fixo de 20000 e margem de 40%?", { empresa: { nome: "X", equipe: 4 }, prioridades: [], indicadores: {} });
    expect(r.calculation).toMatchObject({ tool: "break_even", value: { faturamento_equilibrio_reais: 50000 } });
    expect(r.answer).toContain("50.000");
  });
  it("advisor aponta dados faltantes", async () => {
    const a = fake("a", [JSON.stringify({ intent: "calculate", tool: "price_from_cost", args: { unitCostReais: 50 } }), "Preciso saber seus impostos e a margem desejada."]);
    const r = await advisor(createGateway({ providers: [a] }), "Quanto cobrar?", { empresa: { nome: "X", equipe: 4 }, prioridades: [], indicadores: {} });
    expect(r.calculation).toMatchObject({ error: "faltam dados", missing: ["taxPct", "targetMarginPct"] });
  });
});

describe("conjunto de avaliação", () => {
  it("todos os casos passam com o fornecedor mock", async () => {
    const res = await runEvals();
    const failed = res.filter((r) => !r.pass);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });
});
