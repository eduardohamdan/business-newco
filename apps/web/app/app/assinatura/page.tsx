import { Button, Card, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/session";
import { simulatePayment } from "../actions";

export const metadata = { title: "Assinatura" };

/** Só em desenvolvimento (BILLING_PROVIDER=mock): simula a página de pagamento do gateway. */
export default async function Assinatura({ searchParams }: { searchParams: Promise<{ simular?: string }> }) {
  await requireOrg();
  const { simular } = await searchParams;
  return (
    <>
      <PageTitle title="Pagamento (simulação)" subtitle="Em produção, esta etapa acontece na página segura do gateway de pagamento." />
      <Card>
        <form action={simulatePayment}>
          <input type="hidden" name="subscriptionId" value={simular ?? ""} />
          <Button>Simular pagamento aprovado</Button>
        </form>
      </Card>
    </>
  );
}
