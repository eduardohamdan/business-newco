import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, identity, migrate, repo, setPool, withSystem, withTenant } from "../src";

/**
 * Testes de isolamento entre organizações (RLS). Requer Postgres:
 * TEST_DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres
 */
const ADMIN = process.env.TEST_DATABASE_ADMIN_URL;
const dbName = `beos_test_${randomUUID().slice(0, 8)}`;
const d = ADMIN ? describe : describe.skip;

let orgA = "";
let orgB = "";
let userA = "";

d("RLS e repositórios", () => {
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    await admin.end();
    const url = new URL(ADMIN!);
    url.pathname = `/${dbName}`;
    await migrate(url.toString(), () => undefined);
    const appUrl = new URL(url.toString());
    appUrl.username = "beos_app";
    appUrl.password = "beos_app";
    setPool(new pg.Pool({ connectionString: appUrl.toString(), max: 4 }));
    await withSystem(async (db) => {
      const a = await identity.findOrCreateUser(db, "a@teste.com");
      const b = await identity.findOrCreateUser(db, "b@teste.com");
      userA = a.id;
      orgA = await identity.createOrganization(db, a.id, { cnpj: "11222333000181", tradeName: "A", revenueBand: "1m_4m8", teamSize: 5 });
      orgB = await identity.createOrganization(db, b.id, { cnpj: "12ABC34501DE35", tradeName: "B", revenueBand: "360k_1m", teamSize: 3 });
    });
  });

  afterAll(async () => {
    await closePool();
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  });

  it("cada organização só enxerga os próprios dados", async () => {
    await withTenant(orgA, (db) => repo.recordMetric(db, { metricCode: "folego_caixa_dias", periodStart: "2026-09-01", periodEnd: "2026-09-30", value: 12, source: "raiox" }));
    const a = await withTenant(orgA, (db) => repo.latestMetrics(db));
    const b = await withTenant(orgB, (db) => repo.latestMetrics(db));
    expect(a.folego_caixa_dias?.value).toBe(12);
    expect(b).toEqual({});
  });

  it("organizations também é isolada", async () => {
    const o = await withTenant(orgB, (db) => repo.getOrganization(db));
    expect(o.trade_name).toBe("B");
    const all = await withTenant(orgB, (db) => db.query("select id from organizations"));
    expect(all.rows).toHaveLength(1);
  });

  it("sem organização definida não lê nada", async () => {
    const r = await withSystem((db) => db.query("select * from metric_values"));
    expect(r.rows).toHaveLength(0);
  });

  it("bloqueia escrita com organization_id de outra empresa", async () => {
    await expect(
      withTenant(orgB, (db) =>
        db.query(`insert into metric_values (organization_id, metric_code, period_start, period_end, value, source) values ($1,'x','2026-01-01','2026-01-31',1,'manual')`, [orgA]),
      ),
    ).rejects.toThrow();
  });

  it("o papel da aplicação não consegue apagar a auditoria", async () => {
    await withTenant(orgA, (db) => repo.audit(db, userA, "teste"));
    await expect(withTenant(orgA, (db) => db.query("delete from audit_events"))).rejects.toThrow();
  });

  it("OTP: código certo entra uma vez, errado conta tentativa", async () => {
    const r = await withSystem((db) => identity.createAuthCode(db, "a@teste.com"));
    if ("error" in r) throw new Error("rate limited");
    expect(await withSystem((db) => identity.verifyAuthCode(db, "a@teste.com", "000000" === r.code ? "111111" : "000000"))).toBe(false);
    expect(await withSystem((db) => identity.verifyAuthCode(db, "a@teste.com", r.code))).toBe(true);
    expect(await withSystem((db) => identity.verifyAuthCode(db, "a@teste.com", r.code))).toBe(false);
  });

  it("sessão: token guarda só o hash e troca de organização exige vínculo", async () => {
    const token = await withSystem((db) => identity.createSession(db, userA, {}));
    const s = await withSystem((db) => identity.getSessionByToken(db, token));
    expect(s?.user.email).toBe("a@teste.com");
    expect(await withSystem((db) => identity.setActiveOrg(db, s!.id, userA, orgB))).toBe(false);
    expect(await withSystem((db) => identity.setActiveOrg(db, s!.id, userA, orgA))).toBe(true);
    const raw = await withSystem((db) => db.query("select token_hash from sessions"));
    expect(raw.rows.every((x) => x.token_hash !== token)).toBe(true);
  });

  it("um único ciclo ativo e no máximo 3 prioridades", async () => {
    const plan = {
      methodVersion: "t", startsOn: "2026-10-05", endsOn: "2026-12-27", weeks: 12, firstAction: null,
      priorities: [1, 2, 3].map((n) => ({ position: n, trackCode: `cf-t${n}`, trackVersion: 1, title: `T${n}`, dimension: "caixa_financas", objective: "", metric: "folego_caixa_dias", metricName: "", baseline: 10, target: 30, needsBaseline: false, milestones: [{ code: "m1", title: "M", week: 2, dueDate: "2026-10-18", evidence: "e", actions: [{ key: `k${n}`, title: "a", week: 1, dueDate: "2026-10-11", role: "owner" as const, minutes: 10 }] }] })),
    };
    const id = await withTenant(orgA, async (db) => {
      const asm = await repo.insertAssessment(db, { methodVersion: "t", answers: {}, dimensionScores: {}, maturityAvg: null, coverage: 0, createdBy: userA });
      const dx = await repo.insertDiagnosis(db, { assessmentId: asm.id, methodVersion: "t", stage: "organizacao", coverage: 1, confidence: 1, sufficient: true, result: {}, suggestedTracks: [] });
      return repo.createCycleFromPlan(db, { plan, diagnosisId: dx.id, ownerUserId: userA, rationale: {} });
    });
    expect(id).toBeTruthy();
    const c = await withTenant(orgA, (db) => repo.getActiveCycle(db));
    expect(c?.priorities).toHaveLength(3);
    await expect(withTenant(orgA, (db) => db.query(`insert into priorities (organization_id, cycle_id, position, track_code, track_version, title, dimension, metric_code) values ($1,$2,4,'x',1,'x','x','x')`, [orgA, id]))).rejects.toThrow();
    const action = c!.priorities[0]!.actions[0]!;
    await withTenant(orgA, (db) => repo.setActionStatus(db, action.id, "done"));
    const after = await withTenant(orgA, (db) => repo.getActiveCycle(db));
    expect(after!.priorities[0]!.milestones[0]!.status).toBe("done");
  });
});
