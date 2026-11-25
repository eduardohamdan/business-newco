import { categorizeWithAi, narrateRaioX } from "@beos/ai";
import {
  addDays, categorize, computeRaioX, dedupeHashes, normalizeText, parseStatementFile, reconcile, ruleFromCorrection, sanitizeDescription,
  sniffFormat, StatementParseError, type ParsedStatement, type RaioX,
} from "@beos/core";
import { repo, withTenant } from "@beos/db";
import { getCategory, methodVersion } from "@beos/method";
import { aiFor } from "./ai";
import { getStorage, sha256 } from "./storage";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["ofx", "csv", "pdf"] as const;

export interface UploadResult {
  documentId: string;
  duplicate: boolean;
  status: string;
  message?: string;
}

/** RF02 — recebe o extrato, guarda o arquivo e (opcionalmente) processa na hora. */
export async function uploadStatement(orgId: string, userId: string, file: { name: string; bytes: Uint8Array; mime?: string }): Promise<UploadResult> {
  if (file.bytes.length === 0) throw new Error("Arquivo vazio.");
  if (file.bytes.length > MAX_BYTES) throw new Error("Arquivo maior que 15 MB.");
  const format = sniffFormat(file.name, file.bytes);
  if (!ALLOWED.includes(format as never)) throw new Error("Formato não suportado. Envie OFX, CSV ou PDF do extrato.");
  const hash = sha256(file.bytes);
  const key = `orgs/${orgId}/statements/${hash}.${format}`;
  await (await getStorage()).put(key, file.bytes, file.mime);
  const doc = await withTenant(orgId, async (db) => {
    const d = await repo.insertDocument(db, { kind: "bank_statement", filename: file.name.slice(0, 200), mime: file.mime, sizeBytes: file.bytes.length, sha256: hash, storageKey: key, format, uploadedBy: userId });
    if (!d.duplicate) await repo.audit(db, userId, "document.uploaded", d.id, { format });
    return d;
  });
  if (doc.duplicate) return { documentId: doc.id, duplicate: true, status: "processed", message: "Este arquivo já tinha sido enviado." };
  return { documentId: doc.id, duplicate: false, status: "uploaded" };
}

async function extractPdf(bytes: Uint8Array, filename: string): Promise<ParsedStatement> {
  const url = process.env.PDF_EXTRACTOR_URL;
  if (!url) throw new StatementParseError("Leitura de PDF indisponível no momento. Envie o extrato em OFX ou CSV.");
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: "application/pdf" }), filename);
  const res = await fetch(`${url}/extract`, { method: "POST", body: form }).catch(() => null);
  if (!res || !res.ok) throw new StatementParseError("Não conseguimos ler este PDF. Envie o extrato em OFX ou CSV, se possível.");
  const j: any = await res.json();
  return {
    format: "pdf",
    currency: "BRL",
    bankName: j.bank_name ?? undefined,
    periodStart: j.period_start ?? undefined,
    periodEnd: j.period_end ?? undefined,
    openingBalanceCents: j.opening_balance_cents ?? undefined,
    closingBalanceCents: j.closing_balance_cents ?? undefined,
    warnings: j.warnings ?? [],
    transactions: (j.transactions ?? []).map((t: any) => ({ postedAt: t.posted_at, amountCents: t.amount_cents, description: t.description, balanceAfterCents: t.balance_after_cents ?? undefined, provenance: { page: t.page, line: t.line } })),
  };
}

export interface ProcessResult {
  status: "processed" | "blocked" | "failed";
  message: string;
  inserted?: number;
  raioxId?: string;
}

/** Processa um extrato: parsing → conciliação → LGPD → categorização (regras + IA) → lançamentos → Raio-X. */
export async function processStatement(orgId: string, documentId: string): Promise<ProcessResult> {
  const { doc, org, rules } = await withTenant(orgId, async (db) => ({
    doc: await repo.getDocument(db, documentId),
    org: await repo.getOrganization(db),
    rules: await repo.listCategoryRules(db),
  }));
  if (!doc) throw new Error("Documento não encontrado");
  await withTenant(orgId, (db) => repo.setDocumentStatus(db, documentId, "processing"));
  try {
    const bytes = await (await getStorage()).get(doc.storage_key);
    const st = doc.format === "pdf" ? await extractPdf(bytes, doc.filename) : parseStatementFile(doc.filename, bytes);
    const rec = reconcile(st);
    if (rec.status === "mismatch") {
      const message = `${rec.message} Diferença de ${(rec.diffCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;
      await withTenant(orgId, (db) => repo.setDocumentStatus(db, documentId, "blocked", { error: message, meta: { reconcile: rec } }));
      return { status: "blocked", message };
    }
    const accountKey = sha256(new TextEncoder().encode(`${org.data_salt}:${st.bankId ?? st.bankName ?? "banco"}:${st.accountId ?? doc.filename}`)).slice(0, 24);
    const hashes = dedupeHashes(accountKey, st.transactions);
    const rows = st.transactions.map((t, i) => {
      const s = sanitizeDescription(t.description, org.data_salt);
      const c = categorize({ amountCents: t.amountCents, description: s.description, counterpartyKind: s.counterparty.kind }, rules);
      return {
        postedAt: t.postedAt,
        amountCents: t.amountCents,
        description: s.description,
        counterpartyKind: s.counterparty.kind,
        counterpartyKey: s.counterparty.docHash ?? s.counterparty.name,
        categoryCode: c.categoryCode,
        categorySource: c.source as string,
        confidence: c.confidence,
        personalSuspect: c.personalSuspect,
        needsReview: c.needsReview,
        dedupeHash: hashes[i]!,
        provenance: { ...t.provenance, document: documentId },
      };
    });

    // IA só para o que as regras não resolveram (com teto de custo do plano).
    const pending = rows.map((r, i) => ({ id: String(i), description: r.description, amountCents: r.amountCents, needs: r.needsReview })).filter((r) => r.needs);
    if (pending.length) {
      try {
        const gw = await aiFor(orgId);
        for (const s of await categorizeWithAi(gw, pending)) {
          const r = rows[Number(s.id)]!;
          if (s.confidence >= 0.6) Object.assign(r, { categoryCode: s.categoryCode, categorySource: "model", confidence: s.confidence, needsReview: s.confidence < 0.7 });
        }
      } catch (e) {
        console.warn("[statement] categorização por IA indisponível:", (e as Error).message);
      }
    }

    const inserted = await withTenant(orgId, async (db) => {
      const accId = await repo.upsertBankAccount(db, { accountKey, bankCode: st.bankId, bankName: st.bankName, accountMasked: st.accountId ? `****${st.accountId.slice(-3)}` : undefined });
      return repo.insertTransactions(db, rows.map((r) => ({ ...r, bankAccountId: accId, documentId, counterpartyKind: r.counterpartyKind })));
    });
    await withTenant(orgId, (db) =>
      repo.setDocumentStatus(db, documentId, "processed", { meta: { reconcile: rec, warnings: st.warnings, periodStart: st.periodStart, periodEnd: st.periodEnd, transactions: st.transactions.length, inserted } }),
    );
    const raioxId = await rebuildRaioX(orgId);
    return { status: "processed", message: `${inserted} lançamentos importados.`, inserted, raioxId };
  } catch (e) {
    const message = e instanceof StatementParseError ? e.message : "Não foi possível processar o arquivo.";
    await withTenant(orgId, (db) => repo.setDocumentStatus(db, documentId, "failed", { error: message }));
    if (!(e instanceof StatementParseError)) console.error("[statement] erro", e);
    return { status: "failed", message };
  }
}

/** Recalcula o Raio-X com os últimos 6 meses de lançamentos e grava os indicadores. */
export async function rebuildRaioX(orgId: string): Promise<string | undefined> {
  const { txns, docs } = await withTenant(orgId, async (db) => ({ txns: await repo.listTransactions(db), docs: await repo.listDocuments(db, "bank_statement") }));
  if (!txns.length) return undefined;
  const end = txns.at(-1)!.posted_at;
  const start = addDays(end, -183);
  const window = txns.filter((t) => t.posted_at >= start);
  // Saldo final: do extrato processado mais recente com saldo conhecido.
  const lastWithBalance = docs.find((d) => d.status === "processed" && (d.meta as any)?.reconcile?.closingCents !== undefined);
  const reconcileMeta = (lastWithBalance?.meta as any)?.reconcile ?? { status: "unverifiable", movementCents: 0, diffCents: 0, message: "" };
  const rx: RaioX = computeRaioX(
    window.map((t) => ({ postedAt: t.posted_at, amountCents: t.amount_cents, categoryCode: t.category_code, confidence: t.confidence, personalSuspect: t.personal_suspect, counterpartyKey: t.counterparty_key ?? undefined })),
    { reconcile: reconcileMeta, closingBalanceCents: reconcileMeta.closingCents },
  );
  let narrative: string | undefined;
  try {
    narrative = await narrateRaioX(await aiFor(orgId), rx);
  } catch (e) {
    console.warn("[raiox] narrativa indisponível:", (e as Error).message);
  }
  return withTenant(orgId, async (db) => {
    const snap = await repo.insertRaioX(db, { periodStart: rx.periodStart, periodEnd: rx.periodEnd, reconcileStatus: reconcileMeta.status, result: rx, narrative, methodVersion: methodVersion() });
    for (const [code, m] of Object.entries(rx.metrics)) {
      if (m.value !== null) await repo.recordMetric(db, { metricCode: code, periodStart: rx.periodStart, periodEnd: rx.periodEnd, value: m.value, source: "raiox" });
    }
    return snap.id;
  });
}

/** Correção do usuário (vira regra da organização) e recálculo. */
export async function correctCategory(orgId: string, userId: string, transactionId: string, categoryCode: string) {
  const cat = getCategory(categoryCode);
  await withTenant(orgId, async (db) => {
    const t = (await db.query(`select description, amount_cents from transactions where id = $1`, [transactionId])).rows[0];
    if (!t) throw new Error("Lançamento não encontrado");
    const rule = ruleFromCorrection(t.description, categoryCode, Number(t.amount_cents));
    // Aplica a todos os lançamentos parecidos (mesma regra) ainda não corrigidos pelo usuário.
    const similar = (
      await db.query(`select id, description from transactions where category_source <> 'user' and sign(amount_cents) = sign($1::bigint)`, [t.amount_cents])
    ).rows.filter((r: any) => rule.pattern && rule.pattern.split(" ").every((tk: string) => normalizeText(r.description).includes(tk)));
    const ids = [...new Set([transactionId, ...similar.map((r: any) => r.id)])];
    await repo.recategorize(db, ids, categoryCode, cat.group === "pessoal_suspeito", { ...rule, createdBy: userId });
    await repo.audit(db, userId, "transaction.recategorized", transactionId, { categoryCode, affected: ids.length });
  });
  await rebuildRaioX(orgId);
}
