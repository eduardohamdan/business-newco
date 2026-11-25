import { describe, expect, it } from "vitest";
import {
  categorize,
  computeRaioX,
  parseCsv,
  reconcile,
  ruleFromCorrection,
  sanitizeDescription,
  SYNTHETIC_PROFILES,
  syntheticStatementCsv,
  type RaioXTransaction,
} from "../src";

describe("categorização", () => {
  it("usa palavra-chave com prioridade", () => {
    expect(categorize({ amountCents: -4990, description: "TARIFA PACOTE SERVICOS" }).categoryCode).toBe("tarifas_bancarias");
    expect(categorize({ amountCents: -100000, description: "DAS SIMPLES NACIONAL 09/2026" }).categoryCode).toBe("impostos");
    expect(categorize({ amountCents: 250000, description: "PIX RECEBIDO - JOAO" }).categoryCode).toBe("receita_vendas");
    expect(categorize({ amountCents: 90000, description: "CIELO VENDAS CREDITO" }).categoryCode).toBe("receita_cartoes");
  });
  it("respeita o sentido do lançamento", () => {
    // "ALUGUEL" é saída; como entrada cai no fallback.
    expect(categorize({ amountCents: 100000, description: "ALUGUEL" }).needsReview).toBe(true);
  });
  it("marca gasto pessoal suspeito", () => {
    const c = categorize({ amountCents: -3990, description: "NETFLIX.COM" });
    expect(c.personalSuspect).toBe(true);
  });
  it("regra da organização vence o método", () => {
    const rule = ruleFromCorrection("PIX ENVIADO - JOSE PEDREIRO", "manutencao_operacao", -50000);
    const c = categorize({ amountCents: -50000, description: "PIX ENVIADO - JOSE PEDREIRO" }, [rule]);
    expect(c).toMatchObject({ categoryCode: "manutencao_operacao", source: "org_rule" });
  });
  it("fallback com baixa confiança", () => {
    expect(categorize({ amountCents: -1234, description: "XYZ 123" })).toMatchObject({ categoryCode: "outros_saidas", needsReview: true, confidence: 0.3 });
  });
});

function raioxFor(idx: number) {
  const p = SYNTHETIC_PROFILES[idx]!;
  const st = parseCsv(syntheticStatementCsv(p));
  const rec = reconcile(st);
  const txns: RaioXTransaction[] = st.transactions.map((t) => {
    const s = sanitizeDescription(t.description, "salt");
    const c = categorize({ amountCents: t.amountCents, description: s.description, counterpartyKind: s.counterparty.kind });
    return { postedAt: t.postedAt, amountCents: t.amountCents, categoryCode: c.categoryCode, confidence: c.confidence, personalSuspect: c.personalSuspect, counterpartyKey: s.counterparty.docHash ?? s.counterparty.name };
  });
  return { rec, rx: computeRaioX(txns, { reconcile: rec }) };
}

describe("Raio-X", () => {
  it("empresa em sobrevivência: caixa negativo e gasto pessoal alto", () => {
    const { rec, rx } = raioxFor(0);
    expect(rec.status).toBe("ok");
    expect(rx.months).toHaveLength(3);
    expect(rx.metrics.meses_caixa_negativo.value).toBe(3);
    expect(rx.metrics.despesas_pessoais_pj_pct.value).toBeGreaterThan(10);
    expect(rx.highlights[0]!.severity).toBe(3);
    expect(rx.coverage.categorizedValuePct).toBeGreaterThan(85); // RF02: ≥ 85% do valor categorizado
  });
  it("empresa saudável: sem caixa negativo e fôlego maior", () => {
    const { rx } = raioxFor(2);
    expect(rx.metrics.meses_caixa_negativo.value).toBe(0);
    expect(rx.metrics.folego_caixa_dias.value!).toBeGreaterThan(30);
    expect(rx.metrics.despesas_pessoais_pj_pct.value).toBe(0);
  });
  it("todos os números têm fórmula (explicabilidade)", () => {
    const { rx } = raioxFor(1);
    for (const m of Object.values(rx.metrics)) expect(m.formula.length).toBeGreaterThan(10);
  });
});
