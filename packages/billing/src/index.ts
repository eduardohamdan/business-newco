import { timingSafeEqual } from "node:crypto";
import { PLANS, type PlanCode } from "@beos/core";

/**
 * Cobrança por gateway com checkout hospedado (nada de billing próprio no MVP — PRD 13.1).
 * Interface reversível: Asaas implementado; Iugu, Pagar.me ou Stripe entram implementando PaymentGateway.
 */
export interface CheckoutInput {
  organizationId: string;
  cnpj: string;
  companyName: string;
  email: string;
  plan: PlanCode;
  cycle: "monthly" | "annual";
}

export interface CheckoutResult {
  customerId: string;
  subscriptionId: string;
  checkoutUrl: string;
}

export type BillingEventType = "activated" | "payment_received" | "past_due" | "canceled" | "ignored";

export interface BillingEvent {
  type: BillingEventType;
  organizationId?: string;
  subscriptionId?: string;
  periodEnd?: string;
  raw: string;
}

export interface PaymentGateway {
  name: string;
  createCheckout(i: CheckoutInput): Promise<CheckoutResult>;
  cancel(subscriptionId: string): Promise<void>;
  /** Valida a autenticidade e converte o webhook. Retorna null se a autenticação falhar. */
  parseWebhook(headers: Headers, body: any): BillingEvent | null;
}

export function priceFor(plan: PlanCode, cycle: "monthly" | "annual"): { valueCents: number; description: string } {
  const p = PLANS.find((x) => x.code === plan)!;
  return cycle === "monthly"
    ? { valueCents: p.monthlyCents, description: `Plano ${p.name} — mensal` }
    : { valueCents: p.annualMonthlyCents * 12, description: `Plano ${p.name} — anual` };
}

// ---------------------------------------------------------------------------
// Asaas (https://docs.asaas.com) — billingType UNDEFINED deixa o cliente escolher Pix, boleto ou cartão na fatura.
// Pix Automático: habilitar quando a modalidade estiver disponível na conta do gateway (ver docs/integracoes.md).
// ---------------------------------------------------------------------------
export function asaasGateway(cfg: { apiUrl: string; apiKey: string; webhookToken: string }): PaymentGateway {
  async function api(path: string, init: { method?: string; body?: unknown } = {}) {
    const res = await fetch(`${cfg.apiUrl}${path}`, {
      method: init.method ?? "GET",
      headers: { access_token: cfg.apiKey, "content-type": "application/json", "user-agent": "business-evolution-os" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Asaas ${res.status}: ${j?.errors?.[0]?.description ?? "erro"}`);
    return j;
  }
  return {
    name: "asaas",
    async createCheckout(i) {
      const customer = await api("/customers", { method: "POST", body: { name: i.companyName, cpfCnpj: i.cnpj, email: i.email, externalReference: i.organizationId } });
      const price = priceFor(i.plan, i.cycle);
      const today = new Date().toISOString().slice(0, 10);
      const sub = await api("/subscriptions", {
        method: "POST",
        body: {
          customer: customer.id,
          billingType: "UNDEFINED",
          value: price.valueCents / 100,
          nextDueDate: today,
          cycle: i.cycle === "monthly" ? "MONTHLY" : "YEARLY",
          description: price.description,
          externalReference: i.organizationId,
        },
      });
      const payments = await api(`/subscriptions/${sub.id}/payments`);
      const url = payments?.data?.[0]?.invoiceUrl;
      if (!url) throw new Error("Asaas não retornou a fatura da assinatura.");
      return { customerId: customer.id, subscriptionId: sub.id, checkoutUrl: url };
    },
    async cancel(subscriptionId) {
      await api(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    },
    parseWebhook(headers, body) {
      const token = headers.get("asaas-access-token") ?? "";
      const a = Buffer.from(token);
      const b = Buffer.from(cfg.webhookToken);
      if (!cfg.webhookToken || a.length !== b.length || !timingSafeEqual(a, b)) return null;
      const ev = String(body?.event ?? "");
      const payment = body?.payment ?? {};
      const map: Record<string, BillingEventType> = {
        PAYMENT_CONFIRMED: "activated",
        PAYMENT_RECEIVED: "payment_received",
        PAYMENT_OVERDUE: "past_due",
        SUBSCRIPTION_DELETED: "canceled",
        SUBSCRIPTION_INACTIVATED: "canceled",
      };
      return {
        type: map[ev] ?? "ignored",
        organizationId: payment.externalReference ?? body?.subscription?.externalReference,
        subscriptionId: payment.subscription ?? body?.subscription?.id,
        periodEnd: payment.dueDate,
        raw: ev,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock: em desenvolvimento a "fatura" é uma página do próprio app que simula o pagamento.
// ---------------------------------------------------------------------------
export function mockGateway(appUrl: string): PaymentGateway {
  return {
    name: "mock",
    async createCheckout(i) {
      const sub = `mock-sub-${i.organizationId.slice(0, 8)}`;
      return { customerId: `mock-cus-${i.organizationId.slice(0, 8)}`, subscriptionId: sub, checkoutUrl: `${appUrl}/app/assinatura?simular=${sub}` };
    },
    async cancel() {},
    parseWebhook(headers, body) {
      if (headers.get("x-mock-billing") !== "1") return null;
      return { type: body.type, organizationId: body.organizationId, subscriptionId: body.subscriptionId, periodEnd: body.periodEnd, raw: "mock" };
    },
  };
}

export function gatewayFromEnv(env: NodeJS.ProcessEnv = process.env): PaymentGateway {
  if (env.BILLING_PROVIDER === "asaas" && env.ASAAS_API_KEY)
    return asaasGateway({ apiUrl: env.ASAAS_API_URL ?? "https://api-sandbox.asaas.com/v3", apiKey: env.ASAAS_API_KEY, webhookToken: env.ASAAS_WEBHOOK_TOKEN ?? "" });
  return mockGateway(env.APP_URL ?? "http://localhost:3000");
}
