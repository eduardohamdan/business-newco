import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-navy text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16 sm:py-24">
        <span className="text-xs font-semibold tracking-[0.25em] text-emerald-200">SISTEMA DE EVOLUÇÃO EMPRESARIAL</span>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Em 15 minutos você sabe onde sua empresa está. Em 5 minutos por semana, você faz ela evoluir.
        </h1>
        <p className="text-lg text-slate-200">
          Envie o extrato da conta da empresa e receba um Raio-X de Caixa. Depois, escolha até 3 prioridades para os próximos 90 dias e
          receba um ritual semanal no WhatsApp para manter o ritmo.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/entrar" className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-emerald-700">
            Fazer meu Raio-X
          </Link>
          <Link href="/entrar" className="rounded-xl px-5 py-3 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
            Já tenho conta
          </Link>
        </div>
        <ul className="grid gap-4 pt-6 text-sm text-slate-200 sm:grid-cols-3">
          <li><strong className="block text-white">Caixa primeiro</strong>O extrato vira um retrato do negócio, sem planilha.</li>
          <li><strong className="block text-white">3 prioridades</strong>Trilhas prontas com passos, modelos e metas.</li>
          <li><strong className="block text-white">Ritual semanal</strong>Alguém que lembra e cobra, no WhatsApp.</li>
        </ul>
      </div>
    </main>
  );
}
