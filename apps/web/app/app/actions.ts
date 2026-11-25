"use server";
/**
 * Server actions do app. Regras: toda ação exige sessão + organização ativa; nenhuma regra de negócio aqui —
 * só validação de entrada e chamada aos serviços (@beos/services).
 */
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { checkEligibility, isValidCnpj, normalizeCnpj, type RevenueBand } from "@beos/core";
import { emailFromEnv, toE164BR } from "@beos/channels";
import { identity, repo, withSystem, withTenant } from "@beos/db";
import {
  applyBillingEvent, approvePlan, askAdvisor, cancelSubscription, closeActiveCycle, correctCategory, deleteOrganization, enqueue,
  prepareRitual, processStatement, QUEUES, replacePriority, runDiagnosis, saveAssessment, saveManualMetrics, startCheckout, submitRitual,
  uploadStatement,
} from "@beos/services";
import { requireOrg, requireSession } from "@/lib/session";

const back = (path: string, p: { ok?: string; erro?: string }) => {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
  redirect(`${path}${q.size ? `?${q}` : ""}`);
};
const err = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");

export async function switchOrg(form: FormData) {
  const s = await requireSession();
  await withSystem((db) => identity.setActiveOrg(db, s.sessionId, s.user.id, String(form.get("orgId"))));
  redirect("/app");
}

// ---------------------------------------------------------------------------
// Onboarding (J03)
// ---------------------------------------------------------------------------
export async function createCompany(form: FormData) {
  const s = await requireSession();
  const cnpj = normalizeCnpj(String(form.get("cnpj") ?? ""));
  const band = String(form.get("revenueBand")) as RevenueBand;
  const teamSize = Number(form.get("teamSize") ?? 0);
  const monthsActive = Number(form.get("monthsActive") ?? 0);
  const phone = toE164BR(String(form.get("phone") ?? ""));
  if (!isValidCnpj(cnpj)) back("/app/onboarding", { erro: "CNPJ inválido. Confira os números (e letras, no novo formato)." });
  if (form.get("terms") !== "on") back("/app/onboarding", { erro: "Para continuar, aceite os termos de uso e a política de privacidade." });
  const el = checkEligibility({ band, monthsActive, teamSize, isMei: form.get("isMei") === "on" });
  if (!el.eligible) back("/app/onboarding", { erro: el.reason });
  let orgId = "";
  try {
    orgId = await withSystem(async (db) => {
      const id = await identity.createOrganization(db, s.user.id, {
        cnpj,
        tradeName: String(form.get("tradeName") ?? "").trim().slice(0, 120) || "Minha empresa",
        revenueBand: band,
        teamSize,
        sector: String(form.get("sector") ?? "") || undefined,
        uf: String(form.get("uf") ?? "").toUpperCase().slice(0, 2) || undefined,
        city: String(form.get("city") ?? "") || undefined,
      });
      await identity.updateUserProfile(db, s.user.id, { name: String(form.get("name") ?? "") || undefined, phone: phone ?? undefined });
      await identity.setActiveOrg(db, s.sessionId, s.user.id, id);
      return id;
    });
  } catch (e) {
    unstable_rethrow(e);
    back("/app/onboarding", { erro: /duplicate key/.test(err(e)) ? "Este CNPJ já está cadastrado. Peça ao dono da conta para convidar você." : err(e) });
  }
  await withTenant(orgId, async (db) => {
    const evidence = { at: new Date().toISOString(), version: "termos-2026-11" };
    await repo.grantConsent(db, s.user.id, "terms", evidence);
    await repo.grantConsent(db, s.user.id, "privacy", evidence);
    if (phone && form.get("whatsappOptIn") === "on") await repo.grantConsent(db, s.user.id, "whatsapp_opt_in", { ...evidence, phone });
    await repo.updateOrganization(db, {
      ritual_weekday: Number(form.get("ritualWeekday") ?? 1),
      ritual_time: String(form.get("ritualTime") ?? "08:30"),
      ritual_channel: phone && form.get("whatsappOptIn") === "on" ? "whatsapp" : "email",
    });
    await repo.audit(db, s.user.id, "organization.created");
  });
  redirect("/app/raio-x");
}

// ---------------------------------------------------------------------------
// Raio-X (J02)
// ---------------------------------------------------------------------------
export async function uploadStatementAction(form: FormData) {
  const s = await requireOrg();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) back("/app/raio-x", { erro: "Escolha o arquivo do extrato." });
  const f = file as File;
  try {
    const up = await uploadStatement(s.orgId, s.user.id, { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type });
    if (up.duplicate) back("/app/raio-x", { ok: up.message });
    if (process.env.PROCESS_INLINE === "true") {
      const r = await processStatement(s.orgId, up.documentId);
      revalidatePath("/app");
      back("/app/raio-x", r.status === "processed" ? { ok: `Pronto! ${r.message}` } : { erro: r.message });
    }
    await enqueue(QUEUES.statement, { orgId: s.orgId, documentId: up.documentId }, { singletonKey: up.documentId });
    back("/app/raio-x", { ok: "Recebemos o extrato. O Raio-X fica pronto em instantes." });
  } catch (e) {
    unstable_rethrow(e);
    back("/app/raio-x", { erro: err(e) });
  }
}

export async function recategorizeAction(form: FormData) {
  const s = await requireOrg();
  await correctCategory(s.orgId, s.user.id, String(form.get("transactionId")), String(form.get("categoryCode")));
  revalidatePath("/app/raio-x");
  back("/app/raio-x/lancamentos", { ok: "Categoria corrigida. Lançamentos parecidos também foram ajustados." });
}

// ---------------------------------------------------------------------------
// Diagnóstico e plano (J04–J05)
// ---------------------------------------------------------------------------
export async function submitAssessment(form: FormData) {
  const s = await requireOrg();
  const answers: Record<string, string> = {};
  const manual: Record<string, number> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("q_") && typeof v === "string" && v) answers[k.slice(2)] = v;
    if (k.startsWith("m_") && typeof v === "string" && v.trim()) {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n)) manual[k.slice(2)] = n;
    }
  }
  try {
    await saveAssessment(s.orgId, s.user.id, answers);
    await saveManualMetrics(s.orgId, s.user.id, manual);
    await runDiagnosis(s.orgId);
  } catch (e) {
    unstable_rethrow(e);
    back("/app/diagnostico", { erro: err(e) });
  }
  revalidatePath("/app");
  redirect("/app/diagnostico");
}

export async function rerunDiagnosis() {
  const s = await requireOrg();
  try {
    await runDiagnosis(s.orgId);
  } catch (e) {
    unstable_rethrow(e);
    back("/app/diagnostico", { erro: err(e) });
  }
  redirect("/app/diagnostico");
}

export async function approvePlanAction(form: FormData) {
  const s = await requireOrg();
  const tracks = form.getAll("track").map(String).slice(0, 4);
  if (tracks.length > 3) back("/app/diagnostico", { erro: "Escolha no máximo 3 prioridades." });
  try {
    await approvePlan(s.orgId, s.user.id, String(form.get("diagnosisId")), tracks);
  } catch (e) {
    unstable_rethrow(e);
    back("/app/diagnostico", { erro: err(e) });
  }
  revalidatePath("/app");
  redirect("/app/plano?ok=" + encodeURIComponent("Plano de 90 dias criado. A primeira ação já está no cockpit."));
}

export async function setActionStatusAction(form: FormData) {
  const s = await requireOrg();
  const status = String(form.get("status")) as "todo" | "doing" | "done";
  if (!["todo", "doing", "done"].includes(status)) return;
  await withTenant(s.orgId, (db) => repo.setActionStatus(db, String(form.get("actionId")), status));
  revalidatePath("/app/plano");
  revalidatePath("/app");
}

export async function replacePriorityAction(form: FormData) {
  const s = await requireOrg();
  try {
    await replacePriority(s.orgId, s.user.id, String(form.get("priorityId")), String(form.get("reason") ?? ""));
  } catch (e) {
    unstable_rethrow(e);
    back("/app/plano", { erro: err(e) });
  }
  back("/app/plano", { ok: "Prioridade retirada. Escolha a substituta no diagnóstico." });
}

export async function closeCycleAction() {
  const s = await requireOrg();
  try {
    await closeActiveCycle(s.orgId, s.user.id);
  } catch (e) {
    unstable_rethrow(e);
    back("/app/plano", { erro: err(e) });
  }
  redirect("/app/relatorios/fechamento");
}

// ---------------------------------------------------------------------------
// Ritual (J06) e Advisor (J07)
// ---------------------------------------------------------------------------
export async function startWebRitual() {
  const s = await requireOrg();
  await prepareRitual(s.orgId, undefined, "web");
  redirect("/app/ritual");
}

export async function submitRitualAction(form: FormData) {
  const s = await requireOrg();
  try {
    const out = await submitRitual(
      s.orgId,
      String(form.get("sessionId")),
      { action: String(form.get("action") ?? "") || undefined, metric: String(form.get("metric") ?? "") || undefined, blocker: String(form.get("blocker") ?? "") || undefined },
      s.user.id,
    );
    revalidatePath("/app");
    back("/app/ritual", { ok: out.summary });
  } catch (e) {
    unstable_rethrow(e);
    back("/app/ritual", { erro: err(e) });
  }
}

export async function askAdvisorAction(form: FormData) {
  const s = await requireOrg();
  try {
    await askAdvisor(s.orgId, s.user.id, String(form.get("question") ?? ""));
  } catch (e) {
    unstable_rethrow(e);
    back("/app/advisor", { erro: err(e) });
  }
  revalidatePath("/app/advisor");
  redirect("/app/advisor");
}

export async function advisorFeedback(form: FormData) {
  const s = await requireOrg();
  const status = form.get("status") === "accepted" ? "accepted" : "rejected";
  await withTenant(s.orgId, (db) => repo.setRecommendationFeedback(db, String(form.get("id")), status));
  revalidatePath("/app/advisor");
}

// ---------------------------------------------------------------------------
// Configurações, equipe, assinatura e LGPD
// ---------------------------------------------------------------------------
export async function saveSettings(form: FormData) {
  const s = await requireOrg();
  const phone = toE164BR(String(form.get("phone") ?? ""));
  const optIn = form.get("whatsappOptIn") === "on";
  await withSystem((db) => identity.updateUserProfile(db, s.user.id, { name: String(form.get("name") ?? "") || undefined, phone: phone ?? undefined }));
  await withTenant(s.orgId, async (db) => {
    await repo.updateOrganization(db, {
      ritual_weekday: Number(form.get("ritualWeekday")),
      ritual_time: String(form.get("ritualTime")),
      ritual_channel: optIn && phone ? "whatsapp" : (String(form.get("ritualChannel")) as "web" | "email"),
      team_size: Number(form.get("teamSize")) || undefined,
    });
    const had = await repo.hasConsent(db, "whatsapp_opt_in");
    if (optIn && phone && !had) await repo.grantConsent(db, s.user.id, "whatsapp_opt_in", { at: new Date().toISOString(), phone });
    if (!optIn && had) await repo.revokeConsent(db, "whatsapp_opt_in");
    await repo.audit(db, s.user.id, "settings.updated");
  });
  back("/app/configuracoes", { ok: "Preferências salvas." });
}

export async function inviteMember(form: FormData) {
  const s = await requireOrg();
  if (s.role !== "owner" && s.role !== "manager") back("/app/configuracoes", { erro: "Só o dono ou gestores podem convidar." });
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = form.get("role") === "manager" ? "manager" : "member";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("/app/configuracoes", { erro: "E-mail inválido." });
  await withSystem((db) => identity.addMember(db, s.orgId, email, role));
  const org = await withTenant(s.orgId, async (db) => {
    await repo.audit(db, s.user.id, "member.invited", email, { role });
    return repo.getOrganization(db);
  });
  await emailFromEnv().send({
    to: email,
    subject: `${s.user.name ?? s.user.email} convidou você para o plano da ${org.trade_name}`,
    text: `Você foi adicionado à ${org.trade_name} no Business Evolution OS. Entre com este e-mail em ${process.env.APP_URL ?? "http://localhost:3000"}/entrar (sem senha: enviamos um código).`,
  });
  back("/app/configuracoes", { ok: `${email} foi adicionado. A pessoa entra com o próprio e-mail.` });
}

export async function checkoutAction(form: FormData) {
  const s = await requireOrg();
  let url = "";
  try {
    url = await startCheckout(s.orgId, { id: s.user.id, email: s.user.email }, form.get("cycle") === "annual" ? "annual" : "monthly");
  } catch (e) {
    unstable_rethrow(e);
    back("/app/configuracoes", { erro: err(e) });
  }
  redirect(url);
}

export async function simulatePayment(form: FormData) {
  const s = await requireOrg();
  if ((process.env.BILLING_PROVIDER ?? "mock") !== "mock") back("/app/configuracoes", { erro: "Simulação disponível só em desenvolvimento." });
  await applyBillingEvent({ type: "activated", organizationId: s.orgId, subscriptionId: String(form.get("subscriptionId")), raw: "mock" });
  back("/app/configuracoes", { ok: "Pagamento simulado: assinatura ativa." });
}

export async function cancelSubscriptionAction() {
  const s = await requireOrg();
  if (s.role !== "owner") back("/app/configuracoes", { erro: "Só o dono pode cancelar a assinatura." });
  await cancelSubscription(s.orgId, s.user.id);
  back("/app/configuracoes", { ok: "Assinatura cancelada." });
}

export async function deleteCompanyAction(form: FormData) {
  const s = await requireOrg();
  const org = await withTenant(s.orgId, (db) => repo.getOrganization(db));
  if (normalizeCnpj(String(form.get("confirmCnpj") ?? "")) !== org.cnpj) back("/app/configuracoes", { erro: "Digite o CNPJ da empresa para confirmar a exclusão." });
  try {
    await deleteOrganization(s.orgId, s.user.id);
  } catch (e) {
    unstable_rethrow(e);
    back("/app/configuracoes", { erro: err(e) });
  }
  redirect("/app/onboarding?ok=" + encodeURIComponent("Os dados da empresa foram excluídos."));
}
