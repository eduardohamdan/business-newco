import { runEvals } from "../src/evals";

const results = await runEvals();
for (const r of results) console.log(`${r.pass ? "✔" : "✘"} ${r.name} — ${r.detail}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} casos aprovados.`);
process.exit(failed ? 1 : 0);
