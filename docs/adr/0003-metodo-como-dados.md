# ADR 0003 — Método como dados versionados

**Status:** aceita

**Decisão:** estágios, rubricas, indicadores, categorias e trilhas ficam em YAML (`packages/method/content`), validados por
zod e compilados para JSON. Cada diagnóstico, plano e recomendação guarda a `method_version` usada.

**Por quê:** o método é o ativo que diferencia o produto. Precisa ser revisável por especialistas sem tocar em código,
testável no CI e reproduzível (mesmos dados + mesma versão = mesmo resultado).

**F2:** painel de edição (admin metodológico) gravando no banco, com sandbox e aprovação. Até lá, mudanças passam por PR.
