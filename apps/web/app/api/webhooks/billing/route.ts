import { gatewayFromEnv } from "@beos/billing";
import { applyBillingEvent } from "@beos/services";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ev = gatewayFromEnv().parseWebhook(req.headers, body);
  if (!ev) return new Response("Não autorizado", { status: 401 });
  await applyBillingEvent(ev);
  return Response.json({ ok: true });
}
