"use server";
import { redirect } from "next/navigation";
import { requestLoginCode, verifyLoginCode } from "@beos/services";
import { requestMeta, setSessionCookie } from "@/lib/session";

export async function sendCode(form: FormData) {
  const email = String(form.get("email") ?? "");
  const r = await requestLoginCode(email);
  if (!r.ok) redirect(`/entrar?erro=${encodeURIComponent(r.error)}`);
  redirect(`/entrar/codigo?email=${encodeURIComponent(email.trim().toLowerCase())}`);
}

export async function checkCode(form: FormData) {
  const email = String(form.get("email") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const r = await verifyLoginCode(email, code, await requestMeta());
  if (!r) redirect(`/entrar/codigo?email=${encodeURIComponent(email)}&erro=${encodeURIComponent("Código inválido ou expirado.")}`);
  await setSessionCookie(r.token);
  redirect("/app");
}
