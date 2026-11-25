import { createGateway, type Gateway } from "@beos/ai";
import { planForBand, RAIO_X_AI_BUDGET_CENTS, type RevenueBand } from "@beos/core";
import { repo, withTenant } from "@beos/db";

/** Gateway de IA da organização: registra custo/guarda em ai_call_logs e aplica o teto do plano. */
export async function aiFor(orgId: string): Promise<Gateway> {
  const { spent, band } = await withTenant(orgId, async (db) => ({
    spent: await repo.aiCostThisMonthCents(db),
    band: (await repo.getOrganization(db)).revenue_band as RevenueBand,
  }));
  const limit = planForBand(band)?.aiBudgetCents ?? RAIO_X_AI_BUDGET_CENTS;
  return createGateway({
    budget: { spentCents: spent, limitCents: limit },
    log: (e) => withTenant(orgId, (db) => repo.logAiCall(db, e)).catch((err) => console.error("[ai] falha ao registrar chamada", err)),
  });
}
