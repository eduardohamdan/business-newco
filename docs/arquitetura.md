# Arquitetura

## Visão em camadas

```
Canais         Web/PWA (Next.js)  ·  WhatsApp Cloud API  ·  E-mail
API/Casos uso  apps/web (server actions, webhooks)  →  packages/services
Domínio        packages/core (determinístico, sem I/O)  +  packages/method (conteúdo do método)
IA             packages/ai (gateway → Anthropic | OpenAI | mock), guardas, prompts versionados
Dados          PostgreSQL 16 com RLS forçado (papel beos_app)  ·  storage (local | S3)  ·  pg-boss (filas)
Assíncrono     apps/worker: statement.process, ritual.tick (15 min), ritual.followup (1 h), alerts.daily
Externos       pdf-extractor (Python) · gateway de pagamento · STT · e-mail
```

## Fluxos principais

### Raio-X de Caixa (RF02)
`uploadStatement` → arquivo no storage (`orgs/{orgId}/statements/{sha256}.{ext}`) → `processStatement`:
1. parsing (OFX/CSV em `core`; PDF via `pdf-extractor`);
2. **conciliação** saldo inicial + movimentos = saldo final (divergência bloqueia o documento);
3. LGPD: CPF de terceiros mascarado, contraparte vira hash com o sal da empresa;
4. categorização: regras da empresa → palavras-chave do método → IA (só o que sobrou, com teto de custo);
5. deduplicação por hash (reenviar o mesmo extrato não duplica);
6. `rebuildRaioX`: indicadores determinísticos dos últimos 6 meses + narrativa (IA com guarda numérica).

### Diagnóstico e plano (RF05–RF09)
`saveAssessment` (respostas válidas e visíveis) → `runDiagnosis`: `scoreMaturity` → `diagnose` (estágio por regra,
cobertura, confiança, painel, achados) → `prioritize` (elegibilidade por estágio/pré-requisitos, aderência por gatilhos,
diversidade, máximo 3) → narrativa e dicas (IA) → `approvePlan` → `buildPlan` (metas pelas regras da trilha, marcos e
ações com datas) → `createCycleFromPlan` (transação única).

### Ritual semanal (RF10)
Worker a cada 15 min: `dueRituals` (dia/hora no fuso da empresa) → `sendRitual` (template aprovado no WhatsApp, ou
e-mail) → respostas chegam no webhook → `handleWhatsAppEvent` conduz até 3 perguntas (regras primeiro, IA só para texto
que as regras não entendem; áudio é transcrito) → `submitRitual` aplica: ações, número da semana (fixa a meta se
faltava baseline), risco e próxima ação. Lembrete em 24 h; após 72 h vira "missed" (alimenta o alerta).

### Advisor (RF13)
`askAdvisor`: contexto mínimo da empresa → recusa determinística fora do escopo → plano (intenção + ferramenta) →
calculadora do `core` → resposta com guarda numérica → registro em `recommendations`.

## Multi-tenancy
- Tabelas de negócio com `organization_id`, RLS **forçado** e política `organization_id = app_org_id()`.
- `withTenant(orgId)` abre transação e define `app.org_id`. `withSystem` só para identidade e funções `security definer`.
- `audit_events` é append-only para o papel da aplicação.
- Testes: `packages/db/test/rls.test.ts`.

## Decisões registradas
Ver `docs/adr/`.
