import { getMethod, type DimensionCode, type Question } from "@beos/method";
import { round1 } from "./money";

export type Answers = Partial<Record<string, string>>;

export interface DimensionScore {
  code: DimensionCode;
  score: number | null;
  answered: number;
  visible: number;
  /** Perguntas que mais puxaram o score para baixo (evidência para o diagnóstico). */
  weakest: { question: string; text: string; answer: string; score: number }[];
}

export interface MaturityResult {
  dimensions: Record<DimensionCode, DimensionScore>;
  /** Média ponderada pelos pesos das dimensões (0–100), só sobre dimensões com resposta. */
  avg: number | null;
  /** Respondidas / visíveis (0–1). */
  coverage: number;
  methodVersion: string;
}

/** Perguntas visíveis dadas as respostas atuais (respeita show_if). */
export function visibleQuestions(answers: Answers, questions: readonly Question[] = getMethod().questions): Question[] {
  return questions.filter((q) => !q.show_if || q.show_if.in.includes(answers[q.show_if.question] ?? "__none__"));
}

/** Índice de Maturidade: determinístico e reproduzível para a mesma versão do método. */
export function scoreMaturity(answers: Answers): MaturityResult {
  const m = getMethod();
  const visible = visibleQuestions(answers, m.questions);
  const dims = {} as Record<DimensionCode, DimensionScore>;
  let answeredTotal = 0;
  for (const d of m.manifest.dimensions) {
    const qs = visible.filter((q) => q.dimension === d.code);
    let wSum = 0;
    let sSum = 0;
    const weakest: DimensionScore["weakest"] = [];
    for (const q of qs) {
      const opt = q.options.find((o) => o.value === answers[q.code]);
      if (!opt) continue;
      wSum += q.weight;
      sSum += q.weight * opt.score;
      weakest.push({ question: q.code, text: q.text, answer: opt.label, score: opt.score });
    }
    const answered = weakest.length;
    answeredTotal += answered;
    weakest.sort((a, b) => a.score - b.score);
    dims[d.code] = {
      code: d.code,
      score: wSum ? Math.round(sSum / wSum) : null,
      answered,
      visible: qs.length,
      weakest: weakest.filter((w) => w.score < 60).slice(0, 2),
    };
  }
  let aw = 0;
  let as = 0;
  for (const d of m.manifest.dimensions) {
    const s = dims[d.code].score;
    if (s === null) continue;
    aw += d.weight;
    as += d.weight * s;
  }
  return {
    dimensions: dims,
    avg: aw ? round1(as / aw) : null,
    coverage: visible.length ? round1(answeredTotal / visible.length * 100) / 100 : 0,
    methodVersion: m.manifest.version,
  };
}
