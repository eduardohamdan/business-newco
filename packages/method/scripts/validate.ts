import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileMethodFromDir } from "../src/compile";

/** Valida o YAML e garante que o JSON gerado está atualizado (rodado no CI). */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const method = compileMethodFromDir(join(root, "content"));
const current = readFileSync(join(root, "src/generated/method.json"), "utf8");
if (current !== JSON.stringify(method, null, 2) + "\n") {
  console.error("src/generated/method.json está desatualizado. Rode: pnpm --filter @beos/method build");
  process.exit(1);
}
console.log(`OK: método ${method.manifest.version} válido e compilado.`);
