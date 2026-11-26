# Prompt para o Manus — construção do Tento

Copie tudo abaixo da linha e envie ao Manus.

---

Você vai continuar a construção de um produto de software que já tem um MVP funcional e testado. Seu trabalho é levar
esse MVP ao estado de piloto com 10 empresas reais, com a interface e a identidade visual definidas, sem quebrar o que
já funciona.

## 1. Contexto

- Repositório: https://github.com/eduardohamdan/business-newco (branch `main`).
- Produto: **Tento** (nome provisório; nome interno do projeto: Business Evolution OS). Sistema de gestão com IA para
  micro e pequenas empresas brasileiras com faturamento de até R$ 10 milhões por ano. O dono envia o extrato bancário,
  recebe um Raio-X de Caixa, faz um diagnóstico, escolhe até 3 prioridades, recebe um plano de 90 dias e mantém o ritmo
  com um ritual semanal de 5 minutos pelo WhatsApp.
- Stack: monorepo pnpm, TypeScript, Next.js 16 (App Router, server actions, Tailwind v4), PostgreSQL 16 com RLS
  forçado, pg-boss (worker), FastAPI (extrator de PDF), zod, vitest.
- Estado atual: 92 testes passando, 9 de 9 evals de IA aprovados com o provedor simulado, build ok, jornada completa
  testada no navegador.

## 2. Leia antes de escrever qualquer código

Nesta ordem, inteiros:

1. `AGENTS.md`: regras invioláveis, mapa do código, como rodar e como validar. **Tudo o que está lá vale acima deste
   prompt.**
2. `docs/plano-de-construcao.md`: o que está pronto, o que está parcial e o que falta. É a fonte de verdade do status.
3. `docs/design/interface-ideal.html`: abra no navegador. É o protótipo navegável da interface (abas Cockpit, Raio-X,
   Diagnóstico, Ritual e Identidade). **É a referência visual obrigatória.**
4. `docs/prd/PRD-v1.1.pdf`: a especificação do produto.
5. `docs/arquitetura.md`, `docs/metodo.md`, `docs/whatsapp-templates.md`, `docs/seguranca-lgpd.md`, `docs/deploy.md`.

Depois de ler, me mande um resumo de no máximo 15 linhas com o que você entendeu e qualquer contradição que tenha
encontrado entre os documentos. Não comece a Fase 1 antes disso.

## 3. Regras que você não pode quebrar (resumo; a versão completa está no AGENTS.md)

1. Números são calculados em código determinístico (`packages/core`). A IA só redige e interpreta texto.
2. Toda chamada de IA passa pelo gateway (`packages/ai/src/gateway.ts`). Nunca chame um fornecedor direto.
3. Todo acesso a dados de negócio usa `withTenant`. Tabela nova = migração nova com RLS + teste de isolamento.
4. Texto do cliente entra no prompt só via `wrapUntrusted()`.
5. No máximo 3 prioridades por ciclo, no core, no banco e na UI.
6. Dinheiro em centavos inteiros.
7. WhatsApp é canal de serviço com fluxos estruturados, nunca um chatbot aberto (política da Meta desde 15/01/2026).
8. Interface em português do Brasil, linguagem do dono de pequena empresa, sem jargão.
9. Não edite migração já aplicada; não desligue nem afrouxe testes para "fazer passar".
10. Segredos só em variáveis de ambiente. Nunca versione `.env` nem chaves.

## 4. Identidade visual (vale para todas as fases)

Os tokens, a fonte e o logo já estão aplicados (`apps/web/app/globals.css`, `components/Logo.tsx`, `lib/brand.ts`).
Siga a seção 7 do AGENTS.md e a aba Identidade do protótipo:

- Só as cores do tema: `papel`, `folha`, `pauta`, `pauta-forte`, `tinta`, `tinta-escura`, `tinta-clara`, `grafite`,
  `grafite-2`, `grafite-3`, `marca-texto`, `ritmo`, `atencao`, `atraso` (e as versões `-claro`). Nada da paleta padrão
  do Tailwind (`slate-*`, `emerald-*`, `red-*` etc.) e nenhuma cor nova sem me perguntar.
- Fonte única: Schibsted Grotesk, servida pelo próprio app. Hierarquia por peso e tamanho; cor só para significado.
- Azul-caneta (`tinta`) para dados e ações da empresa. Marca-texto (`.marca-texto`) **uma única vez por tela**, só na
  próxima ação. Vermelho (`atraso`) só para o que venceu ou é crítico.
- Listas e prioridades são linhas com divisores (pauta), não pilhas de cartões iguais.
- Texto em caixa de frase. Sem rótulos em caixa alta, sem "→" em botões, sem "A · B · C" em metadados. Botões dizem
  exatamente o que acontece, e a mesma palavra se repete na confirmação ("Marcar como feito" → "Marcado como feito").
- Contraste mínimo AA, foco visível em tudo que é clicável, `prefers-reduced-motion` respeitado. Uma única animação
  no produto: as barras da faixa de semanas crescendo ao carregar o Cockpit.
- Gráficos em SVG ou CSS próprios, sem biblioteca de gráficos e sem biblioteca de componentes de UI. Todo gráfico
  precisa de `aria-label` com o dado em texto.
- O nome da marca só existe em `apps/web/lib/brand.ts`. Na UI, use `BRAND.name`. Nunca escreva "Tento" direto em
  componente: o nome ainda pode mudar.
- Mobile primeiro: o dono usa no celular. Toda tela tem que funcionar em 390 px de largura sem rolagem horizontal.

## 5. Fases

Trabalhe uma fase por vez. **Ao fim de cada fase, pare e me mande o relatório da seção 7. Só siga para a próxima
fase depois do meu "ok".**

### Fase 0 — Linha de base (curta)

1. Rode o projeto do zero seguindo a seção 3 do AGENTS.md (com os provedores `mock`).
2. Rode a validação completa da seção 4 do AGENTS.md, incluindo os testes de banco com `TEST_DATABASE_ADMIN_URL`.
3. Faça a jornada no navegador: login → onboarding → Raio-X (use um CSV de exemplo dos testes) → diagnóstico → plano →
   Cockpit → ritual pela web → Advisor → relatório → assinatura simulada.
4. Relatório: o que passou, o que falhou e por quê. Não corrija nada ainda, só me conte.

### Fase 1 — Interface completa no padrão do protótipo (item P2.9 e P2.4 do plano)

Leve o layout do protótipo para as telas reais, com dados reais do banco. Extraia componentes reutilizáveis em
`apps/web/components/` (sugestão de nomes: `WeekBand`, `NextAction`, `PriorityRow`, `Ruler`, `ActionDots`,
`StatusPill`, `FindingColumns`, `MonthBars`, `CategoryLines`, `StageLadder`, `DimensionBar`, `Notice`). Regras de
negócio continuam nos packages; componentes só recebem dados prontos dos serviços.

**Cockpit (`/app`)**
- Faixa das 12 semanas no topo: para cada semana do ciclo, a barra mostra a % de ações daquela semana marcadas como
  feitas (tabela `actions`, campo de semana); a bolinha embaixo mostra o ritual: preenchida = respondido, vazada em
  vermelho = perdido, contorno claro = semana futura (tabela `ritual_sessions`). A semana atual tem destaque em
  marca-texto e o número sublinhado. Antes do início do ciclo, mostre "Ciclo começa em …" no lugar da faixa.
- Título "Semana N de 12" e uma linha de contexto (rituais seguidos, data de fim do ciclo).
- "A única coisa para esta semana": a próxima ação com marca-texto, de onde ela vem (prioridade e marco), tempo
  estimado se existir, botões "Marcar como feito" e "Comecei".
- Prioridades como linhas numeradas: título, estado (No ritmo / Atenção / Atrasado, vindo do core), "X de Y ações",
  pontinhos das ações, "Por que isso?" e a régua com início, valor atual e meta do indicador.
- Coluna lateral: alerta de marco vencido (se houver), bloco Caixa (fôlego em dias com o número grande, entradas,
  saídas e meses no vermelho do último Raio-X) e Próximo ritual (dia, horário e canal).

**Raio-X (`/app/raio-x`)**
- Cabeçalho com período, frase sobre a conciliação e o arquivo enviado (nome, número de lançamentos, % classificados).
- Três achados lado a lado (empilhados no celular), cada um com nível (Crítico/Atenção), título e uma frase.
- Mês a mês: barras de entradas (tinta) e saídas (atraso) por mês, com o saldo do mês embaixo.
- Para onde vai o dinheiro: categorias em linhas com valor e barra proporcional; as suspeitas de gasto pessoal marcadas
  em vermelho com o texto "possível gasto pessoal". Link "Revisar N lançamentos" para `/app/raio-x/lancamentos`.
- Nota de rodapé sobre o mascaramento de CPFs de terceiros.

**Diagnóstico (`/app/diagnostico`)**
- Escada dos 4 estágios com "(você está aqui)" no atual.
- Escolha de prioridades: as sugeridas já marcadas, contador "N de 3", a quarta opção desabilitada quando já há 3,
  e "Por que outras ideias ficaram para depois".
- Índice de maturidade: uma linha por dimensão, com régua de 0 a 100 (vermelho abaixo de 35, âmbar abaixo de 55,
  tinta a partir de 55) e a nota explicando que maturidade e desempenho ficam separados.

**Demais telas** (Plano, Ritual na web, Advisor, Relatórios, Configurações, Assinatura, Onboarding, Login, Landing,
painel `/interno`): mesmo sistema visual, mesmos componentes, mesma voz. A tela de Ritual na web deve espelhar as três
perguntas do WhatsApp (ação da semana com Feito/Em parte/Não deu, número da semana, bloqueio opcional) e terminar com o
resumo e a próxima ação.

**Estados vazios e erros:** toda tela tem estado vazio com um convite claro para agir ("Envie o extrato da conta da
empresa para ver seu Raio-X") e erros que dizem o que aconteceu e como resolver, sem pedir desculpas.

**Testes de interface (P2.4):** Playwright cobrindo a jornada completa da Fase 0, rodando com `pnpm test:e2e`, com
capturas de tela em 390 px e 1360 px de cada tela principal salvas em `docs/design/capturas/`. Inclua verificação
automática de acessibilidade (axe) nas telas principais, sem violações sérias.

**Nome da marca no prompt da IA:** `packages/ai/src/prompts/index.ts` ainda diz "Business Evolution OS" no prompt de
sistema. Faça o nome vir de configuração (variável de ambiente `BRAND_NAME`, padrão "Tento"), suba a versão do prompt
(`nome@N+1`) e rode `pnpm evals`.

**Critério de pronto da Fase 1:** as cinco telas do protótipo reproduzidas com dados reais e visualmente equivalentes
ao `interface-ideal.html` em 390 px e 1360 px; nenhuma classe da paleta padrão do Tailwind no código (um teste ou
script de lint que falhe se aparecer); validação completa do AGENTS.md verde; e2e verde; capturas salvas.

### Fase 2 — Pronto para o piloto (parte técnica)

Itens do `docs/plano-de-construcao.md`, cada um com teste:

1. **P2.1** Tarefas para colaboradores: enviar a tarefa ao responsável pelo template `tarefa_atribuida` e aceitar
   "FEITO" como resposta.
2. **P2.2** Status de entrega do WhatsApp: persistir os `statuses` do webhook por `provider_message_id` (nova migração).
3. **P2.3** Ajuste de meta com justificativa no plano, registrado em `audit_events`.
4. **P2.6** PDF gerado no servidor (Chromium headless no worker) a partir das rotas de relatório, enviado por e-mail no
   fechamento do ciclo.
5. **P1.6 (parte técnica)** CSP, rate limit por IP nas rotas de login e webhooks, cabeçalhos de segurança revisados.
6. **P1.7** Observabilidade: Sentry (ou OpenTelemetry) no web e no worker, com alerta de erro e de custo de IA por conta.
7. **P1.8** Deploy em ambiente de homologação em região Brasil, seguindo `docs/deploy.md`. **Antes de contratar
   qualquer serviço ou criar conta em nome da empresa, me pergunte e me mostre o custo mensal estimado.**

### Fase 3 — Integrações reais (só com credenciais que eu fornecer)

1. **P1.2** IA real: com a chave que eu passar, rode `AI_PRIMARY_PROVIDER=anthropic pnpm evals`, gere 20 narrativas
   de exemplo para revisão humana e corrija os prompts até zerar números inventados.
2. **P1.4** WhatsApp Cloud API: número de teste, webhook com assinatura validada, envio dos templates de
   `docs/whatsapp-templates.md` para aprovação, ritual ponta a ponta com um número real, descadastro por SAIR/PARAR.
3. **M12** Asaas em sandbox: assinatura, webhook de pagamento, inadimplência e cancelamento.

Quando precisar de uma credencial, pare e me peça, dizendo exatamente qual variável de ambiente ela preenche. Nunca
crie contas, aceite termos, compre domínio ou contrate serviço por conta própria.

## 6. O que não fazer

- Não troque a stack, o gerenciador de pacotes, o ORM (não há ORM; é SQL com `pg`) nem a estrutura de pastas.
- Não adicione bibliotecas de UI, de gráficos, de estado global ou de CSS-in-JS.
- Não mexa no conteúdo do método (`packages/method/content`) nem nos pesos e regras de estágio: isso depende da revisão
  do Methodology Owner (item P1.1).
- Não escreva textos jurídicos finais (termos, privacidade): ficam como estão até a revisão jurídica (P1.5).
- Não use dados reais de clientes em testes; use os geradores sintéticos (`packages/core/src/testing`).
- Não faça commits enormes. Um commit por assunto, com mensagem em português explicando o porquê.

## 7. Como me reportar ao fim de cada fase

1. O que foi feito, item por item, com o arquivo principal de cada um.
2. Resultado da validação completa (comandos e saída resumida).
3. Capturas de tela das telas alteradas (390 px e 1360 px).
4. O que ficou pendente e por quê.
5. Decisões que você tomou sozinho e que eu deveria revisar.
6. `docs/plano-de-construcao.md` atualizado com o novo status de cada item e o teste que o cobre.

Se encontrar algo no código que contradiga o AGENTS.md ou o PRD, ou se uma instrução deste prompt parecer errada, pare
e me pergunte antes de seguir. Prefiro uma pergunta a mais do que uma suposição errada.
