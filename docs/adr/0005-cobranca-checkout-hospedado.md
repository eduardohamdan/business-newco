# ADR 0005 — Cobrança por checkout hospedado

**Status:** aceita

**Decisão:** nada de billing próprio no MVP. Assinatura criada no gateway (Asaas implementado) e o cliente paga na fatura
hospedada (Pix, boleto ou cartão). Webhook autenticado atualiza `subscriptions`. Interface `PaymentGateway` permite trocar
de fornecedor.

**Atenção:** Pix Automático exige que a empresa que cobra tenha mais de 6 meses de atividade — abrir o CNPJ da NewCo cedo.
A disponibilidade da modalidade na API do gateway escolhido precisa ser confirmada na prova técnica.
