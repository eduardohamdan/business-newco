import type { CyclePlan, OrgCategoryRule } from "@beos/core";
import { many, maybe, one, type Db } from "./client";

/**
 * Repositórios de dados de negócio. TODAS as funções daqui devem ser chamadas dentro de withTenant(orgId, ...):
 * o RLS garante o isolamento mesmo se um WHERE for esquecido.
 */

// ---------------------------------------------------------------------------
// Organização
// ---------------------------------------------------------------------------
export interface OrganizationRow {
  id: string;
  cnpj: string;
  legal_name: string | null;
  trade_name: string;
  cnae: string | null;
  sector: string | null;
  revenue_band: string;
  team_size: number;
  uf: string | null;
  city: string | null;
  stage: string | null;
  timezone: string;
  ritual_weekday: number;
  ritual_time: string;
  ritual_channel: "whatsapp" | "web" | "email";
  data_salt: string;
  created_at: string;
}

export const getOrganization = (db: Db) => one<OrganizationRow>(db, `select * from organizations where id = app_org_id()`);

export async function updateOrganization(
  db: Db,
  p: Partial<Pick<OrganizationRow, "trade_name" | "sector" | "team_size" | "ritual_weekday" | "ritual_time" | "ritual_channel" | "stage" | "revenue_band">>,
) {
  const allowed = new Set(["trade_name", "sector", "team_size", "ritual_weekday", "ritual_time", "ritual_channel", "stage", "revenue_band"]);
  const keys = (Object.keys(p) as (keyof typeof p)[]).filter((k) => allowed.has(k) && p[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  await db.query(`update organizations set ${sets.join(", ")} where id = app_org_id()`, keys.map((k) => p[k]));
}

// ---------------------------------------------------------------------------
// Consentimentos e auditoria
// ---------------------------------------------------------------------------
export async function grantConsent(db: Db, userId: string, kind: "terms" | "privacy" | "whatsapp_opt_in" | "open_finance" | "marketing", evidence: object) {
  await db.query(`insert into consents (organization_id, user_id, kind, evidence) values (app_org_id(), $1, $2, $3)`, [userId, kind, evidence]);
}

export async function hasConsent(db: Db, kind: string): Promise<boolean> {
  return !!(await maybe(db, `select 1 from consents where kind = $1 and revoked_at is null limit 1`, [kind]));
}

export async function revokeConsent(db: Db, kind: string) {
  await db.query(`update consents set revoked_at = now() where kind = $1 and revoked_at is null`, [kind]);
}

export async function audit(db: Db, actorUserId: string | null, action: string, target?: string, metadata: object = {}) {
  await db.query(`insert into audit_events (organization_id, actor_user_id, action, target, metadata) values (app_org_id(), $1, $2, $3, $4)`, [
    actorUserId,
    action,
    target ?? null,
    metadata,
  ]);
}

// ---------------------------------------------------------------------------
// Documentos, contas e lançamentos
// ---------------------------------------------------------------------------
export interface DocumentRow {
  id: string;
  kind: string;
  filename: string;
  mime: string | null;
  size_bytes: number;
  sha256: string;
  storage_key: string;
  format: string | null;
  status: "uploaded" | "processing" | "processed" | "failed" | "blocked";
  error: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

export async function insertDocument(
  db: Db,
  d: { kind: string; filename: string; mime?: string; sizeBytes: number; sha256: string; storageKey: string; format?: string; uploadedBy: string },
): Promise<{ id: string; duplicate: boolean }> {
  const existing = await maybe<{ id: string }>(db, `select id from documents where sha256 = $1`, [d.sha256]);
  if (existing) return { id: existing.id, duplicate: true };
  const r = await one<{ id: string }>(
    db,
    `insert into documents (organization_id, kind, filename, mime, size_bytes, sha256, storage_key, format, uploaded_by)
     values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [d.kind, d.filename, d.mime ?? null, d.sizeBytes, d.sha256, d.storageKey, d.format ?? null, d.uploadedBy],
  );
  return { id: r.id, duplicate: false };
}

export const getDocument = (db: Db, id: string) => maybe<DocumentRow>(db, `select * from documents where id = $1`, [id]);
export const listDocuments = (db: Db, kind?: string) =>
  many<DocumentRow>(db, `select * from documents where ($1::text is null or kind = $1) order by created_at desc limit 50`, [kind ?? null]);

export async function setDocumentStatus(db: Db, id: string, status: DocumentRow["status"], p: { error?: string; meta?: object } = {}) {
  await db.query(
    `update documents set status = $2, error = $3, meta = meta || $4::jsonb,
       processed_at = case when $2 in ('processed','failed','blocked') then now() else processed_at end
     where id = $1`,
    [id, status, p.error ?? null, JSON.stringify(p.meta ?? {})],
  );
}

export async function upsertBankAccount(db: Db, a: { accountKey: string; bankCode?: string; bankName?: string; accountMasked?: string }): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    `insert into bank_accounts (organization_id, account_key, bank_code, bank_name, account_masked)
     values (app_org_id(), $1, $2, $3, $4)
     on conflict (organization_id, account_key) do update set bank_code = coalesce(excluded.bank_code, bank_accounts.bank_code)
     returning id`,
    [a.accountKey, a.bankCode ?? null, a.bankName ?? null, a.accountMasked ?? null],
  );
  return r.id;
}

export interface TransactionInsert {
  bankAccountId: string;
  documentId: string;
  postedAt: string;
  amountCents: number;
  description: string;
  counterpartyKind: "pf" | "pj" | "unknown";
  counterpartyKey?: string;
  categoryCode: string;
  categorySource: string;
  confidence: number;
  personalSuspect: boolean;
  needsReview: boolean;
  dedupeHash: string;
  provenance: object;
}

/** Insere em lote; lançamentos já existentes (mesmo dedupe_hash) são ignorados. Retorna quantos entraram. */
export async function insertTransactions(db: Db, rows: TransactionInsert[]): Promise<number> {
  let inserted = 0;
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values: unknown[] = [];
    const tuples = part.map((r, j) => {
      const b = j * 14;
      values.push(r.bankAccountId, r.documentId, r.postedAt, r.amountCents, r.description, r.counterpartyKind, r.counterpartyKey ?? null, r.categoryCode, r.categorySource, r.confidence, r.personalSuspect, r.needsReview, r.dedupeHash, JSON.stringify(r.provenance));
      return `(app_org_id(), ${Array.from({ length: 14 }, (_, k) => `$${b + k + 1}`).join(",")})`;
    });
    const res = await db.query(
      `insert into transactions (organization_id, bank_account_id, document_id, posted_at, amount_cents, description, counterparty_kind, counterparty_key,
         category_code, category_source, confidence, personal_suspect, needs_review, dedupe_hash, provenance)
       values ${tuples.join(",")} on conflict (organization_id, dedupe_hash) do nothing`,
      values,
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

export interface TransactionRow {
  id: string;
  posted_at: string;
  amount_cents: number;
  description: string;
  counterparty_kind: string | null;
  counterparty_key: string | null;
  category_code: string;
  category_source: string;
  confidence: number;
  personal_suspect: boolean;
  needs_review: boolean;
}

export const listTransactions = (db: Db, p: { from?: string; to?: string; needsReview?: boolean; limit?: number } = {}) =>
  many<TransactionRow>(
    db,
    `select id, posted_at, amount_cents, description, counterparty_kind, counterparty_key, category_code, category_source, confidence, personal_suspect, needs_review
     from transactions
     where ($1::date is null or posted_at >= $1) and ($2::date is null or posted_at <= $2) and ($3::boolean is null or needs_review = $3)
     order by posted_at, id limit $4`,
    [p.from ?? null, p.to ?? null, p.needsReview ?? null, p.limit ?? 20_000],
  );

/** Correção do usuário: atualiza a categoria e grava a regra para o futuro. */
export async function recategorize(db: Db, transactionIds: string[], categoryCode: string, personalSuspect: boolean, rule?: OrgCategoryRule & { createdBy: string }) {
  await db.query(
    `update transactions set category_code = $2, category_source = 'user', confidence = 1, personal_suspect = $3, needs_review = false where id = any($1::uuid[])`,
    [transactionIds, categoryCode, personalSuspect],
  );
  if (rule && rule.pattern) {
    await db.query(
      `insert into category_rules (organization_id, pattern, direction, category_code, created_by) values (app_org_id(), $1, $2, $3, $4)
       on conflict (organization_id, pattern, direction) do update set category_code = excluded.category_code`,
      [rule.pattern, rule.direction ?? null, rule.categoryCode, rule.createdBy],
    );
  }
}

export const listCategoryRules = async (db: Db): Promise<OrgCategoryRule[]> =>
  (await many<{ pattern: string; direction: "inflow" | "outflow" | null; category_code: string }>(db, `select pattern, direction, category_code from category_rules`)).map((r) => ({
    pattern: r.pattern,
    direction: r.direction ?? undefined,
    categoryCode: r.category_code,
  }));

// ---------------------------------------------------------------------------
// Raio-X, indicadores, fatos
// ---------------------------------------------------------------------------
export interface RaioXRow {
  id: string;
  period_start: string;
  period_end: string;
  reconcile_status: string;
  result: any;
  narrative: string | null;
  method_version: string;
  created_at: string;
}

export async function insertRaioX(db: Db, r: { periodStart: string; periodEnd: string; reconcileStatus: string; result: object; narrative?: string; methodVersion: string }) {
  return one<{ id: string }>(
    db,
    `insert into raiox_snapshots (organization_id, period_start, period_end, reconcile_status, result, narrative, method_version)
     values (app_org_id(), $1, $2, $3, $4, $5, $6) returning id`,
    [r.periodStart, r.periodEnd, r.reconcileStatus, r.result, r.narrative ?? null, r.methodVersion],
  );
}

export const latestRaioX = (db: Db) => maybe<RaioXRow>(db, `select * from raiox_snapshots order by created_at desc limit 1`);
export const getRaioX = (db: Db, id: string) => maybe<RaioXRow>(db, `select * from raiox_snapshots where id = $1`, [id]);

export async function recordMetric(
  db: Db,
  m: { metricCode: string; periodStart: string; periodEnd: string; value: number; source: "raiox" | "manual" | "ritual" | "system"; documentId?: string; recordedBy?: string },
) {
  await db.query(
    `insert into metric_values (organization_id, metric_code, period_start, period_end, value, source, document_id, recorded_by)
     values (app_org_id(), $1, $2, $3, $4, $5, $6, $7)`,
    [m.metricCode, m.periodStart, m.periodEnd, m.value, m.source, m.documentId ?? null, m.recordedBy ?? null],
  );
}

/** Último valor de cada indicador (painel). */
export async function latestMetrics(db: Db): Promise<Record<string, { value: number; source: string; period_end: string }>> {
  const rows = await many<{ metric_code: string; value: number; source: string; period_end: string }>(
    db,
    `select distinct on (metric_code) metric_code, value, source, period_end from metric_values order by metric_code, period_end desc, created_at desc`,
  );
  return Object.fromEntries(rows.map((r) => [r.metric_code, { value: r.value, source: r.source, period_end: r.period_end }]));
}

export const metricHistory = (db: Db, metricCode: string) =>
  many<{ value: number; period_end: string; source: string }>(db, `select value, period_end, source from metric_values where metric_code = $1 order by period_end, created_at`, [metricCode]);

export async function addFact(db: Db, f: { key: string; value: unknown; factType: "provided" | "calculated" | "inferred" | "decided"; source: string; confidence?: number; createdBy?: string }) {
  await db.query(
    `insert into business_facts (organization_id, key, value, fact_type, source, confidence, created_by) values (app_org_id(), $1, $2, $3, $4, $5, $6)`,
    [f.key, JSON.stringify(f.value), f.factType, f.source, f.confidence ?? null, f.createdBy ?? null],
  );
}

export const listFacts = (db: Db) =>
  many<{ key: string; value: unknown; fact_type: string; source: string; created_at: string }>(
    db,
    `select distinct on (key) key, value, fact_type, source, created_at from business_facts order by key, created_at desc`,
  );

// ---------------------------------------------------------------------------
// Questionário e diagnóstico
// ---------------------------------------------------------------------------
export async function insertAssessment(db: Db, a: { methodVersion: string; answers: object; dimensionScores: object; maturityAvg: number | null; coverage: number; createdBy: string }) {
  return one<{ id: string }>(
    db,
    `insert into assessments (organization_id, method_version, answers, dimension_scores, maturity_avg, coverage, created_by)
     values (app_org_id(), $1, $2, $3, $4, $5, $6) returning id`,
    [a.methodVersion, a.answers, a.dimensionScores, a.maturityAvg, a.coverage, a.createdBy],
  );
}

export const latestAssessment = (db: Db) =>
  maybe<{ id: string; answers: Record<string, string>; maturity_avg: number | null; coverage: number; created_at: string }>(
    db,
    `select id, answers, maturity_avg, coverage, created_at from assessments order by created_at desc limit 1`,
  );

export interface DiagnosisRow {
  id: string;
  assessment_id: string;
  raiox_id: string | null;
  method_version: string;
  stage: string;
  coverage: number;
  confidence: number;
  sufficient: boolean;
  result: any;
  suggested_tracks: any;
  approved_at: string | null;
  created_at: string;
}

export async function insertDiagnosis(
  db: Db,
  d: { assessmentId: string; raioxId?: string; methodVersion: string; stage: string; coverage: number; confidence: number; sufficient: boolean; result: object; suggestedTracks: object },
) {
  const r = await one<{ id: string }>(
    db,
    `insert into diagnoses (organization_id, assessment_id, raiox_id, method_version, stage, coverage, confidence, sufficient, result, suggested_tracks)
     values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [d.assessmentId, d.raioxId ?? null, d.methodVersion, d.stage, d.coverage, d.confidence, d.sufficient, d.result, JSON.stringify(d.suggestedTracks)],
  );
  await db.query(`update organizations set stage = $1 where id = app_org_id()`, [d.stage]);
  return r;
}

export const latestDiagnosis = (db: Db) => maybe<DiagnosisRow>(db, `select * from diagnoses order by created_at desc limit 1`);
export const getDiagnosis = (db: Db, id: string) => maybe<DiagnosisRow>(db, `select * from diagnoses where id = $1`, [id]);

// ---------------------------------------------------------------------------
// Ciclo, prioridades, marcos e ações
// ---------------------------------------------------------------------------
export async function createCycleFromPlan(db: Db, p: { plan: CyclePlan; diagnosisId: string; ownerUserId: string; rationale: Record<string, object> }): Promise<string> {
  const active = await maybe<{ id: string }>(db, `select id from cycles where status = 'active'`);
  if (active) throw new Error("Já existe um ciclo ativo. Feche ou abandone o ciclo atual antes de iniciar outro.");
  const c = await one<{ id: string }>(
    db,
    `insert into cycles (organization_id, diagnosis_id, method_version, starts_on, ends_on) values (app_org_id(), $1, $2, $3, $4) returning id`,
    [p.diagnosisId, p.plan.methodVersion, p.plan.startsOn, p.plan.endsOn],
  );
  for (const pr of p.plan.priorities) {
    const prio = await one<{ id: string }>(
      db,
      `insert into priorities (organization_id, cycle_id, position, track_code, track_version, title, dimension, metric_code, baseline, target, owner_user_id, rationale)
       values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [c.id, pr.position, pr.trackCode, pr.trackVersion, pr.title, pr.dimension, pr.metric, pr.baseline, pr.target, p.ownerUserId, p.rationale[pr.trackCode] ?? {}],
    );
    for (const ms of pr.milestones) {
      const m = await one<{ id: string }>(
        db,
        `insert into milestones (organization_id, priority_id, code, title, week, due_date, evidence_required) values (app_org_id(), $1, $2, $3, $4, $5, $6) returning id`,
        [prio.id, ms.code, ms.title, ms.week, ms.dueDate, ms.evidence],
      );
      for (const a of ms.actions) {
        await db.query(
          `insert into actions (organization_id, priority_id, milestone_id, action_key, title, week, due_date, role, assignee_user_id)
           values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8)`,
          [prio.id, m.id, a.key, a.title, a.week, a.dueDate, a.role, a.role === "owner" ? p.ownerUserId : null],
        );
      }
    }
  }
  await db.query(`update diagnoses set approved_at = now() where id = $1`, [p.diagnosisId]);
  return c.id;
}

export interface CycleRow {
  id: string;
  status: string;
  starts_on: string;
  ends_on: string;
  method_version: string;
  closing: any;
}
export interface PriorityRow {
  id: string;
  position: number;
  track_code: string;
  title: string;
  dimension: string;
  metric_code: string;
  baseline: number | null;
  target: number | null;
  status: string;
  rationale: any;
}
export interface MilestoneRow {
  id: string;
  priority_id: string;
  code: string;
  title: string;
  week: number;
  due_date: string;
  evidence_required: string;
  status: string;
}
export interface ActionRow {
  id: string;
  priority_id: string;
  milestone_id: string | null;
  title: string;
  week: number;
  due_date: string;
  role: string;
  assignee_user_id: string | null;
  status: "todo" | "doing" | "done" | "blocked" | "skipped";
}

export interface ActiveCycle {
  cycle: CycleRow;
  priorities: (PriorityRow & { milestones: MilestoneRow[]; actions: ActionRow[] })[];
}

export async function getActiveCycle(db: Db): Promise<ActiveCycle | null> {
  const cycle = await maybe<CycleRow>(db, `select id, status, starts_on, ends_on, method_version, closing from cycles where status = 'active'`);
  if (!cycle) return null;
  const prios = await many<PriorityRow>(
    db,
    `select id, position, track_code, title, dimension, metric_code, baseline, target, status, rationale from priorities where cycle_id = $1 and status = 'active' order by position`,
    [cycle.id],
  );
  const ids = prios.map((p) => p.id);
  const ms = await many<MilestoneRow>(db, `select * from milestones where priority_id = any($1::uuid[]) order by week`, [ids]);
  const acts = await many<ActionRow>(db, `select * from actions where priority_id = any($1::uuid[]) order by week, action_key`, [ids]);
  return {
    cycle,
    priorities: prios.map((p) => ({ ...p, milestones: ms.filter((m) => m.priority_id === p.id), actions: acts.filter((a) => a.priority_id === p.id) })),
  };
}

export async function setActionStatus(db: Db, actionId: string, status: ActionRow["status"], evidence?: string) {
  await db.query(
    `update actions set status = $2, evidence = coalesce($3, evidence), done_at = case when $2 = 'done' then now() else null end where id = $1`,
    [actionId, status, evidence ?? null],
  );
  // Marco concluído quando todas as suas ações estão feitas.
  await db.query(
    `update milestones m set status = 'done', completed_at = now()
     where m.id = (select milestone_id from actions where id = $1)
       and not exists (select 1 from actions a where a.milestone_id = m.id and a.status not in ('done','skipped'))`,
    [actionId],
  );
}

export async function setPriorityBaseline(db: Db, priorityId: string, baseline: number, target: number | null) {
  await db.query(`update priorities set baseline = $2, target = coalesce(target, $3) where id = $1`, [priorityId, baseline, target]);
}

export async function replacePriority(db: Db, priorityId: string, reason: string) {
  await db.query(`update priorities set status = 'replaced', replaced_reason = $2 where id = $1`, [priorityId, reason]);
}

export async function closeCycleRow(db: Db, cycleId: string, closing: object) {
  await db.query(`update cycles set status = 'closed', closing = $2, closed_at = now() where id = $1`, [cycleId, closing]);
}

export const listCycles = (db: Db) => many<CycleRow>(db, `select id, status, starts_on, ends_on, method_version, closing from cycles order by starts_on desc`);

export async function lateMilestones(db: Db, today: string) {
  return many<{ title: string; due_date: string }>(
    db,
    `select m.title, m.due_date from milestones m join priorities p on p.id = m.priority_id join cycles c on c.id = p.cycle_id
     where c.status = 'active' and m.status = 'open' and m.due_date < $1 order by m.due_date`,
    [today],
  );
}

// ---------------------------------------------------------------------------
// Ritual e mensagens
// ---------------------------------------------------------------------------
export interface RitualSessionRow {
  id: string;
  cycle_id: string;
  week: number;
  channel: "whatsapp" | "web" | "email";
  status: "scheduled" | "sent" | "in_progress" | "answered" | "missed";
  scheduled_for: string;
  sent_at: string | null;
  answered_at: string | null;
  questions: any[];
  answers: Record<string, string>;
  outcome: any;
}

export async function upsertRitualSession(db: Db, r: { cycleId: string; week: number; channel: string; scheduledFor: string; questions: object[] }) {
  return one<RitualSessionRow>(
    db,
    `insert into ritual_sessions (organization_id, cycle_id, week, channel, scheduled_for, questions)
     values (app_org_id(), $1, $2, $3, $4, $5)
     on conflict (cycle_id, week) do update set questions = case when ritual_sessions.status in ('scheduled') then excluded.questions else ritual_sessions.questions end
     returning *`,
    [r.cycleId, r.week, r.channel, r.scheduledFor, JSON.stringify(r.questions)],
  );
}

export const getRitualSession = (db: Db, id: string) => maybe<RitualSessionRow>(db, `select * from ritual_sessions where id = $1`, [id]);
export const currentRitualSession = (db: Db, cycleId: string, week: number) =>
  maybe<RitualSessionRow>(db, `select * from ritual_sessions where cycle_id = $1 and week = $2`, [cycleId, week]);
export const openRitualSession = (db: Db) =>
  maybe<RitualSessionRow>(db, `select * from ritual_sessions where status in ('sent','in_progress') order by scheduled_for desc limit 1`);

export async function updateRitualSession(db: Db, id: string, p: { status?: RitualSessionRow["status"]; answers?: object; outcome?: object; durationSeconds?: number }) {
  await db.query(
    `update ritual_sessions set
       status = coalesce($2, status),
       answers = answers || coalesce($3::jsonb, '{}'::jsonb),
       outcome = coalesce($4::jsonb, outcome),
       duration_seconds = coalesce($5, duration_seconds),
       sent_at = case when $2 = 'sent' then now() else sent_at end,
       answered_at = case when $2 = 'answered' then now() else answered_at end
     where id = $1`,
    [id, p.status ?? null, p.answers ? JSON.stringify(p.answers) : null, p.outcome ? JSON.stringify(p.outcome) : null, p.durationSeconds ?? null],
  );
}

/** Semanas seguidas sem resposta (para o alerta RF14). */
export async function missedRitualsInRow(db: Db, cycleId: string): Promise<number> {
  const rows = await many<{ status: string }>(db, `select status from ritual_sessions where cycle_id = $1 and status <> 'scheduled' order by week desc`, [cycleId]);
  let n = 0;
  for (const r of rows) {
    if (r.status === "answered") break;
    if (r.status === "missed" || r.status === "sent") n++;
  }
  return n;
}

export async function ritualStats(db: Db, cycleId: string) {
  return one<{ sent: number; answered: number }>(
    db,
    `select count(*) filter (where status <> 'scheduled')::int as sent, count(*) filter (where status = 'answered')::int as answered from ritual_sessions where cycle_id = $1`,
    [cycleId],
  );
}

export async function insertMessage(
  db: Db,
  m: { channel: "whatsapp" | "email" | "web"; direction: "outbound" | "inbound"; userId?: string; template?: string; body?: string; payload?: object; providerMessageId?: string; status?: string; ritualSessionId?: string },
) {
  await db.query(
    `insert into messages (organization_id, channel, direction, user_id, template, body, payload, provider_message_id, status, ritual_session_id)
     values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [m.channel, m.direction, m.userId ?? null, m.template ?? null, m.body ?? null, m.payload ?? {}, m.providerMessageId ?? null, m.status ?? "queued", m.ritualSessionId ?? null],
  );
}

export async function updateMessageStatus(db: Db, providerMessageId: string, status: string) {
  await db.query(`update messages set status = $2 where provider_message_id = $1`, [providerMessageId, status]);
}

// ---------------------------------------------------------------------------
// Recomendações, assinatura e custo de IA
// ---------------------------------------------------------------------------
export async function insertRecommendation(
  db: Db,
  r: { kind: string; competency?: string; question?: string; content: string; sources: object[]; confidence?: number; status?: string; methodVersion: string; promptVersion?: string },
) {
  return one<{ id: string }>(
    db,
    `insert into recommendations (organization_id, kind, competency, question, content, sources, confidence, status, method_version, prompt_version)
     values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [r.kind, r.competency ?? null, r.question ?? null, r.content, JSON.stringify(r.sources), r.confidence ?? null, r.status ?? "shown", r.methodVersion, r.promptVersion ?? null],
  );
}

export const listRecommendations = (db: Db, kind: string, limit = 30) =>
  many<{ id: string; question: string | null; content: string; sources: any; confidence: number | null; status: string; created_at: string }>(
    db,
    `select id, question, content, sources, confidence, status, created_at from recommendations where kind = $1 order by created_at desc limit $2`,
    [kind, limit],
  );

export async function setRecommendationFeedback(db: Db, id: string, status: "accepted" | "rejected", feedback?: string) {
  await db.query(`update recommendations set status = $2, feedback = $3 where id = $1`, [id, status, feedback ?? null]);
}

export interface SubscriptionRow {
  plan_code: "start" | "pro" | "scale";
  billing_cycle: "monthly" | "annual";
  status: "pending" | "active" | "past_due" | "canceled";
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  checkout_url: string | null;
  current_period_end: string | null;
}

export const getSubscription = (db: Db) => maybe<SubscriptionRow>(db, `select * from subscriptions`);

export async function upsertSubscription(db: Db, s: Partial<SubscriptionRow> & Pick<SubscriptionRow, "plan_code" | "billing_cycle" | "status" | "provider">) {
  await db.query(
    `insert into subscriptions (organization_id, plan_code, billing_cycle, status, provider, provider_customer_id, provider_subscription_id, checkout_url, current_period_end)
     values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (organization_id) do update set plan_code = excluded.plan_code, billing_cycle = excluded.billing_cycle, status = excluded.status,
       provider = excluded.provider, provider_customer_id = coalesce(excluded.provider_customer_id, subscriptions.provider_customer_id),
       provider_subscription_id = coalesce(excluded.provider_subscription_id, subscriptions.provider_subscription_id),
       checkout_url = coalesce(excluded.checkout_url, subscriptions.checkout_url),
       current_period_end = coalesce(excluded.current_period_end, subscriptions.current_period_end),
       canceled_at = case when excluded.status = 'canceled' then now() else null end`,
    [s.plan_code, s.billing_cycle, s.status, s.provider, s.provider_customer_id ?? null, s.provider_subscription_id ?? null, s.checkout_url ?? null, s.current_period_end ?? null],
  );
}

export async function logAiCall(
  db: Db,
  l: { task: string; provider: string; model: string; promptVersion: string; inputTokens: number; outputTokens: number; costMicroBrl: number; latencyMs: number; guardStatus: string; error?: string },
) {
  await db.query(
    `insert into ai_call_logs (organization_id, task, provider, model, prompt_version, input_tokens, output_tokens, cost_micro_brl, latency_ms, guard_status, error)
     values (app_org_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [l.task, l.provider, l.model, l.promptVersion, l.inputTokens, l.outputTokens, l.costMicroBrl, l.latencyMs, l.guardStatus, l.error ?? null],
  );
}

/** Custo de IA do mês corrente em centavos (para o teto por plano). */
export async function aiCostThisMonthCents(db: Db): Promise<number> {
  const r = await one<{ micro: number }>(
    db,
    `select coalesce(sum(cost_micro_brl), 0)::bigint as micro from ai_call_logs where organization_id = app_org_id() and created_at >= date_trunc('month', now())`,
  );
  return Math.ceil(r.micro / 10_000);
}

// ---------------------------------------------------------------------------
// Exportação (RF17)
// ---------------------------------------------------------------------------
export async function exportOrganizationData(db: Db): Promise<Record<string, unknown[]>> {
  const tables = ["organizations", "documents", "transactions", "category_rules", "raiox_snapshots", "business_facts", "metric_values", "assessments", "diagnoses", "cycles", "priorities", "milestones", "actions", "ritual_sessions", "recommendations", "subscriptions", "consents"];
  const out: Record<string, unknown[]> = {};
  for (const t of tables) out[t] = (await db.query(`select * from ${t}`)).rows;
  // Não exporta data_salt (segredo técnico).
  out.organizations = out.organizations!.map((o: any) => ({ ...o, data_salt: undefined }));
  return out;
}
