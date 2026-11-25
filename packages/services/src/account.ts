import { identity, repo, withSystem, withTenant } from "@beos/db";
import { enqueue, QUEUES } from "./jobs";
import { getStorage } from "./storage";

/** RF17 — exportação completa dos dados da organização (JSON). */
export async function exportData(orgId: string, userId: string) {
  return withTenant(orgId, async (db) => {
    await repo.audit(db, userId, "data.exported");
    return repo.exportOrganizationData(db);
  });
}

/** RF17 — exclusão: só o dono; apaga em cascata e deixa trilha de auditoria. Arquivos são removidos pelo worker. */
export async function deleteOrganization(orgId: string, userId: string) {
  const role = await withSystem((db) => identity.getMembershipRole(db, userId, orgId));
  if (role !== "owner") throw new Error("Só o dono pode excluir a conta da empresa.");
  const keys = (await withTenant(orgId, (db) => repo.listDocuments(db))).map((d) => d.storage_key);
  await withSystem((db) => db.query(`select delete_organization($1, $2)`, [orgId, userId]));
  // Arquivos: remoção assíncrona pelo worker; sem fila disponível, remove na hora.
  try {
    if (process.env.PROCESS_INLINE === "true") throw new Error("inline");
    await enqueue(QUEUES.deleteFiles, { orgId, keys });
  } catch {
    const storage = await getStorage();
    for (const k of keys) await storage.delete(k).catch(() => undefined);
  }
}
