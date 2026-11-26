import { Card, PageTitle } from "@/components/ui";

export const metadata = { title: "Relatórios" };

const R = [
  { tipo: "raiox", t: "Raio-X de Caixa", d: "Entradas, saídas, indicadores e alertas do período." },
  { tipo: "diagnostico", t: "Diagnóstico", d: "Estágio, maturidade, painel, achados e prioridades." },
  { tipo: "plano", t: "Plano de 90 dias", d: "Prioridades, marcos, ações e metas do ciclo ativo." },
  { tipo: "fechamento", t: "Fechamento do ciclo", d: "Resultado do último ciclo fechado e sugestões para o próximo." },
];

export default function Relatorios() {
  return (
    <>
      <PageTitle title="Relatórios" subtitle="Abra o relatório e use “Imprimir → Salvar como PDF” no navegador." />
      <div className="grid gap-4 sm:grid-cols-2">
        {R.map((r) => (
          <a key={r.tipo} href={`/app/relatorios/${r.tipo}`}>
            <Card title={r.t} className="h-full hover:border-tinta"><p className="text-sm text-grafite-2">{r.d}</p></Card>
          </a>
        ))}
      </div>
    </>
  );
}
