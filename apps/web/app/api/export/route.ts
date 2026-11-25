import { exportData } from "@beos/services";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  if (!s?.orgId) return new Response("Não autorizado", { status: 401 });
  const data = await exportData(s.orgId, s.user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="meus-dados-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
