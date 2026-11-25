import { getMethod, type Track } from "@beos/method";
import {
  breakEven, cashRunwayDays, contributionMargin, discountImpact, priceFromCost, salesTarget,
  type Diagnosis, type PriorityPick, type RaioX, type RitualQuestion,
} from "@beos/core";
import { z } from "zod";
import type { Gateway } from "../gateway";
import { collectNumbers, outOfScope, wrapUntrusted } from "../guards";
import { P } from "../prompts";

// ---------------------------------------------------------------------------
// Categorização assistida (só para lançamentos que as regras não resolveram)
// ---------------------------------------------------------------------------
const CatOut = z.object({ items: z.array(z.object({ id: z.string(), categoryCode: z.string(), confidence: z.number().min(0).max(1) })) });

export async function categorizeWithAi(gw: Gateway, txns: { id: string; description: string; amountCents: number }[]) {
  if (!txns.length) return [];
  const cats = getMethod().categories;
  const allowed = new Set(cats.map((c) => c.code));
  const list = cats.map((c) => `${c.code} (${c.name}; ${c.direction === "inflow" ? "entrada" : c.direction === "outflow" ? "saída" : "ambos"})`).join("\n");
  const payload = JSON.stringify(txns.slice(0, 80).map((t) => ({ id: t.id, descricao: t.description, sentido: t.amountCents >= 0 ? "entrada" : "saída" })));
  const r = await gw.run({
    task: "categorize_txn",
    promptVersion: P.categorize_txn.version,
    system: P.categorize_txn.system,
    user: `CATEGORIAS PERMITIDAS:\n${list}\n\nLANÇAMENTOS:\n${wrapUntrusted("extrato", payload)}\n\nResponda {"items":[{"id","categoryCode","confidence"}]}.`,
    schema: CatOut,
    maxTokens: 2000,
  });
  // Pós-validação: categoria precisa existir e respeitar o sentido.
  return r.output.items
    .filter((i) => allowed.has(i.categoryCode) && txns.some((t) => t.id === i.id))
    .map((i) => {
      const t = txns.find((x) => x.id === i.id)!;
      const c = cats.find((x) => x.code === i.categoryCode)!;
      const okDir = c.direction === "both" || (c.direction === "inflow") === t.amountCents >= 0;
      return okDir ? { ...i, confidence: Math.min(i.confidence, 0.8) } : { id: i.id, categoryCode: t.amountCents >= 0 ? "outros_entradas" : "outros_saidas", confidence: 0.3 };
    });
}

// ---------------------------------------------------------------------------
// Narrativas (números sempre do sistema)
// ---------------------------------------------------------------------------
export async function narrateRaioX(gw: Gateway, rx: RaioX): Promise<string> {
  const data = {
    periodo: `${rx.periodStart} a ${rx.periodEnd}`,
    indicadores: Object.fromEntries(Object.entries(rx.metrics).map(([k, v]) => [k, v.value])),
    meses: rx.months.map((m) => ({ mes: m.month, entradas_reais: m.inflowCents / 100, saidas_reais: m.outflowCents / 100 })),
    alertas: rx.highlights.map((h) => ({ titulo: h.title, detalhe: h.detail })),
  };
  const r = await gw.run({ task: "raiox_narrative", promptVersion: P.raiox_narrative.version, system: P.raiox_narrative.system, user: `DADOS:\n${JSON.stringify(data)}`, allowedNumbers: collectNumbers(data), maxTokens: 500 });
  return r.output;
}

export async function narrateDiagnosis(gw: Gateway, dx: Diagnosis, picks: PriorityPick[]): Promise<string> {
  const data = {
    estagio: dx.stage.stage,
    indice_maturidade: dx.maturity.avg,
    achados: dx.findings.map((f) => ({ titulo: f.title, detalhe: f.body })),
    prioridades: picks.map((p) => ({ trilha: p.track.title, objetivo: p.track.objective, por_que: p.track.why })),
    indicadores: Object.fromEntries(dx.panel.map((x) => [x.metric, x.value])),
  };
  const r = await gw.run({ task: "diagnosis_narrative", promptVersion: P.diagnosis_narrative.version, system: P.diagnosis_narrative.system, user: `DADOS:\n${JSON.stringify(data)}`, allowedNumbers: collectNumbers(data), maxTokens: 700 });
  return r.output;
}

export async function trackTip(gw: Gateway, track: Track, ctx: { sector?: string | null; teamSize: number }): Promise<string> {
  const r = await gw.run({
    task: "track_tip",
    promptVersion: P.track_tip.version,
    system: P.track_tip.system,
    user: `TRILHA: ${track.title}\nOBJETIVO: ${track.objective}\nSETOR: ${ctx.sector ?? "não informado"}\nEQUIPE: ${ctx.teamSize} pessoas`,
    allowedNumbers: [ctx.teamSize],
    maxTokens: 200,
  });
  return r.output;
}

// ---------------------------------------------------------------------------
// Ritual: interpretação de texto livre/áudio quando as regras não entendem
// ---------------------------------------------------------------------------
const RitualOut = z.object({ action: z.enum(["done", "partial", "not_done"]).nullable(), metric: z.number().nullable(), blocker: z.string().max(300).nullable() });

export async function interpretRitualReply(gw: Gateway, reply: string, questions: RitualQuestion[]) {
  const r = await gw.run({
    task: "ritual_interpret",
    promptVersion: P.ritual_interpret.version,
    system: P.ritual_interpret.system,
    user: `PERGUNTAS:\n${questions.map((q) => `- ${q.text}`).join("\n")}\n\nRESPOSTA:\n${wrapUntrusted("whatsapp", reply)}\n\nResponda {"action","metric","blocker"}.`,
    schema: RitualOut,
    maxTokens: 200,
  });
  return r.output;
}

// ---------------------------------------------------------------------------
// Advisor: plano (intenção/ferramenta) → cálculo determinístico → resposta com guarda numérica
// ---------------------------------------------------------------------------
const PlanOut = z.object({
  intent: z.enum(["explain", "calculate", "data_question", "out_of_scope"]),
  tool: z.enum(["price_from_cost", "contribution_margin", "break_even", "sales_target", "cash_runway", "discount_impact"]).nullable().optional(),
  args: z.record(z.string(), z.number()).default({}),
});

export interface AdvisorContext {
  empresa: { nome: string; setor?: string | null; estagio?: string | null; equipe: number };
  prioridades: { titulo: string; indicador: string; baseline: number | null; meta: number | null; ultimo: number | null }[];
  indicadores: Record<string, number>;
  proximaAcao?: string | null;
}

export interface AdvisorAnswer {
  answer: string;
  intent: z.infer<typeof PlanOut>["intent"];
  calculation?: { tool: string; value: unknown; steps: string[] } | { tool: string; error: string; missing?: string[] };
  sources: string[];
  blocked: boolean;
}

const r2c = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 100));

function runTool(tool: string, a: Record<string, number>): { value: unknown; steps: string[] } {
  switch (tool) {
    case "price_from_cost": {
      const res = priceFromCost({ unitCostCents: r2c(a.unitCostReais)!, taxPct: a.taxPct!, cardFeePct: a.cardFeePct, commissionPct: a.commissionPct, targetMarginPct: a.targetMarginPct! });
      return { value: { preco_reais: res.value / 100 }, steps: res.steps };
    }
    case "contribution_margin": {
      const res = contributionMargin({ priceCents: r2c(a.priceReais)!, unitCostCents: r2c(a.unitCostReais)!, taxPct: a.taxPct ?? 0, cardFeePct: a.cardFeePct, commissionPct: a.commissionPct });
      return { value: { margem_reais: res.value.marginCents / 100, margem_pct: res.value.marginPct }, steps: res.steps };
    }
    case "break_even": {
      const res = breakEven({ fixedCostsCents: r2c(a.fixedCostsReais)!, contributionMarginPct: a.contributionMarginPct! });
      return { value: { faturamento_equilibrio_reais: res.value / 100 }, steps: res.steps };
    }
    case "sales_target": {
      const res = salesTarget({ fixedCostsCents: r2c(a.fixedCostsReais)!, contributionMarginPct: a.contributionMarginPct!, desiredProfitCents: r2c(a.desiredProfitReais)! });
      return { value: { meta_faturamento_reais: res.value / 100 }, steps: res.steps };
    }
    case "cash_runway": {
      const res = cashRunwayDays({ balanceCents: r2c(a.balanceReais)!, avgMonthlyOutflowCents: r2c(a.avgMonthlyOutflowReais)! });
      return { value: { folego_dias: res.value }, steps: res.steps };
    }
    case "discount_impact": {
      const res = discountImpact({ contributionMarginPct: a.contributionMarginPct!, discountPct: a.discountPct! });
      return { value: { volume_extra_pct: res.value }, steps: res.steps };
    }
  }
  throw new Error("Ferramenta desconhecida");
}

const REQUIRED: Record<string, string[]> = {
  price_from_cost: ["unitCostReais", "taxPct", "targetMarginPct"],
  contribution_margin: ["priceReais", "unitCostReais"],
  break_even: ["fixedCostsReais", "contributionMarginPct"],
  sales_target: ["fixedCostsReais", "contributionMarginPct", "desiredProfitReais"],
  cash_runway: ["balanceReais", "avgMonthlyOutflowReais"],
  discount_impact: ["contributionMarginPct", "discountPct"],
};

export async function advisor(gw: Gateway, question: string, ctx: AdvisorContext): Promise<AdvisorAnswer> {
  const refusal = outOfScope(question);
  if (refusal) return { answer: refusal, intent: "out_of_scope", sources: [], blocked: true };

  const ctxText = JSON.stringify(ctx);
  const plan = (
    await gw.run({
      task: "advisor_plan",
      promptVersion: P.advisor_plan.version,
      system: P.advisor_plan.system,
      user: `CONTEXTO:\n${ctxText}\n\nPERGUNTA:\n${wrapUntrusted("advisor", question)}\n\nResponda {"intent","tool","args"}.`,
      schema: PlanOut,
      maxTokens: 300,
    })
  ).output;

  if (plan.intent === "out_of_scope")
    return { answer: "Esse assunto foge do que eu posso orientar com segurança. Procure seu contador ou advogado; posso preparar um resumo dos seus números para a conversa.", intent: plan.intent, sources: [], blocked: true };

  let calculation: AdvisorAnswer["calculation"];
  if (plan.intent === "calculate" && plan.tool) {
    const missing = (REQUIRED[plan.tool] ?? []).filter((k) => plan.args[k] === undefined);
    if (missing.length) calculation = { tool: plan.tool, error: "faltam dados", missing };
    else {
      try {
        calculation = { tool: plan.tool, ...runTool(plan.tool, plan.args) };
      } catch (e) {
        calculation = { tool: plan.tool, error: (e as Error).message };
      }
    }
  }

  const allowed = collectNumbers([ctx, calculation, plan.args]);
  // Números ditos pelo próprio dono na pergunta também podem ser repetidos.
  allowed.push(...(question.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", "."))));
  const answer = (
    await gw.run({
      task: "advisor_answer",
      promptVersion: P.advisor_answer.version,
      system: P.advisor_answer.system,
      user: `CONTEXTO:\n${ctxText}\n\nRESULTADO DE CÁLCULO:\n${JSON.stringify(calculation ?? null)}\n\nPERGUNTA:\n${wrapUntrusted("advisor", question)}`,
      allowedNumbers: allowed,
      maxTokens: 700,
    })
  ).output;
  const sources = ["Prioridades e indicadores do ciclo atual"];
  if (calculation && "value" in calculation) sources.push(`Calculadora: ${calculation.tool}`);
  return { answer, intent: plan.intent, calculation, sources, blocked: false };
}
