import { migrate } from "../src/migrate";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("Defina DATABASE_ADMIN_URL (papel dono do banco).");
  process.exit(1);
}
const applied = await migrate(url);
console.log(applied.length ? `Migrações aplicadas: ${applied.join(", ")}` : "Banco já está atualizado.");
