import { Button, Field, Flash, inputCls } from "@/components/ui";
import { checkCode } from "../actions";

export const metadata = { title: "Código de acesso" };

export default async function Codigo({ searchParams }: { searchParams: Promise<{ email?: string; erro?: string }> }) {
  const { email = "", erro } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold text-navy">Digite o código</h1>
      <p className="mt-1 text-sm text-slate-600">Enviamos para <strong>{email}</strong>. Ele vale por 10 minutos.</p>
      <div className="mt-6">
        <Flash erro={erro} />
        <form action={checkCode} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <Field label="Código">
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className={`${inputCls} text-center text-2xl tracking-[0.5em]`} />
          </Field>
          <Button className="w-full">Entrar</Button>
        </form>
        <a href="/entrar" className="mt-4 block text-center text-sm text-brand">Usar outro e-mail</a>
      </div>
    </main>
  );
}
