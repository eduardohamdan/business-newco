/**
 * Seed de desenvolvimento: cria um usuário dono e uma empresa sintética com Raio-X, diagnóstico e ciclo ativo.
 * Uso: DATABASE_URL=... pnpm db:seed  (depois entre com dono@exemplo.com.br; o código aparece no console do app)
 */
import {
  buildPlan, categorize, computeRaioX, dedupeHashes, diagnose, parseCsv, prioritize, reconcile, sanitizeDescription,
  scoreMaturity, SYNTHETIC_PROFILES, syntheticAnswers, syntheticStatementCsv,
} from "@beos/core";
import { getMethod } from "@beos/method";
import { closePool, identity, repo, withSystem, withTenant } from "../src";

const profile = SYNTHETIC_PROFILES[0]!;
const email = process.env.SEED_EMAIL ?? "dono@exemplo.com.br";

const { userId, orgId } = await withSystem(async (db) => {
  const u = await identity.findOrCreateUser(db, email);
  await identity.updateUserProfile(db, u.id, { name: "Dona Exemplo", phone: "+5585999990000" });
  const existing = (await identity.listUserOrganizations(db, u.id))[0];
  const orgId = existing?.id ?? (await identity.createOrganization(db, u.id, { cnpj: "11222333000181", tradeName: "Clínica Exemplo", revenueBand: "360k_1m", teamSize: profile.teamSize, sector: "saude", uf: "CE", city: "Fortaleza" }));
  return { userId: u.id, orgId };
});

await withTenant(orgId, async (db) => {
  const org = await repo.getOrganization(db);
  const st = parseCsv(syntheticStatementCsv(profile));
  const rec = reconcile(st);
  const doc = await repo.insertDocument(db, { kind: "bank_statement", filename: "extrato-exemplo.csv", sizeBytes: 1000, sha256: "seed-" + orgId, storageKey: "seed/extrato.csv", format: "csv", uploadedBy: userId });
  const acc = await repo.upsertBankAccount(db, { accountKey: "seed-conta", bankName: "Banco Exemplo", accountMasked: "****-1" });
  const hashes = dedupeHashes("seed-conta", st.transactions);
  const rows = st.transactions.map((t, i) => {
    const s = sanitizeDescription(t.description, org.data_salt);
    const c = categorize({ amountCents: t.amountCents, description: s.description, counterpartyKind: s.counterparty.kind });
    return { bankAccountId: acc, documentId: doc.id, postedAt: t.postedAt, amountCents: t.amountCents, description: s.description, counterpartyKind: s.counterparty.kind, counterpartyKey: s.counterparty.docHash ?? s.counterparty.name, categoryCode: c.categoryCode, categorySource: c.source, confidence: c.confidence, personalSuspect: c.personalSuspect, needsReview: c.needsReview, dedupeHash: hashes[i]!, provenance: t.provenance };
  });
  await repo.insertTransactions(db, rows);
  const rx = computeRaioX(rows.map((r) => ({ postedAt: r.postedAt, amountCents: r.amountCents, categoryCode: r.categoryCode, confidence: r.confidence, personalSuspect: r.personalSuspect, counterpartyKey: r.counterpartyKey })), { reconcile: rec });
  const snap = await repo.insertRaioX(db, { periodStart: rx.periodStart, periodEnd: rx.periodEnd, reconcileStatus: rec.status, result: rx, methodVersion: getMethod().manifest.version });
  for (const [k, v] of Object.entries(rx.metrics)) if (v.value !== null) await repo.recordMetric(db, { metricCode: k, periodStart: rx.periodStart, periodEnd: rx.periodEnd, value: v.value, source: "raiox", documentId: doc.id });
  await repo.setDocumentStatus(db, doc.id, "processed");

  const answers = syntheticAnswers(profile);
  const maturity = scoreMaturity(answers);
  const asm = await repo.insertAssessment(db, { methodVersion: maturity.methodVersion, answers, dimensionScores: maturity.dimensions, maturityAvg: maturity.avg, coverage: maturity.coverage, createdBy: userId });
  const dx = diagnose({ maturity, raiox: rx, manualMetrics: { margem_bruta_pct: 28 }, facts: { teamSize: org.team_size }, dataAsOf: rx.periodEnd, today: new Date().toISOString().slice(0, 10) });
  const pr = prioritize(dx, { teamSize: org.team_size, hasBankStatement: true });
  const d = await repo.insertDiagnosis(db, { assessmentId: asm.id, raioxId: snap.id, methodVersion: dx.methodVersion, stage: dx.stage.stage, coverage: dx.coverage, confidence: dx.confidence, sufficient: dx.sufficient, result: dx, suggestedTracks: pr.selected.map((s) => ({ code: s.track.code, score: s.score, reasons: s.reasons })) });
  if (!(await repo.getActiveCycle(db))) {
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const plan = buildPlan({ tracks: pr.selected.map((s) => s.track), baselines: dx.signals.metrics, startsOn: monday.toISOString().slice(0, 10) });
    await repo.createCycleFromPlan(db, { plan, diagnosisId: d.id, ownerUserId: userId, rationale: Object.fromEntries(pr.selected.map((s) => [s.track.code, { score: s.score, reasons: s.reasons }])) });
  }
  await repo.grantConsent(db, userId, "terms", { source: "seed" });
});

console.log(`Seed pronto. Entre com ${email} (organização ${orgId}).`);
await closePool();
