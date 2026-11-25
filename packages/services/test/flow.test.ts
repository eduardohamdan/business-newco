import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYNTHETIC_PROFILES, syntheticAnswers, syntheticStatementCsv } from "@beos/core";
import { closePool, identity, migrate, repo, setPool, withSystem, withTenant } from "@beos/db";
import {
  approvePlan, askAdvisor, closeActiveCycle, correctCategory, deleteOrganization, evaluateOrgAlerts, exportData, prepareRitual,
  processStatement, runDiagnosis, saveAssessment, saveManualMetrics, submitRitual, uploadStatement, verifyLoginCode, requestLoginCode,
} from "../src";

/** Jornada ponta a ponta (J02–J09) com banco real, IA mock e armazenamento local temporário. */
const ADMIN = process.env.TEST_DATABASE_ADMIN_URL;
const d = ADMIN ? describe : describe.skip;
const dbName = `beos_flow_${randomUUID().slice(0, 8)}`;
let orgId = "";
let userId = "";

d("jornada completa", () => {
  beforeAll(async () => {
    process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), "beos-"));
    process.env.AI_PRIMARY_PROVIDER = "mock";
    process.env.AI_FALLBACK_PROVIDER = "mock";
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    await admin.end();
    const url = new URL(ADMIN!);
    url.pathname = `/${dbName}`;
    await migrate(url.toString(), () => undefined);
    url.username = "beos_app";
    url.password = "beos_app";
    setPool(new pg.Pool({ connectionString: url.toString(), max: 4 }));
  });

  afterAll(async () => {
    await closePool();
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  });

  it("login por código", async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (s: string) => logs.push(String(s));
    expect((await requestLoginCode("dona@clinica.com")).ok).toBe(true);
    console.log = orig;
    const code = logs.join("\n").match(/código de acesso é (\d{6})/)![1]!;
    const r = await verifyLoginCode("dona@clinica.com", code, {});
    expect(r?.token).toBeTruthy();
    userId = r!.userId;
    orgId = await withSystem((db) => identity.createOrganization(db, userId, { cnpj: "11222333000181", tradeName: "Clínica", revenueBand: "360k_1m", teamSize: 6, sector: "saude" }));
  });

  it("Raio-X a partir do extrato (RF02)", async () => {
    const p = SYNTHETIC_PROFILES[0]!;
    const up = await uploadStatement(orgId, userId, { name: "extrato.csv", bytes: new TextEncoder().encode(syntheticStatementCsv(p)), mime: "text/csv" });
    const r = await processStatement(orgId, up.documentId);
    expect(r.status).toBe("processed");
    const again = await uploadStatement(orgId, userId, { name: "extrato.csv", bytes: new TextEncoder().encode(syntheticStatementCsv(p)) });
    expect(again.duplicate).toBe(true);
    const rx = await withTenant(orgId, (db) => repo.latestRaioX(db));
    expect(rx?.result.metrics.meses_caixa_negativo.value).toBe(3);
    expect(rx?.narrative).toBeTruthy();
  });

  it("extrato com saldo divergente é bloqueado", async () => {
    const csv = "Data;Histórico;Valor;Saldo\n01/09/2026;SALDO ANTERIOR;;1.000,00\n02/09/2026;PIX RECEBIDO - X;100,00;1.100,00\n03/09/2026;TARIFA;-10,00;1.200,00\n";
    const up = await uploadStatement(orgId, userId, { name: "ruim.csv", bytes: new TextEncoder().encode(csv) });
    const r = await processStatement(orgId, up.documentId);
    expect(r.status).toBe("blocked");
  });

  it("correção de categoria vira regra e recalcula", async () => {
    const t = await withTenant(orgId, (db) => db.query(`select id from transactions where description like 'COMPRA DIVERSOS%' limit 1`));
    await correctCategory(orgId, userId, t.rows[0].id, "fornecedores");
    const rules = await withTenant(orgId, (db) => repo.listCategoryRules(db));
    expect(rules.some((r) => r.categoryCode === "fornecedores")).toBe(true);
    const left = await withTenant(orgId, (db) => db.query(`select count(*)::int n from transactions where description like 'COMPRA DIVERSOS%' and category_code <> 'fornecedores'`));
    expect(left.rows[0].n).toBe(0);
  });

  let diagnosisId = "";
  it("diagnóstico e prioridades (RF05–RF08)", async () => {
    await saveAssessment(orgId, userId, syntheticAnswers(SYNTHETIC_PROFILES[0]!));
    await saveManualMetrics(orgId, userId, { margem_bruta_pct: 28 });
    const v = await runDiagnosis(orgId);
    diagnosisId = v.id;
    expect(v.dx.stage.stage).toBe("sobrevivencia");
    expect(v.dx.sufficient).toBe(true);
    expect(v.prioritization.selected.length).toBeGreaterThan(0);
    expect(v.prioritization.selected.length).toBeLessThanOrEqual(3);
  });

  it("plano de 90 dias (RF09) e bloqueio de trilha não elegível", async () => {
    await expect(approvePlan(orgId, userId, diagnosisId, ["pl-contratar-certo"])).rejects.toThrow();
    const v = await withTenant(orgId, (db) => repo.getDiagnosis(db, diagnosisId));
    const codes = v!.suggested_tracks.map((s: any) => s.code);
    await approvePlan(orgId, userId, diagnosisId, codes, "2026-10-05");
    const c = await withTenant(orgId, (db) => repo.getActiveCycle(db));
    expect(c?.priorities.length).toBe(codes.length);
    await expect(approvePlan(orgId, userId, diagnosisId, codes, "2026-10-05")).rejects.toThrow(/ciclo ativo/);
  });

  it("ritual semanal (RF10) atualiza ação, número e risco", async () => {
    const prep = await prepareRitual(orgId, "2026-10-07", "web");
    expect(prep?.week).toBe(1);
    expect(prep!.session.questions.length).toBeLessThanOrEqual(3);
    const out = await submitRitual(orgId, prep!.session.id, { action: "feito", metric: "12", blocker: "não" }, userId);
    expect(out.actionUpdates[0]?.status).toBe("done");
    const s = await withTenant(orgId, (db) => repo.getRitualSession(db, prep!.session.id));
    expect(s?.status).toBe("answered");
  });

  it("alertas (RF14) e Advisor (RF13)", async () => {
    const al = await evaluateOrgAlerts(orgId, "2026-12-20");
    expect(al.some((a) => a.code === "marco_atrasado")).toBe(true);
    const r = await askAdvisor(orgId, userId, "Devo pegar um empréstimo para pagar a folha?");
    expect(r.blocked).toBe(true);
    const r2 = await askAdvisor(orgId, userId, "Como explico o reajuste de preço para os clientes?");
    expect(r2.answer.length).toBeGreaterThan(10);
  });

  it("fechamento do ciclo", async () => {
    const c = await closeActiveCycle(orgId, userId);
    expect(c.priorities.length).toBeGreaterThan(0);
    expect(await withTenant(orgId, (db) => repo.getActiveCycle(db))).toBeNull();
  });

  it("exportação e exclusão (RF17)", async () => {
    const data = await exportData(orgId, userId);
    expect(data.transactions!.length).toBeGreaterThan(10);
    expect((data.organizations![0] as any).data_salt).toBeUndefined();
    await deleteOrganization(orgId, userId);
    const left = await withSystem((db) => identity.listUserOrganizations(db, userId));
    expect(left).toHaveLength(0);
  });
});
