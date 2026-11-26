import { notFound } from "next/navigation";
import { identity, repo, withSystem, withTenant } from "@beos/db";
import { allOrganizationIds } from "@beos/services";
import { Card, PageTitle } from "@/components/ui";
import { STAGE_LABEL } from "@/lib/format";
import { isOperator, requireSession } from "@/lib/session";

export const metadata = { title: "Operação interna" };

/** Painel da operação (P06): saúde das contas e custo de IA. Todo acesso é auditado. */
export default async function Interno() {
  const s = await requireSession();
  if (!isOperator(s.user)) notFound();
  const ids = await allOrganizationIds();
  const rows = [];
  for (const id of ids.slice(0, 200)) {
    rows.push(
      await withTenant(id, async (db) => {
        await repo.audit(db, s.user.id, "operator.viewed");
        const org = await repo.getOrganization(db);
        const cycle = await repo.getActiveCycle(db);
        const cost = await repo.aiCostThisMonthCents(db);
        const stats = cycle ? await repo.ritualStats(db, cycle.cycle.id) : null;
        return { id, name: org.trade_name, stage: org.stage, cycle: !!cycle, rituals: stats, cost };
      }),
    );
  }
  const users = await withSystem(async (db) => (await db.query("select count(*)::int n from users")).rows[0].n as number);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <PageTitle title="Operação interna" subtitle={`${rows.length} empresas · ${users} usuários`} />
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-grafite-3"><th>Empresa</th><th>Estágio</th><th>Ciclo</th><th>Rituais (resp./env.)</th><th>IA no mês</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-pauta">
                <td className="py-1.5">{r.name}</td><td>{STAGE_LABEL[r.stage ?? ""] ?? "—"}</td><td>{r.cycle ? "Ativo" : "—"}</td>
                <td>{r.rituals ? `${r.rituals.answered}/${r.rituals.sent}` : "—"}</td><td>R$ {(r.cost / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
