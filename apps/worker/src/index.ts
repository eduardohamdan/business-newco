/**
 * Worker: processa extratos, envia rituais no horário de cada empresa, faz o acompanhamento (lembrete/ausência)
 * e avalia alertas diários. Todas as tarefas são idempotentes e podem ser reprocessadas.
 */
import { closePool } from "@beos/db";
import {
  allOrganizationIds, dueRituals, followUpRitual, getBoss, getStorage, notifyAlerts, processStatement, QUEUES, sendRitual,
} from "@beos/services";

const boss = await getBoss();

await boss.work<{ orgId: string; documentId: string }>(QUEUES.statement, async (jobs) => {
  for (const j of jobs) {
    const r = await processStatement(j.data.orgId, j.data.documentId);
    console.log(`[statement] ${j.data.documentId}: ${r.status} — ${r.message}`);
  }
});

await boss.work(QUEUES.ritualTick, async () => {
  for (const { orgId, localDate } of await dueRituals()) {
    try {
      const r = await sendRitual(orgId, localDate);
      if (r.sent) console.log(`[ritual] enviado para ${orgId} via ${r.channel}`);
    } catch (e) {
      console.error(`[ritual] falha em ${orgId}`, e);
    }
  }
});

await boss.work(QUEUES.ritualFollowUp, async () => {
  for (const orgId of await allOrganizationIds()) {
    try {
      await followUpRitual(orgId);
    } catch (e) {
      console.error(`[ritual-followup] ${orgId}`, e);
    }
  }
});

await boss.work(QUEUES.alertsDaily, async () => {
  for (const orgId of await allOrganizationIds()) {
    try {
      const a = await notifyAlerts(orgId);
      if (a) console.log(`[alertas] ${orgId}: ${a.code}`);
    } catch (e) {
      console.error(`[alertas] ${orgId}`, e);
    }
  }
});

await boss.work<{ orgId: string; keys: string[] }>(QUEUES.deleteFiles, async (jobs) => {
  const storage = await getStorage();
  for (const j of jobs) for (const k of j.data.keys) await storage.delete(k);
});

// Agendas (UTC). O envio respeita o fuso e o horário de cada empresa dentro de dueRituals().
await boss.schedule(QUEUES.ritualTick, "*/15 * * * *");
await boss.schedule(QUEUES.ritualFollowUp, "0 * * * *");
await boss.schedule(QUEUES.alertsDaily, "0 11 * * *"); // 8h em Brasília

console.log("Worker em execução. Filas:", Object.values(QUEUES).join(", "));

const shutdown = async () => {
  console.log("Encerrando worker...");
  await boss.stop({ graceful: true, timeout: 20_000 });
  await closePool();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
