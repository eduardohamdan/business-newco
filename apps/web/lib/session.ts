import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { identity, withSystem, type UserOrg, type UserRow } from "@beos/db";

export const SESSION_COOKIE = "beos_session";

export interface AppSession {
  sessionId: string;
  user: UserRow;
  orgId: string | null;
  orgs: UserOrg[];
  role: UserOrg["role"] | null;
}

export async function getSession(): Promise<AppSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return withSystem(async (db) => {
    const s = await identity.getSessionByToken(db, token);
    if (!s) return null;
    const orgs = await identity.listUserOrganizations(db, s.user_id);
    const active = orgs.find((o) => o.id === s.active_org_id) ?? orgs[0] ?? null;
    return { sessionId: s.id, user: s.user, orgId: active?.id ?? null, orgs, role: active?.role ?? null };
  });
}

export async function requireSession(): Promise<AppSession> {
  const s = await getSession();
  if (!s) redirect("/entrar");
  return s;
}

/** Exige organização ativa; sem ela, manda para o onboarding. */
export async function requireOrg(): Promise<AppSession & { orgId: string }> {
  const s = await requireSession();
  if (!s.orgId) redirect("/app/onboarding");
  return s as AppSession & { orgId: string };
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function requestMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(), userAgent: h.get("user-agent") ?? undefined };
}

export function isOperator(user: UserRow): boolean {
  const list = (process.env.INTERNAL_OPERATOR_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return user.is_operator || list.includes(user.email.toLowerCase());
}
