import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { many, maybe, one, type Db } from "./client";

/** Identidade: usuários, códigos de acesso (OTP) e sessões. Sempre via withSystem. */
export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  phone_e164: string | null;
  is_operator: boolean;
}

export interface SessionRow {
  id: string;
  user_id: string;
  active_org_id: string | null;
  expires_at: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;
const SESSION_DAYS = 30;

export async function findOrCreateUser(db: Db, email: string): Promise<UserRow> {
  return one<UserRow>(
    db,
    `insert into users (email) values (lower($1)) on conflict (email) do update set email = excluded.email returning *`,
    [email.trim()],
  );
}

export const getUser = (db: Db, id: string) => maybe<UserRow>(db, `select * from users where id = $1`, [id]);

export async function updateUserProfile(db: Db, id: string, p: { name?: string; phone?: string }) {
  await db.query(`update users set name = coalesce($2, name), phone_e164 = coalesce($3, phone_e164) where id = $1`, [id, p.name ?? null, p.phone ?? null]);
}

/** Cria um código de 6 dígitos. Retorna o código em claro só para envio (nunca é salvo). */
export async function createAuthCode(db: Db, email: string): Promise<{ code: string } | { error: "rate_limited" }> {
  const recent = await one<{ n: number }>(
    db,
    `select count(*)::int as n from auth_codes where email = lower($1) and created_at > now() - interval '1 hour'`,
    [email],
  );
  if (recent.n >= OTP_MAX_PER_HOUR) return { error: "rate_limited" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.query(
    `insert into auth_codes (email, code_hash, expires_at) values (lower($1), $2, now() + ($3 || ' minutes')::interval)`,
    [email, sha(`${email.toLowerCase()}:${code}`), String(OTP_TTL_MIN)],
  );
  return { code };
}

export async function verifyAuthCode(db: Db, email: string, code: string): Promise<boolean> {
  const row = await maybe<{ id: string; code_hash: string; attempts: number }>(
    db,
    `select id, code_hash, attempts from auth_codes
     where email = lower($1) and consumed_at is null and expires_at > now()
     order by created_at desc limit 1 for update`,
    [email],
  );
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  const expected = Buffer.from(row.code_hash, "hex");
  const got = Buffer.from(sha(`${email.toLowerCase()}:${code.trim()}`), "hex");
  const ok = expected.length === got.length && timingSafeEqual(expected, got);
  await db.query(
    ok ? `update auth_codes set consumed_at = now() where id = $1` : `update auth_codes set attempts = attempts + 1 where id = $1`,
    [row.id],
  );
  return ok;
}

/** Cria sessão e devolve o token em claro (vai no cookie httpOnly); no banco fica só o hash. */
export async function createSession(db: Db, userId: string, meta: { ip?: string; userAgent?: string }): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [userId, sha(token), String(SESSION_DAYS), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
  );
  return token;
}

export async function getSessionByToken(db: Db, token: string): Promise<(SessionRow & { user: UserRow }) | null> {
  const row = await maybe<SessionRow & UserRow & { session_id: string }>(
    db,
    `select s.id as session_id, s.user_id, s.active_org_id, s.expires_at, u.*
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
    [sha(token)],
  );
  if (!row) return null;
  return {
    id: row.session_id,
    user_id: row.user_id,
    active_org_id: row.active_org_id,
    expires_at: row.expires_at,
    user: { id: row.user_id, email: row.email, name: row.name, phone_e164: row.phone_e164, is_operator: row.is_operator },
  };
}

export async function revokeSession(db: Db, token: string) {
  await db.query(`update sessions set revoked_at = now() where token_hash = $1`, [sha(token)]);
}

export async function setActiveOrg(db: Db, sessionId: string, userId: string, orgId: string): Promise<boolean> {
  const m = await maybe(db, `select 1 from memberships where user_id = $1 and organization_id = $2`, [userId, orgId]);
  if (!m) return false;
  await db.query(`update sessions set active_org_id = $2 where id = $1`, [sessionId, orgId]);
  return true;
}

export interface UserOrg {
  id: string;
  trade_name: string;
  cnpj: string;
  role: "owner" | "manager" | "member" | "partner" | "expert";
}

export const listUserOrganizations = (db: Db, userId: string) => many<UserOrg>(db, `select * from user_organizations($1)`, [userId]);

export async function getMembershipRole(db: Db, userId: string, orgId: string): Promise<UserOrg["role"] | null> {
  const r = await maybe<{ role: UserOrg["role"] }>(db, `select role from memberships where user_id = $1 and organization_id = $2`, [userId, orgId]);
  return r?.role ?? null;
}

export async function createOrganization(
  db: Db,
  userId: string,
  o: { cnpj: string; tradeName: string; revenueBand: string; teamSize: number; sector?: string; uf?: string; city?: string; legalName?: string; cnae?: string },
): Promise<string> {
  const r = await one<{ id: string }>(db, `select create_organization($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id`, [
    userId, o.cnpj, o.tradeName, o.revenueBand, o.teamSize, o.sector ?? null, o.uf ?? null, o.city ?? null, o.legalName ?? null, o.cnae ?? null,
  ]);
  return r.id;
}

export async function addMember(db: Db, orgId: string, email: string, role: "manager" | "member"): Promise<UserRow> {
  const u = await findOrCreateUser(db, email);
  await db.query(
    `insert into memberships (user_id, organization_id, role) values ($1, $2, $3) on conflict (user_id, organization_id) do update set role = excluded.role`,
    [u.id, orgId, role],
  );
  return u;
}

export const listMembers = (db: Db, orgId: string) =>
  many<UserRow & { role: string }>(
    db,
    `select u.*, m.role from memberships m join users u on u.id = m.user_id where m.organization_id = $1 order by m.created_at`,
    [orgId],
  );

/** Organizações com ritual a enviar (usado pelo agendador; caminho de sistema, sem dados de negócio). */
export const listOrganizationIdsForScheduler = (db: Db) =>
  many<{ id: string }>(db, `select organization_id as id from memberships where role = 'owner' group by organization_id`);

export async function findUserByPhone(db: Db, phoneE164: string): Promise<UserRow | null> {
  return maybe<UserRow>(db, `select * from users where phone_e164 = $1 order by created_at limit 1`, [phoneE164]);
}
