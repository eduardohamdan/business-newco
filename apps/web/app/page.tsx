import Link from "next/link";
import { BrandSymbol } from "@/components/Logo";
import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <main className="min-h-screen bg-grafite text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16 sm:py-24">
        <span className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <BrandSymbol size={32} className="text-white" />
          {BRAND.shortName}
        </span>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Em 15 minutos você sabe onde sua empresa está. Em 5 minutos por semana, você faz ela evoluir.
        </h1>
        <p className="text-lg text-white/80">
          Envie o extrato da conta da empresa e receba um Raio-X de Caixa. Depois, escolha até 3 prioridades para os próximos 90 dias e
          receba um ritual semanal no WhatsApp para manter o ritmo.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/entrar" className="rounded-xl bg-tinta px-5 py-3 font-semibold text-white hover:bg-tinta-escura">
            Fazer meu Raio-X
          </Link>
          <Link href="/entrar" className="rounded-xl px-5 py-3 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
            Já tenho conta
          </Link>
        </div>
        <ul className="grid gap-4 pt-6 text-sm text-white/80 sm:grid-cols-3">
          <li><strong className="block text-white">Caixa primeiro</strong>O extrato vira um retrato do negócio, sem planilha.</li>
          <li><strong className="block text-white">3 prioridades</strong>Trilhas prontas com passos, modelos e metas.</li>
          <li><strong className="block text-white">Ritual semanal</strong>Alguém que lembra e cobra, no WhatsApp.</li>
        </ul>
      </div>
    </main>
  );
}
