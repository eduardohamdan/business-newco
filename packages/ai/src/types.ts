/** Tarefas de IA. Cada uma tem nível de modelo, versão de prompt e contrato de saída próprios. */
export type AiTask =
  | "categorize_txn"
  | "extract_statement"
  | "raiox_narrative"
  | "diagnosis_narrative"
  | "track_tip"
  | "ritual_interpret"
  | "advisor_plan"
  | "advisor_answer";

export type Tier = "fast" | "reasoning";

export const TASK_TIER: Record<AiTask, Tier> = {
  categorize_txn: "fast",
  extract_statement: "fast",
  raiox_narrative: "fast",
  diagnosis_narrative: "reasoning",
  track_tip: "reasoning",
  ritual_interpret: "fast",
  advisor_plan: "fast",
  advisor_answer: "reasoning",
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  /** Pede saída JSON (o gateway valida com zod). */
  json: boolean;
  task: AiTask;
}

export interface CompletionResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  name: string;
  modelFor(tier: Tier): string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

export interface AiCallLog {
  task: AiTask;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costMicroBrl: number;
  latencyMs: number;
  guardStatus: "ok" | "numeric_violation" | "schema_error" | "provider_error" | "budget_degraded" | "blocked";
  error?: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: "budget_exceeded" | "all_providers_failed" | "schema_error" | "guard_failed",
  ) {
    super(message);
    this.name = "AiError";
  }
}
