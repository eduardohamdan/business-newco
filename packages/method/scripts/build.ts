import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileMethodFromDir } from "../src/compile";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const method = compileMethodFromDir(join(root, "content"));
writeFileSync(join(root, "src/generated/method.json"), JSON.stringify(method, null, 2) + "\n");
console.log(`Método ${method.manifest.version} compilado: ${method.tracks.length} trilhas, ${method.questions.length} perguntas, ${method.metrics.length} indicadores, ${method.categories.length} categorias.`);
