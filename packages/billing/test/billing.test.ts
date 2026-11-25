import { describe, expect, it } from "vitest";
import { asaasGateway, mockGateway, priceFor } from "../src";

describe("cobrança", () => {
  it("preço anual tem 15% de desconto aproximado", () => {
    expect(priceFor("pro", "monthly").valueCents).toBe(39_700);
    expect(priceFor("pro", "annual").valueCents).toBe(33_700 * 12);
  });
  it("webhook do Asaas exige o token e mapeia eventos", () => {
    const gw = asaasGateway({ apiUrl: "x", apiKey: "k", webhookToken: "segredo" });
    const body = { event: "PAYMENT_CONFIRMED", payment: { externalReference: "org-1", subscription: "sub_1", dueDate: "2026-12-01" } };
    expect(gw.parseWebhook(new Headers({ "asaas-access-token": "errado" }), body)).toBeNull();
    expect(gw.parseWebhook(new Headers({ "asaas-access-token": "segredo" }), body)).toMatchObject({ type: "activated", organizationId: "org-1", subscriptionId: "sub_1" });
    expect(gw.parseWebhook(new Headers({ "asaas-access-token": "segredo" }), { event: "OUTRO" })?.type).toBe("ignored");
  });
  it("mock gera link de simulação", async () => {
    const r = await mockGateway("http://localhost:3000").createCheckout({ organizationId: "12345678-aaaa", cnpj: "x", companyName: "x", email: "x", plan: "start", cycle: "monthly" });
    expect(r.checkoutUrl).toContain("/app/assinatura?simular=");
  });
});
