import pg from "pg";

/**
 * Acesso ao banco. Regras:
 * - withTenant(orgId, fn): TODA leitura/escrita de dados de negócio. Define app.org_id na transação → RLS aplica.
 * - withSystem(fn): só para identidade (users, sessions, auth_codes, memberships) e funções security definer.
 * Nunca concatene valores em SQL: use parâmetros ($1, $2...).
 */
export type Db = pg.PoolClient;

// bigint (centavos) e numeric viram number; date fica como string ISO (YYYY-MM-DD).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);
// timestamptz/timestamp viram string ISO 8601 (os tipos das linhas declaram string).
const toIso = (v: string) => {
  const s = v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
};
pg.types.setTypeParser(1184, toIso);
pg.types.setTypeParser(1114, toIso);

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definido");
    pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  }
  return pool;
}

export function setPool(p: pg.Pool): void {
  pool = p;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenant<T>(orgId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(orgId)) throw new Error("orgId inválido");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.org_id', $1, true)", [orgId]);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.org_id', '', true)");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query(sql, params);
  if (!r.rows[0]) throw new Error("Registro não encontrado");
  return r.rows[0] as T;
}

export async function maybe<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await db.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}
