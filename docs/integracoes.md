# Integrações

| Integração | Fase | Estado | Variáveis |
|---|---|---|---|
| Anthropic (LLM primário) | MVP | 🟡 código pronto, validar com evals | `AI_PRIMARY_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL_*_ANTHROPIC` |
| OpenAI (LLM de fallback e transcrição) | MVP | 🟡 | `AI_FALLBACK_PROVIDER=openai`, `OPENAI_API_KEY`, `STT_PROVIDER=openai` |
| WhatsApp Cloud API | MVP | 🟡 | ver `whatsapp-templates.md` |
| E-mail (Resend) | MVP | 🟡 | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` |
| Asaas (cobrança) | MVP | 🟡 | `BILLING_PROVIDER=asaas`, `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`; webhook em `/api/webhooks/billing` |
| S3 (arquivos) | MVP | 🟡 | `STORAGE_DRIVER=s3`, `S3_*` |
| Open Finance (agregador autorizado) | F2 | ⬜ | consentimento em `consents.kind='open_finance'` |
| XML de NF-e/NFS-e | F2 | ⬜ | |
| ERPs de PME / sistemas contábeis | F3 | ⬜ | |

Preços de modelos mudam: mantenha `AI_PRICE_*` e `USD_BRL` alinhados à tabela vigente do fornecedor, senão o teto de custo
por plano fica errado. Confirme também os nomes de modelo vigentes antes de ir para produção.

**Pix Automático:** confirmar na prova técnica se o gateway escolhido expõe a modalidade via API e lembrar que a empresa
recebedora precisa de mais de 6 meses de atividade.
