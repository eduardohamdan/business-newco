# Plano de construção — status real e próximos passos

Legenda: ✅ pronto e testado · 🟡 implementado, falta validar com fornecedor/dados reais · ⬜ não iniciado

Este documento é a fonte de verdade sobre o que existe. Ao concluir um item, atualize a linha e cite o teste que o cobre.

## 1. Status por módulo (PRD v1.1, seção 12)

| Módulo | Status | Onde | Observações |
|---|---|---|---|
| M01 Contas, organizações e papéis | ✅ | `db/identity.ts`, `web/app/entrar`, `onboarding` | Login sem senha por e-mail (OTP). Papéis dono/gestor/colaborador. |
| M02 Raio-X de Caixa | ✅ | `core/raiox.ts`, `services/statement.ts` | OFX/CSV testados; conciliação bloqueia divergência; correção vira regra. |
| M03 Onboarding e estágio | ✅ | `web/app/app/onboarding`, `core/stage.ts` | Elegibilidade do ICP (PRD 5.3). |
| M04 Ingestão e memória | 🟡 | `core/statement`, `services/pdf-extractor` | PDF genérico: validar com extratos reais dos 5 maiores bancos de PME. |
| M05 Índice e Painel | ✅ | `core/maturity.ts`, `core/diagnosis.ts` | Separados, reproduzíveis por versão do método. |
| M06 Diagnóstico e priorização | ✅ | `core/diagnosis.ts`, `core/prioritize.ts` | Cobertura mínima, confiança, adiadas explicadas. |
| M07 Trilhas e plano | ✅ | `method/content/tracks`, `core/plan.ts` | 24 trilhas v1 — **revisão do Methodology Owner pendente**. |
| M08 Ritual e alertas | 🟡 | `services/ritual.ts`, `worker` | Fluxo completo com canal mock. Falta: templates aprovados na Meta e teste com número real. |
| M09 Cockpit | ✅ | `web/app/app/page.tsx` | |
| M10 Advisor | 🟡 | `ai/flows`, `services/advisor.ts` | Testado com mock. Rodar `pnpm evals` com fornecedor real e ajustar prompts. |
| M11 Relatórios | 🟡 | `web/app/app/relatorios` | HTML pronto para impressão (“Salvar como PDF”). PDF no servidor: ver item P2.6. |
| M12 Assinatura | 🟡 | `billing`, `services/billing.ts` | Asaas implementado, não testado no sandbox. Mock funcional. |
| M13 Operação interna | 🟡 | `/interno`, `ai_call_logs`, `audit_events` | Painel básico. Falta: amostragem semanal de qualidade da IA. |
| M14–M19 | ⬜ | — | Fase 2/3 do PRD (especialistas, console do contador, admin do método, integrações, decisões, benchmark). |

Requisitos funcionais cobertos por teste automatizado: RF01, RF02, RF03, RF05, RF06, RF07, RF08, RF09, RF10, RF13,
RF14, RF15, RF17 (`packages/*/test`, `packages/services/test/flow.test.ts`). RF04, RF11, RF12, RF16 e RF18 estão
implementados e cobertos parcialmente (falta teste de UI).

## 2. Antes de colocar o primeiro cliente real (bloqueantes)

| # | Item | Critério de aceite |
|---|---|---|
| P1.1 | Revisão do método pelo Methodology Owner | Trilhas, perguntas, pesos e regras de estágio revisados; versão do método incrementada; evals verdes. |
| P1.2 | Evals com IA real | `AI_PRIMARY_PROVIDER=anthropic pnpm evals` passa; amostra de 20 narrativas revisada por especialista; zero número inventado. |
| P1.3 | Extratos reais (anonimizados) | 2 extratos de cada um dos 5 bancos mais usados pelos design partners (OFX, CSV e PDF) em `packages/core/test/fixtures` e `services/pdf-extractor/tests`, todos conciliando. |
| P1.4 | WhatsApp em produção | Número verificado, templates de `docs/whatsapp-templates.md` aprovados, webhook com assinatura validada, ritual testado ponta a ponta com um número real, descadastro por SAIR funcionando. |
| P1.5 | Revisão jurídica | Termos de uso, política de privacidade, enquadramento na política da Meta, contrato de licença do método. Textos finais substituem os placeholders do onboarding. |
| P1.6 | Segurança | Pentest externo; CSP; rate limit por IP nas rotas de login e webhooks; segredos em cofre; `BEOS_APP_PASSWORD` forte; backups testados. |
| P1.7 | Observabilidade | Sentry/OpenTelemetry no web e no worker; alerta de erro e de custo de IA por conta. |
| P1.8 | Hospedagem | Região Brasil; Postgres gerenciado com backup; storage S3 criptografado; worker como processo separado. Ver `docs/deploy.md`. |

## 3. Melhorias do MVP (Fase 1, depois dos bloqueantes)

| # | Item | Notas |
|---|---|---|
| P2.1 | Ritual: perguntas e tarefas para colaboradores | Template `tarefa_atribuida` existe; falta enviar ao responsável e aceitar "FEITO". |
| P2.2 | Status de entrega do WhatsApp | Persistir `statuses` do webhook por `provider_message_id` (hoje ignorados). |
| P2.3 | Edição de metas e indicadores manuais no plano | Hoje a meta vem da regra da trilha; permitir ajuste com justificativa. |
| P2.4 | Testes de UI (Playwright) | Jornada: login → onboarding → Raio-X → diagnóstico → plano → ritual → Advisor. |
| P2.5 | Acessibilidade | Revisão WCAG 2.1 AA (contraste, foco, leitores de tela). |
| P2.6 | PDF gerado no servidor | Chromium headless no worker a partir das rotas `/app/relatorios/*`, enviado por e-mail no fechamento. |
| P2.7 | Fallback de PDF por IA | Para layouts não reconhecidos: extração estruturada via `extract_statement`, sempre conferida pela conciliação. |
| P2.8 | Upgrade de faixa | Quando o faturamento do Raio-X indicar outra faixa, sugerir troca de plano. |
| P2.9 | Layout do protótipo de interface | Tokens, fonte, logo e marca-texto na próxima ação já aplicados. Falta levar o layout de `docs/design/interface-ideal.html` para as telas: faixa das 12 semanas no Cockpit, prioridades como linhas com régua início/agora/meta, achados do Raio-X em três colunas, escada de estágios no Diagnóstico. |
| P2.10 | Nome da marca | "Tento" é o nome provisório, já aplicado em `apps/web/lib/brand.ts` e `public/manifest.webmanifest`. Pendente: busca no INPI (classes 9, 35, 42), análise de conflito com as marcas da 3tentos, domínio (tento.com.br está registrado por terceiro; tento.app.br e tento.ia.br estavam livres em 26/11/2026) e @ nas redes. Pode mudar: nunca escreva o nome fora de `brand.ts`. |

## 4. Fase 2 do PRD (não começar antes do gate da Fase 1)

Console do Contador Parceiro (M15), especialistas sob demanda com agenda e pagamento (M14), admin metodológico (M16),
Open Finance e XML de NF-e/NFS-e (M17), self-service qualificado, cobrança completa com Pix Automático.

## 5. Como medir os gates (PRD seção 24)

As métricas saem de consultas sobre `ritual_sessions`, `cycles`, `priorities`, `subscriptions` e `ai_call_logs`.
Sugestão: criar views `v_empresas_em_ritmo` (≥ 3 rituais respondidos nas últimas 4 semanas) e `v_ciclos_evolucao`
(ciclos fechados com `closing->>'evolved' = 'true'`) numa migração da Fase 1.
