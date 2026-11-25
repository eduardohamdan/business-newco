import compiled from "./generated/method.json";
import type { Category, Method, Metric, Question, Stage, Track } from "./schema";

export * from "./schema";

/**
 * Método compilado (gerado por `pnpm --filter @beos/method build` a partir de content/*.yaml).
 * É importado como JSON para funcionar igual no Next.js, no worker e nos testes.
 */
const METHOD = compiled as unknown as Method;

export function getMethod(): Method {
  return METHOD;
}

export const methodVersion = (): string => METHOD.manifest.version;

export function getTrack(code: string): Track {
  const t = METHOD.tracks.find((x) => x.code === code);
  if (!t) throw new Error(`Trilha desconhecida: ${code}`);
  return t;
}

export function getMetric(code: string): Metric {
  const m = METHOD.metrics.find((x) => x.code === code);
  if (!m) throw new Error(`Indicador desconhecido: ${code}`);
  return m;
}

export function getCategory(code: string): Category {
  const c = METHOD.categories.find((x) => x.code === code);
  if (!c) throw new Error(`Categoria desconhecida: ${code}`);
  return c;
}

export function getStage(code: string): Stage {
  const s = METHOD.manifest.stages.find((x) => x.code === code);
  if (!s) throw new Error(`Estágio desconhecido: ${code}`);
  return s;
}

export function getQuestions(): Question[] {
  return METHOD.questions;
}
