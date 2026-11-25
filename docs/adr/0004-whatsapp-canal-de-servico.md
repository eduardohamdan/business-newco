# ADR 0004 — WhatsApp como canal de serviço

**Status:** aceita

**Contexto:** desde 15/01/2026 a Meta proíbe chatbots de IA de uso geral na WhatsApp Business Platform; automações ligadas
ao serviço da própria empresa continuam permitidas.

**Decisão:** no WhatsApp só existem fluxos estruturados (ritual de até 3 perguntas, lembretes, alertas, tarefas e
descadastro por SAIR). Perguntas abertas são direcionadas ao Advisor no app. A camada `MessagingChannel` permite trocar de
canal se a política mudar. Enquadramento jurídico deve ser revisado antes do lançamento.
