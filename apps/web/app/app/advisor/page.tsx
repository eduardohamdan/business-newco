import { repo, withTenant } from "@beos/db";
import { Badge, Button, Card, Flash, inputCls, PageTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { advisorFeedback, askAdvisorAction } from "../actions";

export const metadata = { title: "Advisor" };

const EXEMPLOS = ["Quanto devo cobrar se meu custo é R$ 50, imposto 6% e quero 20% de margem?", "Qual meu ponto de equilíbrio com custo fixo de 20000 e margem de 40%?", "Como explico o reajuste de preço para os clientes?"];

export default async function Advisor({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireOrg();
  const { ok, erro } = await searchParams;
  const items = await withTenant(s.orgId, (db) => repo.listRecommendations(db, "advisor", 20));
  return (
    <>
      <PageTitle title="Advisor" subtitle="Pergunte sobre a sua empresa, peça uma conta ou uma orientação ligada ao plano. Números sempre vêm dos seus dados ou de uma calculadora." />
      <Flash ok={ok} erro={erro} />
      <Card className="mb-4">
        <form action={askAdvisorAction} className="space-y-3">
          <textarea name="question" required rows={3} maxLength={1000} className={inputCls} placeholder={EXEMPLOS[0]} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Não oriento sobre questões jurídicas, tributárias individuais, crédito ou investimentos.</p>
            <Button>Perguntar</Button>
          </div>
        </form>
      </Card>
      <div className="space-y-3">
        {items.map((r) => (
          <Card key={r.id}>
            <p className="text-sm font-medium text-navy">{r.question}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.content}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>{formatDate(r.created_at)} · {(r.sources ?? []).map((x: any) => x.label).join(" · ")}</span>
              {r.status === "blocked" ? <Badge tone="amber">Fora do escopo</Badge> : r.status === "shown" ? (
                <form action={advisorFeedback} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button name="status" value="accepted" className="text-brand">Útil</button>
                  <button name="status" value="rejected" className="text-slate-500">Não ajudou</button>
                </form>
              ) : <Badge tone={r.status === "accepted" ? "green" : "slate"}>{r.status === "accepted" ? "Útil" : "Não ajudou"}</Badge>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
