import { identity, repo, withSystem, withTenant } from "@beos/db";

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
  await withSystem((db) => db.query(`select delete_organization($1, $2)`, [orgId, userId]));
}
