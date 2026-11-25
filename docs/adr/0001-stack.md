# ADR 0001 — Stack do MVP

**Status:** aceita (25/11/2026)

**Decisão:** monorepo pnpm em TypeScript (Next.js 16 + server actions; worker com pg-boss), PostgreSQL 16 com RLS, um
serviço Python só para PDF. Sem ORM: SQL explícito com `pg` e repositórios tipados.

**Por quê:** time pequeno, uma linguagem do front ao back, talento fácil de contratar no Brasil. RLS no banco dá
isolamento mesmo com bug na aplicação. SQL explícito deixa as políticas e índices visíveis e revisáveis.

**Desvio em relação ao PRD v1.1:** o PRD sugeria workers de IA em Python. No MVP, só a leitura de PDF ficou em Python;
OFX/CSV e toda a orquestração de IA estão em TypeScript para reduzir o número de serviços.
