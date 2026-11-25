import { PgBoss } from "pg-boss";

/** Filas do worker. Nomes estáveis: mudar exige migração das filas existentes. */
export const QUEUES = {
  statement: "statement.process",
  ritualTick: "ritual.tick",
  ritualFollowUp: "ritual.followup",
  alertsDaily: "alerts.daily",
  deleteFiles: "storage.delete-org",
} as const;

let boss: Promise<PgBoss> | undefined;

/** Instância única (lazy). Usa JOBS_DATABASE_URL ou DATABASE_ADMIN_URL: o pg-boss cria o próprio schema. */
export function getBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = (async () => {
      const url = process.env.JOBS_DATABASE_URL ?? process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
      if (!url) throw new Error("Defina JOBS_DATABASE_URL para as filas.");
      const b = new PgBoss(url);
      b.on("error", (e) => console.error("[jobs]", e));
      await b.start();
      for (const q of Object.values(QUEUES)) await b.createQueue(q).catch(() => undefined);
      return b;
    })();
  }
  return boss;
}

export async function enqueue(queue: (typeof QUEUES)[keyof typeof QUEUES], data: object, opts: { singletonKey?: string } = {}) {
  const b = await getBoss();
  return b.send(queue, data, { retryLimit: 3, retryBackoff: true, singletonKey: opts.singletonKey });
}
