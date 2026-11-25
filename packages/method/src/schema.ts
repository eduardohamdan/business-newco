import { z } from "zod";

/**
 * Esquemas do método. O conteúdo vive em YAML (packages/method/content) e é validado aqui.
 * Regra: nenhum código de produto interpreta YAML cru — sempre via loadMethod(), que valida tudo.
 */

export const DimensionCode = z.enum([
  "caixa_financas",
  "vendas_clientes",
  "marketing_marca",
  "operacao_entrega",
  "pessoas_lideranca",
  "direcao_foco",
]);
export type DimensionCode = z.infer<typeof DimensionCode>;

export const StageCode = z.enum(["sobrevivencia", "organizacao", "crescimento", "escala"]);
export type StageCode = z.infer<typeof StageCode>;

/** Condição determinística avaliada sobre sinais (métricas, scores de dimensão e fatos). */
export const Condition = z.object({
  /** Ex.: "metric:folego_caixa_dias", "dimension:caixa_financas", "maturity:avg", "fact:revenue_band" */
  signal: z.string().regex(/^(metric|dimension|maturity|fact):[a-z0-9_]+$/),
  op: z.enum(["lt", "lte", "gt", "gte", "eq", "neq"]),
  value: z.union([z.number(), z.string()]),
});
export type Condition = z.infer<typeof Condition>;

export const ConditionGroup = z.object({
  mode: z.enum(["any", "all"]).default("any"),
  conditions: z.array(Condition).min(1),
});
export type ConditionGroup = z.infer<typeof ConditionGroup>;

export const Stage = z.object({
  code: StageCode,
  order: z.number().int().min(1).max(4),
  name: z.string(),
  description: z.string(),
  focus: z.string(),
  /** Regra de entrada. O primeiro estágio (em ordem) cuja regra casa é o estágio da empresa. O último é o padrão. */
  rule: ConditionGroup.optional(),
  /** Dimensões cujas trilhas de expansão ficam bloqueadas neste estágio. */
  blocked_track_tags: z.array(z.string()).default([]),
});
export type Stage = z.infer<typeof Stage>;

export const Dimension = z.object({
  code: DimensionCode,
  name: z.string(),
  question: z.string(),
  weight: z.number().positive().default(1),
});
export type Dimension = z.infer<typeof Dimension>;

export const Metric = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  unit: z.enum(["dias", "pct", "brl_cents", "count", "hours", "ratio"]),
  direction: z.enum(["up", "down"]),
  dimension: DimensionCode,
  source: z.enum(["raiox", "manual", "ritual", "system"]),
  periodicity: z.enum(["weekly", "monthly", "cycle"]),
  description: z.string(),
  /** Tolerância (na unidade do indicador) antes de gerar alerta de desvio. */
  tolerance: z.number().nonnegative().default(0),
});
export type Metric = z.infer<typeof Metric>;

export const CategoryGroup = z.enum([
  "receita",
  "custo_variavel",
  "despesa_fixa",
  "folha",
  "impostos",
  "financeiro",
  "investimento",
  "retirada_socios",
  "transferencia_interna",
  "pessoal_suspeito",
  "outros",
]);
export type CategoryGroup = z.infer<typeof CategoryGroup>;

export const Category = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  group: CategoryGroup,
  /** inflow = só entradas, outflow = só saídas, both = qualquer sentido */
  direction: z.enum(["inflow", "outflow", "both"]),
  keywords: z.array(z.string()).default([]),
  /** Prioridade da regra por palavra-chave (maior vence em empate). */
  priority: z.number().int().default(0),
});
export type Category = z.infer<typeof Category>;

export const QuestionOption = z.object({
  value: z.string(),
  label: z.string(),
  score: z.number().min(0).max(100),
});

export const Question = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
  dimension: DimensionCode,
  text: z.string(),
  help: z.string().optional(),
  options: z.array(QuestionOption).min(2),
  weight: z.number().positive().default(1),
  /** Só pergunta se a condição casar (ex.: empresas com equipe). */
  show_if: z
    .object({ question: z.string(), in: z.array(z.string()) })
    .optional(),
});
export type Question = z.infer<typeof Question>;

export const TargetRule = z.object({
  type: z.enum(["absolute", "delta", "pct_change"]),
  value: z.number(),
  /** Piso/teto aplicados ao alvo calculado (ex.: baseline zero). */
  min: z.number().optional(),
  max: z.number().optional(),
});
export type TargetRule = z.infer<typeof TargetRule>;

export const TrackAction = z.object({
  title: z.string(),
  week: z.number().int().min(1).max(12),
  role: z.enum(["owner", "manager", "member"]).default("owner"),
  minutes: z.number().int().positive().default(30),
});

export const TrackMilestone = z.object({
  code: z.string(),
  title: z.string(),
  week: z.number().int().min(1).max(12),
  evidence: z.string(),
  actions: z.array(TrackAction).min(1),
});
export type TrackMilestone = z.infer<typeof TrackMilestone>;

export const TrackTemplate = z.object({
  title: z.string(),
  kind: z.enum(["checklist", "script", "planilha", "roteiro", "modelo"]),
  body: z.string(),
});

export const Track = z.object({
  code: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/),
  version: z.number().int().positive(),
  title: z.string(),
  dimension: DimensionCode,
  stages: z.array(StageCode).min(1),
  tags: z.array(z.string()).default([]),
  objective: z.string(),
  why: z.string(),
  impact: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  /** Sinais que tornam a trilha relevante. Cada condição casada soma `weight` ao fit. */
  triggers: z.array(Condition.extend({ weight: z.number().positive().default(1) })).min(1),
  requires: z
    .object({ bank_statement: z.boolean().default(false), team_min: z.number().int().default(1) })
    .default({ bank_statement: false, team_min: 1 }),
  indicator: z.object({ metric: z.string(), target: TargetRule }),
  milestones: z.array(TrackMilestone).min(3),
  templates: z.array(TrackTemplate).default([]),
});
export type Track = z.infer<typeof Track>;

export const MethodManifest = z.object({
  version: z.string(),
  name: z.string(),
  stages: z.array(Stage).length(4),
  dimensions: z.array(Dimension).length(6),
  limits: z.object({
    max_priorities: z.number().int().positive(),
    max_priorities_per_dimension: z.number().int().positive(),
    min_coverage_for_diagnosis: z.number().min(0).max(1),
    confidence_high: z.number(),
    confidence_moderate: z.number(),
    cycle_weeks: z.number().int().positive(),
  }),
});
export type MethodManifest = z.infer<typeof MethodManifest>;

export interface Method {
  manifest: MethodManifest;
  metrics: Metric[];
  categories: Category[];
  questions: Question[];
  tracks: Track[];
}
