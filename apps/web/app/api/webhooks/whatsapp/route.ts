import { loadWhatsAppConfig, parseWebhook, verifySignature, verifyWebhookChallenge } from "@beos/channels";
import { handleWhatsAppEvent } from "@beos/services";

export const dynamic = "force-dynamic";

/** Verificação do webhook pela Meta. */
export async function GET(req: Request) {
  const challenge = verifyWebhookChallenge(new URL(req.url).searchParams, loadWhatsAppConfig().verifyToken);
  return challenge ? new Response(challenge) : new Response("Forbidden", { status: 403 });
}

/** Mensagens recebidas: assinatura validada antes de qualquer processamento. */
export async function POST(req: Request) {
  const raw = await req.text();
  const cfg = loadWhatsAppConfig();
  if (process.env.WHATSAPP_PROVIDER === "cloud" && !verifySignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  for (const ev of parseWebhook(body)) {
    try {
      await handleWhatsAppEvent(ev);
    } catch (e) {
      console.error("[whatsapp] falha ao processar evento", e);
    }
  }
  return Response.json({ ok: true });
}
