import { describe, expect, it } from "vitest";
import {
  applyRitual,
  assertCanAddPriority,
  breakEven,
  buildPlan,
  buildRitualQuestions,
  categorize,
  checkEligibility,
  closeCycle,
  computeRaioX,
  computeTarget,
  contributionMargin,
  cycleWeek,
  diagnose,
  discountImpact,
  evaluateAlerts,
  parseActionReply,
  parseCsv,
  planForBand,
  priceFromCost,
  prioritize,
  reconcile,
  scoreMaturity,
  SYNTHETIC_PROFILES,
  syntheticAnswers,
  syntheticStatementCsv,
  visibleQuestions,
  type RitualPriority,
} from "../src";

function fullDiagnosis(idx: number) {
  const p = SYNTHETIC_PROFILES[idx]!;
  const st = parseCsv(syntheticStatementCsv(p));
  const rec = reconcile(st);
  const rx = computeRaioX(
    st.transactions.map((t) => {
      const c = categorize(t);
      return { postedAt: t.postedAt, amountCents: t.amountCents, categoryCode: c.categoryCode, confidence: c.confidence, personalSuspect: c.personalSuspect };
    }),
    { reconcile: rec },
  );
  const maturity = scoreMaturity(syntheticAnswers(p));
  return { p, dx: diagnose({ maturity, raiox: rx, manualMetrics: { margem_bruta_pct: 28 }, facts: { teamSize: p.teamSize }, dataAsOf: rx.periodEnd, today: "2026-10-05" }) };
}

describe("maturidade e estágio", () => {
  it("show_if esconde pergunta condicional", () => {
    expect(visibleQuestions({ cf_precificacao: "feeling" }).some((q) => q.code === "cf_precificacao_revisao")).toBe(false);
    expect(visibleQuestions({ cf_precificacao: "margem" }).some((q) => q.code === "cf_precificacao_revisao")).toBe(true);
  });
  it("score é reproduzível", () => {
    const a = syntheticAnswers(SYNTHETIC_PROFILES[1]!);
    expect(scoreMaturity(a)).toEqual(scoreMaturity(a));
  });
  it("classifica estágios coerentes com os perfis", () => {
    expect(fullDiagnosis(0).dx.stage.stage).toBe("sobrevivencia");
    expect(fullDiagnosis(2).dx.stage.stage).not.toBe("sobrevivencia");
  });
});

describe("diagnóstico e priorização", () => {
  it("diagnóstico suficiente com extrato + questionário", () => {
    const { dx } = fullDiagnosis(0);
    expect(dx.sufficient).toBe(true);
    expect(dx.findings.length).toBeGreaterThan(0);
    expect(dx.findings[0]!.dimension).toBe("caixa_financas");
  });
  it("sem dados, o diagnóstico não é conclusivo e pede o extrato (RF07)", () => {
    const dx = diagnose({ maturity: scoreMaturity({ cf_separacao: "sempre" }) });
    expect(dx.sufficient).toBe(false);
    expect(dx.missingData.map((m) => m.metric)).toContain("folego_caixa_dias");
  });
  it("seleciona no máximo 3, respeita estágio e explica as adiadas", () => {
    const { dx, p } = fullDiagnosis(0);
    const r = prioritize(dx, { teamSize: p.teamSize, hasBankStatement: true });
    expect(r.selected.length).toBeLessThanOrEqual(3);
    expect(r.selected[0]!.track.code).toBe("cf-separar-pf-pj");
    expect(r.blocked.some((b) => b.track.code === "pl-contratar-certo")).toBe(true);
    for (const d of r.deferred) expect(d.reason.length).toBeGreaterThan(10);
    const perDim = new Map<string, number>();
    r.selected.forEach((s) => perDim.set(s.track.dimension, (perDim.get(s.track.dimension) ?? 0) + 1));
    for (const n of perDim.values()) expect(n).toBeLessThanOrEqual(2);
  });
  it("bloqueia a 4ª prioridade sem justificativa (RF08)", () => {
    expect(() => assertCanAddPriority(3)).toThrow();
    expect(() => assertCanAddPriority(3, { reason: "curta" })).toThrow();
    expect(() => assertCanAddPriority(3, { reason: "Caixa piorou e a cobrança virou urgente" })).not.toThrow();
  });
});

describe("plano", () => {
  it("monta plano com metas, marcos e primeira ação (RF09)", () => {
    const { dx, p } = fullDiagnosis(0);
    const picks = prioritize(dx, { teamSize: p.teamSize, hasBankStatement: true }).selected.map((s) => s.track);
    const plan = buildPlan({ tracks: picks, baselines: dx.signals.metrics, startsOn: "2026-10-06" });
    expect(plan.endsOn).toBe("2026-12-28");
    expect(plan.firstAction?.week).toBe(1);
    for (const pr of plan.priorities) {
      expect(pr.milestones.length).toBeGreaterThanOrEqual(3);
      expect(pr.metric).toBeTruthy();
    }
  });
  it("calcula metas pelas regras", () => {
    expect(computeTarget({ type: "absolute", value: 30 }, null)).toBe(30);
    expect(computeTarget({ type: "delta", value: 5, max: 80 }, 78)).toBe(80);
    expect(computeTarget({ type: "pct_change", value: -0.3, min: 2 }, 10)).toBe(7);
    expect(computeTarget({ type: "pct_change", value: 0.5 }, null)).toBeNull();
  });
});

describe("ritual", () => {
  const priorities: RitualPriority[] = [
    {
      id: "p1", title: "Separar PF e PJ", metric: "despesas_pessoais_pj_pct", target: 5, baseline: 15, lastValue: 15,
      actions: [
        { id: "a1", priorityId: "p1", title: "Revisar gastos pessoais", week: 1, status: "todo" },
        { id: "a2", priorityId: "p1", title: "Somar custo da família", week: 2, status: "todo" },
      ],
    },
    {
      id: "p2", title: "Rotina comercial", metric: "contatos_comerciais_semana", target: 15, baseline: 5, lastValue: 5,
      actions: [{ id: "b1", priorityId: "p2", title: "Exportar contatos", week: 1, status: "done" }],
    },
  ];
  it("faz no máximo 3 perguntas", () => {
    const qs = buildRitualQuestions(priorities, 1);
    expect(qs.length).toBeLessThanOrEqual(3);
    expect(qs[0]!.actionId).toBe("a1");
    expect(qs.find((q) => q.id === "metric")!.metric).toBe("contatos_comerciais_semana");
  });
  it("entende respostas em português", () => {
    expect(parseActionReply("Fiz sim!")).toBe("done");
    expect(parseActionReply("fiz metade")).toBe("partial");
    expect(parseActionReply("não deu essa semana")).toBe("not_done");
    expect(parseActionReply("banana")).toBeNull();
  });
  it("aplica respostas, recalcula risco e sugere próxima ação", () => {
    const qs = buildRitualQuestions(priorities, 1);
    const out = applyRitual(priorities, 1, { action: "feito", metric: "12 contatos", blocker: "não" }, qs);
    expect(out.actionUpdates).toEqual([{ actionId: "a1", status: "done" }]);
    expect(out.metricValues[0]!.value).toBe(12);
    expect(out.blocker).toBeNull();
    expect(out.overallRisk).toBe("on_track");
    expect(out.nextAction?.id).toBe("a2");
    expect(out.summary).toContain("Próxima ação");
  });
  it("calcula a semana do ciclo", () => {
    expect(cycleWeek("2026-10-06", "2026-10-05")).toBe(0);
    expect(cycleWeek("2026-10-06", "2026-10-06")).toBe(1);
    expect(cycleWeek("2026-10-06", "2026-10-20")).toBe(3);
  });
  it("gera alertas (RF14)", () => {
    const al = evaluateAlerts({
      missedRitualsInRow: 2,
      lateMilestones: [{ title: "Pró-labore definido", dueDate: "2026-11-01" }],
      metricDeviations: [{ metric: "folego_caixa_dias", value: 10, target: 30, direction: "up", tolerance: 5 }],
    });
    expect(al.map((a) => a.code)).toEqual(["ritual_ausente", "marco_atrasado", "indicador_fora"]);
  });
});

describe("fechamento, calculadoras e preços", () => {
  it("fecha o ciclo e marca evolução", () => {
    const c = closeCycle({
      priorities: [
        { id: "p1", title: "PF/PJ", metric: "despesas_pessoais_pj_pct", baseline: 15, target: 5, final: 4, actionsDone: 8, actionsTotal: 8 },
        { id: "p2", title: "Rotina", metric: "contatos_comerciais_semana", baseline: 5, target: 15, final: 9, actionsDone: 4, actionsTotal: 7 },
      ],
      ritualsAnswered: 10, ritualsSent: 12, maturityStart: 30, maturityEnd: 42,
    });
    expect(c.priorities.map((p) => p.outcome)).toEqual(["atingida", "avancou"]);
    expect(c.evolved).toBe(true);
    expect(c.maturityDelta).toBe(12);
  });
  it("calculadoras", () => {
    expect(priceFromCost({ unitCostCents: 5000, taxPct: 6, cardFeePct: 3, targetMarginPct: 21 }).value).toBe(7143);
    expect(contributionMargin({ priceCents: 10000, unitCostCents: 5000, taxPct: 6, cardFeePct: 4 }).value).toEqual({ marginCents: 4000, marginPct: 40 });
    expect(breakEven({ fixedCostsCents: 2_000_000, contributionMarginPct: 40 }).value).toBe(5_000_000);
    expect(discountImpact({ contributionMarginPct: 40, discountPct: 10 }).value).toBe(33.3);
    expect(() => priceFromCost({ unitCostCents: 1, taxPct: 50, targetMarginPct: 50 })).toThrow();
  });
  it("planos e elegibilidade", () => {
    expect(planForBand("1m_4m8")?.monthlyCents).toBe(39_700);
    expect(planForBand("acima_10m")).toBeNull();
    expect(checkEligibility({ band: "acima_10m", monthsActive: 24, teamSize: 30, isMei: false })).toMatchObject({ eligible: false, graduate: true });
    expect(checkEligibility({ band: "360k_1m", monthsActive: 24, teamSize: 4, isMei: false }).eligible).toBe(true);
  });
});
