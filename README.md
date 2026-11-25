# Business Evolution OS — MVP

Sistema de evolução empresarial com IA para **micro e pequenas empresas brasileiras** (faturamento até R$ 10 milhões/ano).

> Em 15 minutos você sabe onde sua empresa está. Em 5 minutos por semana, você faz ela evoluir.

O ciclo do produto: **Raio-X de Caixa** (a partir do extrato bancário) → **diagnóstico** (estágio, Índice de Maturidade,
Painel de Desempenho, achados) → **até 3 prioridades** viram **trilhas** com marcos e ações → **plano de 90 dias** →
**ritual semanal de 5 minutos** pelo WhatsApp → **fechamento do ciclo** com evolução comprovada.

- Especificação: [`docs/prd/PRD-v1.1.pdf`](docs/prd/PRD-v1.1.pdf)
- Regras para quem for programar (pessoas ou agentes): [`AGENTS.md`](AGENTS.md)
- Arquitetura: [`docs/arquitetura.md`](docs/arquitetura.md)
- O que está pronto e o que falta: [`docs/plano-de-construcao.md`](docs/plano-de-construcao.md)

## Rodando localmente

Pré-requisitos: Node 22+, pnpm 10 (via `corepack enable`), Docker (ou um Postgres 16 local) e, opcionalmente, Python 3.12.

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres pdf-extractor
pnpm db:migrate
pnpm db:seed          # cria dono@exemplo.com.br com uma empresa de exemplo pronta
pnpm dev              # http://localhost:3000
```

Sem chaves de IA, WhatsApp ou pagamento, tudo roda com provedores **mock**: o código de login aparece no console do
`pnpm dev`, as mensagens de WhatsApp são impressas no terminal e o pagamento tem uma tela de simulação.

## Testes

```bash
pnpm method:validate && pnpm typecheck && pnpm test && pnpm evals && pnpm build
# testes de banco (RLS e jornada ponta a ponta):
TEST_DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test
# extrator de PDF:
cd services/pdf-extractor && pip install -r requirements.txt -r requirements-dev.txt && pytest -q
```

## Estrutura

| Caminho | O que é |
|---|---|
| `apps/web` | App Next.js 16 (UI, server actions, webhooks) |
| `apps/worker` | Filas e agendas (pg-boss): extratos, rituais, lembretes, alertas |
| `packages/method` | O método em YAML: estágios, dimensões, questionário, indicadores, categorias, 24 trilhas |
| `packages/core` | Regras determinísticas: parsers OFX/CSV, Raio-X, diagnóstico, priorização, plano, ritual |
| `packages/db` | Migrações SQL com RLS e repositórios |
| `packages/ai` | Gateway de IA, guardas, prompts, Advisor e conjunto de avaliação |
| `packages/channels` | WhatsApp Cloud API, e-mail, transcrição de áudio |
| `packages/billing` | Cobrança (Asaas + mock) |
| `packages/services` | Casos de uso usados pela web e pelo worker |
| `services/pdf-extractor` | Leitura de extratos em PDF (Python) |
