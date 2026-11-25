# AGENTS.md — instruções para agentes de código (Manus, Claude Code, Codex etc.)

Este repositório é o MVP do **Business Evolution OS**: sistema de gestão com IA para micro e pequenas empresas brasileiras
(faturamento até R$ 10 milhões/ano). A especificação completa está em `docs/prd/PRD-v1.1.pdf`. Leia este arquivo inteiro
antes de alterar qualquer código.

## 1. Regras invioláveis (não negociáveis)

1. **Números são do sistema, texto é da IA.** Indicadores, score, estágio, metas, cobrança e permissões são calculados em
   código determinístico (`packages/core`). A IA só redige, interpreta texto livre e sugere. Nunca peça para um modelo
   calcular um número que será mostrado ao cliente.
2. **Toda chamada de IA passa pelo gateway** (`packages/ai/src/gateway.ts`): roteamento por tarefa, fallback entre
   fornecedores, validação de esquema (zod), **guarda numérica** (todo número citado precisa existir nos dados),
   teto de custo por plano e log em `ai_call_logs`. Nunca chame a API de um fornecedor diretamente.
3. **Isolamento entre empresas.** Todo acesso a dados de negócio usa `withTenant(orgId, ...)` (`packages/db`). O Postgres
   aplica **RLS forçado**; o app conecta com o papel `beos_app`, sem bypass. Nunca use a URL de admin no app web.
   Toda tabela nova de negócio precisa de `organization_id` + política RLS na migração + teste em `packages/db/test`.
4. **Conteúdo do cliente é dado, não instrução.** Descrições de extrato, mensagens e áudios entram no prompt via
   `wrapUntrusted()`. Nunca concatene texto do cliente no system prompt.
5. **No máximo 3 prioridades por ciclo.** Garantido no core (`prioritize`, `assertCanAddPriority`), no banco (índice único
   parcial) e na UI. Não flexibilize.
6. **Fora do escopo do produto:** aconselhamento jurídico, tributário individual, de crédito ou investimento; movimentar
   dinheiro; ERP/emissão fiscal. O Advisor recusa (`outOfScope`) antes de chamar o modelo.
7. **LGPD:** CPF de terceiros é mascarado na ingestão (`sanitizeDescription`); contraparte vira hash com sal por empresa.
   Exportação e exclusão existem e precisam continuar funcionando (RF17).
8. **WhatsApp é canal de serviço**, com fluxos estruturados (ritual, alertas, tarefas). Não transforme em assistente aberto:
   a política da Meta proíbe chatbots de IA de uso geral na API desde 15/01/2026. Perguntas abertas vão para o Advisor no app.
9. **Dinheiro em centavos inteiros** (`number` inteiro em TS, `bigint` no banco). Nunca some floats de reais.
10. **Português do Brasil** em toda interface, mensagem e prompt. Linguagem do dono de pequena empresa, sem jargão.

## 2. Mapa do repositório

```
apps/web            Next.js 16 (App Router, server actions). Só UI + validação de entrada; regras ficam nos packages.
apps/worker         pg-boss: processa extratos, envia rituais no horário de cada empresa, lembretes e alertas.
packages/method     O MÉTODO: estágios, dimensões, questionário, indicadores, categorias e 24 trilhas em YAML.
packages/core       Domínio determinístico puro (sem I/O): parsers, Raio-X, diagnóstico, priorização, plano, ritual.
packages/db         Migrações SQL (fonte da verdade, com RLS), cliente pg, repositórios.
packages/ai         Gateway de IA, guardas, prompts versionados, fluxos (narrativas, categorização, ritual, Advisor), evals.
packages/channels   WhatsApp Cloud API, e-mail, transcrição de áudio, templates.
packages/billing    Gateway de pagamento (Asaas + mock).
packages/services   Casos de uso que orquestram core + db + ai + channels + billing. Web e worker chamam SÓ esta camada.
services/pdf-extractor  Python/FastAPI: leitura de extratos em PDF.
evals/              (reservado) casos reais anonimizados de design partners.
docs/               PRD, arquitetura, ADRs, plano de construção, templates de WhatsApp, segurança.
```

Dependências permitidas: `web/worker → services → (core, db, ai, channels, billing) → method`. `core` não importa `db`,
`ai` nem nada com I/O.

## 3. Como rodar

```bash
corepack enable && pnpm install
cp .env.example .env                      # preencha; com os "mock" tudo roda sem chaves
docker compose -f infra/docker-compose.yml up -d postgres pdf-extractor
pnpm db:migrate                            # usa DATABASE_ADMIN_URL
pnpm db:seed                               # empresa de exemplo com Raio-X, diagnóstico e ciclo
pnpm dev                                   # http://localhost:3000 — o código de login aparece no console
pnpm dev:worker                            # opcional com PROCESS_INLINE=true
```

## 4. Como validar uma mudança (obrigatório antes de commit)

```bash
pnpm method:validate     # método YAML válido e JSON compilado atualizado
pnpm typecheck
pnpm test                # unit + db (o projeto db exige TEST_DATABASE_ADMIN_URL)
pnpm evals               # conjunto de avaliação de IA (mock no CI; rode com fornecedor real antes de publicar prompts)
pnpm build
```

`TEST_DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test` roda também os testes de RLS e a
jornada ponta a ponta (`packages/services/test/flow.test.ts`).

## 5. Como fazer as mudanças mais comuns

- **Alterar o método** (trilha, pergunta, indicador, regra de estágio): edite `packages/method/content/*.yaml`, suba a
  `version` em `method.yaml`, rode `pnpm --filter @beos/method build`, `pnpm test` e `pnpm evals`. Ver `docs/metodo.md`.
- **Nova tabela:** nova migração `packages/db/migrations/000N_nome.sql` (nunca edite uma migração já aplicada), com RLS,
  grants para `beos_app`, repositório em `packages/db/src/tenant.ts` e teste de isolamento.
- **Novo prompt ou mudança de prompt:** `packages/ai/src/prompts/index.ts`, suba a versão (`nome@N`), adicione casos em
  `packages/ai/src/evals.ts`.
- **Novo canal ou fornecedor:** implemente a interface (`MessagingChannel`, `LlmProvider`, `PaymentGateway`, `Storage`) e
  selecione por variável de ambiente. Nada de `if (fornecedor === ...)` espalhado no código.
- **Nova tela:** server component em `apps/web/app/app/...` chamando `@beos/services`; ações em `app/app/actions.ts`
  sempre começam com `requireOrg()`.

## 6. Prioridades de construção

Siga `docs/plano-de-construcao.md`. Ele lista, com honestidade, o que está pronto, o que está parcial e o que falta
para produção (o que é Fase 2 no PRD fica para depois do MVP).

## 7. Convenções

- TypeScript estrito, ESM, sem build dos packages (o Next transpila; o worker usa `tsx`).
- Nomes de domínio em português no produto e nos textos; código e identificadores em inglês ou português, como já estão.
- Commits pequenos, com testes. Não desligue testes para "fazer passar".
- Segredos só em variáveis de ambiente. Nunca versione `.env`.
