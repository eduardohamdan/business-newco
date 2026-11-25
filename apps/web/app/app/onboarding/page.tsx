import { REVENUE_BANDS } from "@beos/core";
import { Button, Card, Field, Flash, inputCls, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { createCompany } from "../actions";

export const metadata = { title: "Cadastro da empresa" };

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const SECTORS = [
  ["saude", "Saúde e bem-estar"], ["servicos", "Serviços profissionais"], ["varejo", "Varejo"], ["alimentacao", "Alimentação"],
  ["educacao", "Educação"], ["industria", "Indústria"], ["construcao", "Construção"], ["tecnologia", "Tecnologia"], ["outro", "Outro"],
];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const s = await requireSession();
  const { erro, ok } = await searchParams;
  return (
    <>
      <PageTitle title="Conte sobre a empresa" subtitle="Leva uns 3 minutos. Você pode ajustar depois." />
      <Flash erro={erro} ok={ok} />
      <form action={createCompany} className="space-y-4">
        <Card title="Empresa">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CNPJ" hint="Aceita o formato numérico e o novo alfanumérico."><input name="cnpj" required className={inputCls} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Nome da empresa"><input name="tradeName" required className={inputCls} /></Field>
            <Field label="Faturamento anual">
              <select name="revenueBand" required className={inputCls} defaultValue="">
                <option value="" disabled>Selecione</option>
                {REVENUE_BANDS.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
              </select>
            </Field>
            <Field label="Setor">
              <select name="sector" className={inputCls}>{SECTORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
            <Field label="Pessoas trabalhando (com os sócios)"><input name="teamSize" type="number" min={1} required className={inputCls} /></Field>
            <Field label="Meses de operação"><input name="monthsActive" type="number" min={0} required className={inputCls} /></Field>
            <Field label="Cidade"><input name="city" className={inputCls} /></Field>
            <Field label="UF"><input name="uf" maxLength={2} className={inputCls} /></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="isMei" /> A empresa é MEI</label>
        </Card>
        <Card title="Seu ritual semanal">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seu nome"><input name="name" defaultValue={s.user.name ?? ""} className={inputCls} /></Field>
            <Field label="WhatsApp" hint="Para receber o ritual de 5 minutos."><input name="phone" defaultValue={s.user.phone_e164 ?? ""} className={inputCls} placeholder="(85) 99999-0000" /></Field>
            <Field label="Dia do ritual">
              <select name="ritualWeekday" defaultValue="1" className={inputCls}>{WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
            </Field>
            <Field label="Horário"><input name="ritualTime" type="time" defaultValue="08:30" className={inputCls} /></Field>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" name="whatsappOptIn" defaultChecked />
            <span>Quero receber o ritual, lembretes e alertas do meu plano pelo WhatsApp. Posso sair a qualquer momento respondendo SAIR.</span>
          </label>
        </Card>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" required />
          <span>Li e aceito os termos de uso e a política de privacidade. Entendo que o sistema não substitui contador, advogado ou consultor de crédito.</span>
        </label>
        <Button>Continuar para o Raio-X</Button>
      </form>
    </>
  );
}
