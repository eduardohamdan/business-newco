# Templates do WhatsApp (cadastrar na Meta)

Idioma: `pt_BR`. Categoria: **Utility** (exceto o código de acesso: **Authentication**).
Os nomes e corpos precisam ser idênticos a `packages/channels/src/templates.ts`.

| Nome | Categoria | Corpo | Botões |
|---|---|---|---|
| `ritual_semanal_v1` | Utility | Oi, {{1}}! Hora do ritual da semana {{2}} ({{3}} min). Primeira pergunta: você conseguiu fazer "{{4}}"? | Feito · Em parte · Não deu |
| `ritual_lembrete_v1` | Utility | {{1}}, seu ritual da semana ainda está em aberto. Leva 5 minutos: {{2}} | — |
| `alerta_desvio_v1` | Utility | Atenção, {{1}}: {{2}} Veja o painel: {{3}} | — |
| `tarefa_atribuida_v1` | Utility | Oi, {{1}}! {{2}} te passou uma tarefa: "{{3}}" até {{4}}. Responda FEITO quando concluir. | Feito |
| `codigo_acesso_v1` | Authentication | Seu código de acesso é {{1}}. Ele expira em 10 minutos. Não compartilhe. | — |

## Regras de uso
- Mensagem proativa (fora da janela de 24 h) **só** por template aprovado.
- Dentro da janela, o ritual segue com texto e botões interativos (até 3).
- Opt-in explícito no onboarding (registrado em `consents`); "SAIR" ou "PARAR" revogam e o ritual passa para e-mail.
- Sem conversa aberta com IA no WhatsApp (ADR 0004).

## Configuração
`WHATSAPP_PROVIDER=cloud`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN`. Webhook: `https://SEU_DOMINIO/api/webhooks/whatsapp` (campos `messages`).
