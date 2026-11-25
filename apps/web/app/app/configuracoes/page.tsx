import { planForBand, formatBRL, type RevenueBand } from "@beos/core";
import { identity, repo, withSystem, withTenant } from "@beos/db";
import { Badge, Button, Card, Field, Flash, inputCls, PageTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireOrg } from "@/lib/session";
import { cancelSubscriptionAction, checkoutAction, deleteCompanyAction, inviteMember, saveSettings } from "../actions";

export const metadata = { title: "Configurações" };
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireOrg();
  const { ok, erro } = await searchParams;
  const { org, sub, optIn } = await withTenant(s.orgId, async (db) => ({ org: await repo.getOrganization(db), sub: await repo.getSubscription(db), optIn: await repo.hasConsent(db, "whatsapp_opt_in") }));
  const members = await withSystem((db) => identity.listMembers(db, s.orgId));
  const plan = planForBand(org.revenue_band as RevenueBand);
  return (
    <>
      <PageTitle title="Configurações" />
      <Flash ok={ok} erro={erro} />
      <div className="space-y-4">
        <Card title="Ritual e WhatsApp">
          <form action={saveSettings} className="grid gap-4 sm:grid-cols-2">
            <Field label="Seu nome"><input name="name" defaultValue={s.user.name ?? ""} className={inputCls} /></Field>
            <Field label="WhatsApp"><input name="phone" defaultValue={s.user.phone_e164 ?? ""} className={inputCls} /></Field>
            <Field label="Dia do ritual"><select name="ritualWeekday" defaultValue={org.ritual_weekday} className={inputCls}>{WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Field>
            <Field label="Horário"><input type="time" name="ritualTime" defaultValue={org.ritual_time.slice(0, 5)} className={inputCls} /></Field>
            <Field label="Canal alternativo (sem WhatsApp)"><select name="ritualChannel" defaultValue={org.ritual_channel === "whatsapp" ? "email" : org.ritual_channel} className={inputCls}><option value="email">E-mail</option><option value="web">Só no app</option></select></Field>
            <Field label="Pessoas na equipe"><input type="number" name="teamSize" min={1} defaultValue={org.team_size} className={inputCls} /></Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="whatsappOptIn" defaultChecked={optIn} /> Receber ritual, lembretes e alertas pelo WhatsApp</label>
            <div className="sm:col-span-2"><Button>Salvar</Button></div>
          </form>
        </Card>
        <Card title="Equipe">
          <ul className="mb-3 divide-y divide-slate-100 text-sm">{members.map((m) => <li key={m.id} className="flex justify-between py-2"><span>{m.name ?? m.email} <span className="text-slate-400">{m.email}</span></span><Badge>{m.role === "owner" ? "Dono" : m.role === "manager" ? "Gestor" : "Colaborador"}</Badge></li>)}</ul>
          <form action={inviteMember} className="flex flex-col gap-2 sm:flex-row">
            <input name="email" type="email" required placeholder="email@empresa.com.br" className={inputCls} />
            <select name="role" className="rounded-xl border border-slate-300 px-2 text-sm"><option value="member">Colaborador</option><option value="manager">Gestor</option></select>
            <Button variant="secondary">Adicionar</Button>
          </form>
        </Card>
        <Card title="Assinatura">
          {plan ? (
            <>
              <p className="text-sm">Plano <strong>{plan.name}</strong> (pela faixa de faturamento): {formatBRL(plan.monthlyCents)}/mês ou {formatBRL(plan.annualMonthlyCents)}/mês no anual.</p>
              {sub && <p className="mt-1 text-sm">Situação: <Badge tone={sub.status === "active" ? "green" : sub.status === "past_due" ? "red" : "slate"}>{sub.status === "active" ? "Ativa" : sub.status === "pending" ? "Aguardando pagamento" : sub.status === "past_due" ? "Em atraso" : "Cancelada"}</Badge>{sub.current_period_end && ` · até ${formatDate(sub.current_period_end)}`}</p>}
              {sub?.status !== "active" && (
                <form action={checkoutAction} className="mt-3 flex gap-2">
                  <Button name="cycle" value="annual">Assinar anual (15% off)</Button>
                  <Button name="cycle" value="monthly" variant="secondary">Assinar mensal</Button>
                </form>
              )}
              {sub?.status === "active" && s.role === "owner" && <form action={cancelSubscriptionAction} className="mt-3"><Button variant="secondary">Cancelar assinatura</Button></form>}
            </>
          ) : <p className="text-sm">Faixa de faturamento fora do atendimento da plataforma.</p>}
        </Card>
        <Card title="Seus dados (LGPD)">
          <p className="text-sm text-slate-600">Baixe uma cópia completa dos dados da empresa ou exclua a conta. A exclusão é definitiva.</p>
          <a href="/api/export" className="mt-3 inline-block text-sm font-semibold text-brand">Baixar meus dados (JSON)</a>
          {s.role === "owner" && (
            <form action={deleteCompanyAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input name="confirmCnpj" required placeholder="Digite o CNPJ para confirmar" className={inputCls} />
              <Button variant="danger">Excluir empresa e dados</Button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
