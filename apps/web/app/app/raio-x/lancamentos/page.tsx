import { formatBRL } from "@beos/core";
import { getMethod } from "@beos/method";
import { repo, withTenant } from "@beos/db";
import { Button, Card, Empty, Flash, PageTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { recategorizeAction } from "../../actions";

export const metadata = { title: "Revisar lançamentos" };

export default async function Lancamentos({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireOrg();
  const { ok, erro } = await searchParams;
  const txns = await withTenant(s.orgId, async (db) => {
    const all = await repo.listTransactions(db, { limit: 5000 });
    return all.filter((t) => t.needs_review || t.confidence < 0.7 || t.personal_suspect).slice(-200).reverse();
  });
  const cats = getMethod().categories;
  return (
    <>
      <PageTitle title="Revisar lançamentos" subtitle="Corrija o que o sistema não teve certeza. Cada correção vira regra para os próximos extratos." />
      <Flash ok={ok} erro={erro} />
      {!txns.length ? (
        <Empty title="Nada para revisar">Todos os lançamentos foram classificados com segurança.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-pauta">
            {txns.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{t.description}</div>
                  <div className="text-xs text-grafite-3">{formatDate(t.posted_at)} · <span className={t.amount_cents < 0 ? "text-atraso" : "text-ritmo"}>{formatBRL(t.amount_cents)}</span>{t.personal_suspect && " · possível gasto pessoal"}</div>
                </div>
                <form action={recategorizeAction} className="flex gap-2">
                  <input type="hidden" name="transactionId" value={t.id} />
                  <select name="categoryCode" defaultValue={t.category_code} className="rounded-lg border border-pauta-forte px-2 py-1.5 text-sm">
                    {cats.filter((c) => c.direction === "both" || (c.direction === "inflow") === t.amount_cents >= 0).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                  <Button variant="secondary">Salvar</Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
