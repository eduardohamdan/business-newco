import { getMethod, type Category } from "@beos/method";
import { normalizeText } from "./text";

export type CategorySource = "org_rule" | "keyword" | "model" | "user" | "fallback";

export interface OrgCategoryRule {
  /** Trecho normalizado (maiúsculas, sem acento) que deve aparecer na descrição. */
  pattern: string;
  categoryCode: string;
  /** Opcional: restringe ao sentido do lançamento. */
  direction?: "inflow" | "outflow";
}

export interface Categorization {
  categoryCode: string;
  source: CategorySource;
  confidence: number;
  personalSuspect: boolean;
  /** true quando nenhuma regra casou: candidata à classificação por IA ou revisão do usuário. */
  needsReview: boolean;
  matchedKeyword?: string;
}

const CONF = { org_rule: 0.97, keyword_strong: 0.88, keyword_weak: 0.72, fallback: 0.3 };

/**
 * Classificação determinística: regras aprendidas da organização > palavras-chave do método > fallback.
 * A IA só entra para o que sobrar com needsReview=true (packages/ai, tarefa categorize_txn).
 */
export function categorize(
  t: { amountCents: number; description: string; counterpartyKind?: "pf" | "pj" | "unknown" },
  orgRules: readonly OrgCategoryRule[] = [],
  categories: readonly Category[] = getMethod().categories,
): Categorization {
  const dir = t.amountCents >= 0 ? "inflow" : "outflow";
  const desc = ` ${normalizeText(t.description)} `;
  const byCode = new Map(categories.map((c) => [c.code, c]));

  // 1) Regras da organização (correções do usuário viram regra).
  const descTokens = new Set(tokens(t.description));
  const orgHit = [...orgRules]
    .filter((r) => (!r.direction || r.direction === dir) && tokens(r.pattern).every((tk) => descTokens.has(tk)))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (orgHit && byCode.has(orgHit.categoryCode)) {
    const cat = byCode.get(orgHit.categoryCode)!;
    return {
      categoryCode: cat.code,
      source: "org_rule",
      confidence: CONF.org_rule,
      personalSuspect: cat.group === "pessoal_suspeito",
      needsReview: false,
      matchedKeyword: orgHit.pattern,
    };
  }

  // 2) Palavras-chave do método.
  let best: { cat: Category; kw: string } | undefined;
  for (const cat of categories) {
    if (cat.direction !== "both" && cat.direction !== dir) continue;
    for (const kw of cat.keywords) {
      const k = normalizeText(kw);
      const needle = kw.endsWith(" ") ? ` ${k} ` : k;
      if (!desc.includes(needle)) continue;
      if (
        !best ||
        cat.priority > best.cat.priority ||
        (cat.priority === best.cat.priority && k.length > normalizeText(best.kw).length)
      ) {
        best = { cat, kw };
      }
    }
  }
  if (best) {
    return {
      categoryCode: best.cat.code,
      source: "keyword",
      confidence: best.cat.priority >= 3 ? CONF.keyword_strong : CONF.keyword_weak,
      personalSuspect: best.cat.group === "pessoal_suspeito",
      needsReview: false,
      matchedKeyword: best.kw,
    };
  }

  // 3) Fallback.
  return {
    categoryCode: dir === "inflow" ? "outros_entradas" : "outros_saidas",
    source: "fallback",
    confidence: CONF.fallback,
    personalSuspect: false,
    needsReview: true,
  };
}

/** Tokens significativos (sem pontuação solta, números e máscaras). */
function tokens(s: string): string[] {
  return normalizeText(s)
    .split(/[\s\-/.]+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !/^\*+/.test(w));
}

/** Transforma uma correção do usuário numa regra reutilizável da organização. */
export function ruleFromCorrection(description: string, categoryCode: string, amountCents: number): OrgCategoryRule {
  return {
    pattern: tokens(description).slice(0, 4).join(" "),
    categoryCode,
    direction: amountCents >= 0 ? "inflow" : "outflow",
  };
}
