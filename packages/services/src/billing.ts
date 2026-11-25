import { gatewayFromEnv, type BillingEvent } from "@beos/billing";
import { planForBand, type RevenueBand } from "@beos/core";
import { repo, withTenant } from "@beos/db";

export async function startCheckout(orgId: string, user: { id: string; email: string }, cycle: "monthly" | "annual") {
  const gw = gatewayFromEnv();
  const org = await withTenant(orgId, (db) => repo.getOrganization(db));
  const plan = planForBand(org.revenue_band as RevenueBand);
  if (!plan) throw new Error("Faixa de faturamento fora do atendimento da plataforma.");
  const r = await gw.createCheckout({ organizationId: orgId, cnpj: org.cnpj, companyName: org.legal_name ?? org.trade_name, email: user.email, plan: plan.code, cycle });
  await withTenant(orgId, async (db) => {
    await repo.upsertSubscription(db, { plan_code: plan.code, billing_cycle: cycle, status: "pending", provider: gw.name, provider_customer_id: r.customerId, provider_subscription_id: r.subscriptionId, checkout_url: r.checkoutUrl });
    await repo.audit(db, user.id, "billing.checkout_started", plan.code, { cycle });
  });
  return r.checkoutUrl;
}

export async function applyBillingEvent(ev: BillingEvent) {
  if (!ev.organizationId || ev.type === "ignored") return;
  await withTenant(ev.organizationId, async (db) => {
    const sub = await repo.getSubscription(db);
    if (!sub) return;
    const status = ev.type === "activated" || ev.type === "payment_received" ? "active" : ev.type === "past_due" ? "past_due" : "canceled";
    await repo.upsertSubscription(db, { ...sub, status, current_period_end: ev.periodEnd ?? sub.current_period_end });
    await repo.audit(db, null, `billing.${ev.type}`, ev.subscriptionId);
  });
}

export async function cancelSubscription(orgId: string, userId: string) {
  const sub = await withTenant(orgId, (db) => repo.getSubscription(db));
  if (!sub) return;
  if (sub.provider_subscription_id) await gatewayFromEnv().cancel(sub.provider_subscription_id);
  await withTenant(orgId, async (db) => {
    await repo.upsertSubscription(db, { ...sub, status: "canceled" });
    await repo.audit(db, userId, "billing.canceled");
  });
}
