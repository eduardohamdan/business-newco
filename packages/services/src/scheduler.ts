import { identity, repo, withSystem, withTenant } from "@beos/db";

/** Data e hora locais (fuso da organização). */
export function localParts(now: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday!);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`, weekday };
}

/** Organizações cujo ritual deve ser enviado agora (dia da semana e horário já passaram, no fuso local). */
export async function dueRituals(now = new Date()): Promise<{ orgId: string; localDate: string }[]> {
  const ids = await withSystem((db) => identity.listOrganizationIdsForScheduler(db));
  const out: { orgId: string; localDate: string }[] = [];
  for (const { id } of ids) {
    const org = await withTenant(id, (db) => repo.getOrganization(db)).catch(() => null);
    if (!org) continue;
    const lp = localParts(now, org.timezone);
    if (lp.weekday === org.ritual_weekday && lp.hhmm >= org.ritual_time.slice(0, 5)) out.push({ orgId: id, localDate: lp.date });
  }
  return out;
}

export async function allOrganizationIds(): Promise<string[]> {
  return (await withSystem((db) => identity.listOrganizationIdsForScheduler(db))).map((r) => r.id);
}
