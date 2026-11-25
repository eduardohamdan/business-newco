import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { Category, MethodManifest, Metric, Question, Track, type Method } from "./schema";

/** Lê o conteúdo YAML de um diretório, valida e faz checagens cruzadas. Usado no build e nos testes. */
export function compileMethodFromDir(dir: string): Method {
  const read = (f: string) => parse(readFileSync(join(dir, f), "utf8"));
  const manifest = MethodManifest.parse(read("method.yaml"));
  const metrics = z.array(Metric).parse(read("metrics.yaml"));
  const categories = z.array(Category).parse(read("categories.yaml"));
  const questions = z.array(Question).parse(read("questionnaire.yaml"));
  const tracks = readdirSync(join(dir, "tracks"))
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => {
      const t = Track.safeParse(parse(readFileSync(join(dir, "tracks", f), "utf8")));
      if (!t.success) throw new Error(`Trilha inválida em ${f}: ${t.error.message}`);
      if (`${t.data.code}.yaml` !== f) throw new Error(`Arquivo ${f} deve se chamar ${t.data.code}.yaml`);
      return t.data;
    });
  const method: Method = { manifest, metrics, categories, questions, tracks };
  const problems = crossCheck(method);
  if (problems.length) throw new Error("Método inconsistente:\n- " + problems.join("\n- "));
  return method;
}

export function crossCheck(m: Method): string[] {
  const p: string[] = [];
  const metricCodes = new Set(m.metrics.map((x) => x.code));
  const dimCodes = new Set(m.manifest.dimensions.map((d) => d.code));
  const qCodes = new Set(m.questions.map((q) => q.code));
  const dup = (arr: string[], what: string) => {
    const seen = new Set<string>();
    for (const c of arr) {
      if (seen.has(c)) p.push(`${what} duplicado: ${c}`);
      seen.add(c);
    }
  };
  dup(m.metrics.map((x) => x.code), "Indicador");
  dup(m.categories.map((x) => x.code), "Categoria");
  dup(m.questions.map((x) => x.code), "Pergunta");
  dup(m.tracks.map((x) => x.code), "Trilha");

  const checkSignal = (sig: string, where: string) => {
    const [kind, code] = sig.split(":") as [string, string];
    if (kind === "metric" && !metricCodes.has(code)) p.push(`${where}: indicador inexistente ${code}`);
    if (kind === "dimension" && !dimCodes.has(code as never)) p.push(`${where}: dimensão inexistente ${code}`);
    if (kind === "maturity" && code !== "avg") p.push(`${where}: sinal de maturidade só aceita 'avg'`);
  };
  for (const s of m.manifest.stages) s.rule?.conditions.forEach((c) => checkSignal(c.signal, `Estágio ${s.code}`));
  const orders = m.manifest.stages.map((s) => s.order).join(",");
  if (orders !== "1,2,3,4") p.push("Estágios devem estar em ordem 1..4");
  if (m.manifest.stages.at(-1)?.rule) p.push("O último estágio é o padrão e não deve ter regra");

  for (const q of m.questions) {
    if (q.show_if && !qCodes.has(q.show_if.question)) p.push(`Pergunta ${q.code}: show_if referencia ${q.show_if.question}`);
  }
  for (const d of dimCodes) {
    const n = m.questions.filter((q) => q.dimension === d && !q.show_if).length;
    if (n < 2) p.push(`Dimensão ${d} precisa de pelo menos 2 perguntas incondicionais`);
  }

  for (const t of m.tracks) {
    if (!metricCodes.has(t.indicator.metric)) p.push(`Trilha ${t.code}: indicador inexistente ${t.indicator.metric}`);
    const metric = m.metrics.find((x) => x.code === t.indicator.metric);
    if (metric && metric.dimension !== t.dimension && !["df", "pl"].includes(t.code.slice(0, 2))) {
      // Aviso suave: trilhas podem medir um indicador de outra dimensão, mas isso deve ser intencional.
    }
    t.triggers.forEach((c) => checkSignal(c.signal, `Trilha ${t.code}`));
    const weeks = t.milestones.map((x) => x.week);
    if ([...weeks].sort((a, b) => a - b).join() !== weeks.join()) p.push(`Trilha ${t.code}: marcos fora de ordem`);
    for (const ms of t.milestones) {
      for (const a of ms.actions) if (a.week > ms.week) p.push(`Trilha ${t.code}/${ms.code}: ação depois do marco`);
    }
    const pref = t.code.slice(0, 2);
    const expected: Record<string, string> = {
      cf: "caixa_financas", vc: "vendas_clientes", mm: "marketing_marca",
      oe: "operacao_entrega", pl: "pessoas_lideranca", df: "direcao_foco",
    };
    if (expected[pref] !== t.dimension) p.push(`Trilha ${t.code}: prefixo não bate com a dimensão ${t.dimension}`);
  }
  for (const d of dimCodes) {
    const n = m.tracks.filter((t) => t.dimension === d).length;
    if (n < 4) p.push(`Dimensão ${d} tem ${n} trilhas (mínimo 4)`);
  }
  const groups = new Set(m.categories.map((c) => c.group));
  for (const g of ["receita", "despesa_fixa", "impostos", "pessoal_suspeito", "transferencia_interna"]) {
    if (!groups.has(g as never)) p.push(`Falta categoria do grupo ${g}`);
  }
  if (!m.categories.some((c) => c.code === "outros_entradas") || !m.categories.some((c) => c.code === "outros_saidas"))
    p.push("Categorias de fallback outros_entradas/outros_saidas são obrigatórias");
  return p;
}
