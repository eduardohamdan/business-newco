# Como editar o método

O método fica em `packages/method/content/`:

| Arquivo | Conteúdo |
|---|---|
| `method.yaml` | versão, limites (3 prioridades, cobertura mínima, faixas de confiança), estágios e regras, 6 dimensões e pesos |
| `questionnaire.yaml` | 20 perguntas com opções pontuadas de 0 a 100 e `show_if` para perguntas condicionais |
| `metrics.yaml` | indicadores (unidade, direção, fonte, tolerância) |
| `categories.yaml` | plano de contas simplificado do Raio-X com palavras-chave |
| `tracks/*.yaml` | 24 trilhas (4 por dimensão): gatilhos, indicador e regra de meta, marcos, ações, modelos |

## Passo a passo

1. Edite o YAML.
2. Suba `version` em `method.yaml` (ex.: `2026.11-v0` → `2026.12-v1`).
3. `pnpm --filter @beos/method build` (valida e gera `src/generated/method.json`).
4. `pnpm test && pnpm evals`. Se uma expectativa do conjunto de avaliação mudar de propósito, ajuste o caso e explique no commit.

## Regras do validador (`packages/method/src/compile.ts`)

- códigos únicos; prefixo da trilha bate com a dimensão (`cf`, `vc`, `mm`, `oe`, `pl`, `df`);
- todo sinal referenciado existe (`metric:`, `dimension:`, `maturity:avg`);
- marcos em ordem e nenhuma ação depois do seu marco;
- no mínimo 4 trilhas por dimensão e 2 perguntas incondicionais por dimensão;
- o último estágio é o padrão (sem regra).

## Regra de meta das trilhas

`absolute` (valor fixo), `delta` (baseline + valor) ou `pct_change` (baseline × (1 + valor)), com `min`/`max` opcionais.
Sem baseline, a meta fica pendente e o ritual da semana 1 pergunta o número.

## Confidencialidade

Pesos e scores do questionário **não** vão para o navegador (a página de diagnóstico envia só texto e opções).
