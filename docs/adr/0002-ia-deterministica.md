# ADR 0002 — IA em pontos definidos, números do sistema

**Status:** aceita

**Decisão:** nenhum agente autônomo no MVP. Fluxos de estado controlados pelo código; a IA atua em 7 pontos (categorizar o
que sobrou, narrar Raio-X, narrar diagnóstico, dica de trilha, interpretar resposta livre do ritual, planejar e redigir a
resposta do Advisor). Cada ponto tem prompt versionado, esquema de saída e caso de avaliação.

**Guardas:** guarda numérica pós-geração (número fora dos dados → reescrita; se persistir, erro), conteúdo do cliente
delimitado como dado, recusa determinística fora do escopo, teto de custo mensal por plano.

**Consequência:** o produto continua funcionando sem IA (provedor mock): cockpit, ritual e cálculos não dependem dela.
