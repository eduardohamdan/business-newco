import { Button, Field, Flash, inputCls } from "@/components/ui";
import { sendCode } from "./actions";

export const metadata = { title: "Entrar" };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold text-grafite">Entrar</h1>
      <p className="mt-1 text-sm text-grafite-2">Sem senha: enviamos um código de 6 dígitos para o seu e-mail.</p>
      <div className="mt-6">
        <Flash erro={erro} />
        <form action={sendCode} className="space-y-4">
          <Field label="E-mail">
            <input name="email" type="email" required autoComplete="email" className={inputCls} placeholder="voce@empresa.com.br" />
          </Field>
          <Button className="w-full">Receber código</Button>
        </form>
      </div>
    </main>
  );
}
