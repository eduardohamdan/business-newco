import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

/** Aplica migrações SQL em ordem, uma vez cada, com um papel dono (DATABASE_ADMIN_URL). */
export async function migrate(adminUrl: string, log: (s: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await client.query(`select version from schema_migrations`)).rows.map((r) => r.version as string));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      log(`Aplicando ${f}...`);
      await client.query("begin");
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
        await client.query(`insert into schema_migrations (version) values ($1)`, [f]);
        await client.query("commit");
        applied.push(f);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Falha na migração ${f}: ${(e as Error).message}`);
      }
    }
    if (process.env.BEOS_APP_PASSWORD) {
      await client.query(`alter role beos_app with password ${client.escapeLiteral(process.env.BEOS_APP_PASSWORD)}`);
    }
  } finally {
    await client.end();
  }
  return applied;
}
