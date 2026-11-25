import { emailFromEnv } from "@beos/channels";
import { identity, withSystem } from "@beos/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Login sem senha: código de 6 dígitos por e-mail (10 min, 5 tentativas, 5 códigos por hora). */
export async function requestLoginCode(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: false, error: "E-mail inválido." };
  const r = await withSystem((db) => identity.createAuthCode(db, e));
  if ("error" in r) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." };
  await emailFromEnv().send({ to: e, subject: `Seu código de acesso: ${r.code}`, text: `Seu código de acesso é ${r.code}. Ele expira em 10 minutos. Se não foi você, ignore este e-mail.` });
  return { ok: true };
}

export async function verifyLoginCode(email: string, code: string, meta: { ip?: string; userAgent?: string }): Promise<{ token: string; userId: string } | null> {
  const e = email.trim().toLowerCase();
  return withSystem(async (db) => {
    if (!(await identity.verifyAuthCode(db, e, code))) return null;
    const u = await identity.findOrCreateUser(db, e);
    const token = await identity.createSession(db, u.id, meta);
    const orgs = await identity.listUserOrganizations(db, u.id);
    if (orgs[0]) {
      const s = await identity.getSessionByToken(db, token);
      await identity.setActiveOrg(db, s!.id, u.id, orgs[0].id);
    }
    return { token, userId: u.id };
  });
}
