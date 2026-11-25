import { interpretRitualReply } from "@beos/ai";
import { isNoBlocker, parseActionReply, parseMetricReply } from "@beos/core";
import { evaluateAlerts, getActionTitle, applyRitual, buildRitualQuestions, computeTarget, cycleWeek, type RitualPriority, type RitualQuestion } from "./ritual-core";
import { emailFromEnv, renderTemplate, whatsappFromEnv, type InboundEvent } from "@beos/channels";
import { identity, repo, withSystem, withTenant, type ActiveCycle } from "@beos/db";
import { getMetric, getTrack } from "@beos/method";
import { aiFor } from "./ai";

export { cycleWeek };

function toRitualPriorities(c: ActiveCycle): RitualPriority[] {
  return c.priorities.map((p) => ({
    id: p.id,
    title: p.title,
    metric: p.metric_code,
    target: p.target,
    baseline: p.baseline,
    lastValue: null,
    actions: p.actions.map((a) => ({ id: a.id, priorityId: p.id, title: a.title, week: a.week, status: a.status })),
  }));
}

/** Cria (ou reaproveita) a sessão de ritual da semana com as perguntas calculadas. */
export async function prepareRitual(orgId: string, today = new Date().toISOString().slice(0, 10), channel?: "whatsapp" | "web" | "email") {
  return withTenant(orgId, async (db) => {
    const cycle = await repo.getActiveCycle(db);
    if (!cycle) return null;
    const week = Math.max(1, cycleWeek(cycle.cycle.starts_on, today));
    const org = await repo.getOrganization(db);
    const questions = buildRitualQuestions(toRitualPriorities(cycle), week);
    const session = await repo.upsertRitualSession(db, { cycleId: cycle.cycle.id, week, channel: channel ?? org.ritual_channel, scheduledFor: new Date().toISOString(), questions });
    return { session, cycle, week, org };
  });
}

/** Envia o ritual pelo canal da organização (WhatsApp com template aprovado; e-mail como alternativa). */
export async function sendRitual(orgId: string, today?: string) {
  const prep = await prepareRitual(orgId, today);
  if (!prep || prep.session.status !== "scheduled") return { sent: false, reason: prep ? "já enviado" : "sem ciclo ativo" };
  const owner = await withSystem(async (db) => (await identity.listMembers(db, orgId)).find((m) => m.role === "owner"));
  if (!owner) return { sent: false, reason: "sem dono" };
  const first = prep.session.questions.find((q: RitualQuestion) => q.id === "action");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const hasOptIn = await withTenant(orgId, (db) => repo.hasConsent(db, "whatsapp_opt_in"));
  if (prep.org.ritual_channel === "whatsapp" && owner.phone_e164 && hasOptIn) {
    const wa = whatsappFromEnv();
    const params = [owner.name?.split(" ")[0] ?? "tudo bem", String(prep.week), "5", first ? getActionTitle(first.text) : "a ação da semana"];
    const r = await wa.sendTemplate(owner.phone_e164, "ritual_semanal", params);
    await withTenant(orgId, async (db) => {
      await repo.insertMessage(db, { channel: "whatsapp", direction: "outbound", userId: owner.id, template: "ritual_semanal", body: renderTemplate("ritual_semanal", params), providerMessageId: r.messageId, status: "sent", ritualSessionId: prep.session.id });
      await repo.updateRitualSession(db, prep.session.id, { status: "sent" });
    });
    return { sent: true, channel: "whatsapp" };
  }
  await emailFromEnv().send({
    to: owner.email,
    subject: `Ritual da semana ${prep.week} (5 minutos)`,
    text: `Olá! Seu ritual da semana está pronto: ${appUrl}/app/ritual\n\n${prep.session.questions.map((q: RitualQuestion) => `• ${q.text}`).join("\n")}`,
  });
  await withTenant(orgId, (db) => repo.updateRitualSession(db, prep.session.id, { status: "sent" }));
  return { sent: true, channel: "email" };
}

/** Aplica as respostas (web, WhatsApp ou e-mail) e persiste ações, números, risco e próxima ação. */
export async function submitRitual(orgId: string, sessionId: string, answers: { action?: string; metric?: string; blocker?: string }, userId?: string) {
  return withTenant(orgId, async (db) => {
    const s = await repo.getRitualSession(db, sessionId);
    if (!s) throw new Error("Ritual não encontrado");
    const cycle = await repo.getActiveCycle(db);
    if (!cycle || cycle.cycle.id !== s.cycle_id) throw new Error("O ciclo deste ritual não está mais ativo.");
    const priorities = toRitualPriorities(cycle);
    const out = applyRitual(priorities, s.week, answers, s.questions);
    for (const u of out.actionUpdates) await repo.setActionStatus(db, u.actionId, u.status);
    const today = new Date().toISOString().slice(0, 10);
    for (const mv of out.metricValues) {
      await repo.recordMetric(db, { metricCode: mv.metric, periodStart: today, periodEnd: today, value: mv.value, source: "ritual", recordedBy: userId });
      const p = cycle.priorities.find((x) => x.id === mv.priorityId);
      if (p && p.baseline === null) {
        const target = computeTarget(getTrack(p.track_code).indicator.target, mv.value);
        await repo.setPriorityBaseline(db, p.id, mv.value, target);
      }
    }
    await repo.updateRitualSession(db, sessionId, { status: "answered", answers, outcome: out });
    if (userId) await repo.audit(db, userId, "ritual.answered", sessionId, { risk: out.overallRisk });
    return out;
  });
}

/**
 * Webhook do WhatsApp: conduz o ritual pergunta a pergunta (máximo 3), dentro da janela de 24h.
 * Texto livre que as regras não entendem passa pela IA (ritual_interpret), tratado como dado não confiável.
 */
export async function handleWhatsAppEvent(ev: InboundEvent): Promise<void> {
  if (ev.kind === "status") {
    // Status de entrega: sem organização conhecida aqui, o registro é feito por provider_message_id no worker/relatórios.
    return;
  }
  const user = await withSystem((db) => identity.findUserByPhone(db, ev.from));
  if (!user) return;
  const orgs = await withSystem((db) => identity.listUserOrganizations(db, user.id));
  const wa = whatsappFromEnv();
  for (const org of orgs) {
    const open = await withTenant(org.id, (db) => repo.openRitualSession(db));
    if (!open) continue;
    let text = ev.kind === "text" ? ev.text : ev.kind === "button" ? ev.payload || ev.title : "";
    if (ev.kind === "audio") {
      const { sttFromEnv } = await import("@beos/channels");
      const media = await wa.downloadMedia(ev.mediaId);
      text = await sttFromEnv().transcribe(media.bytes, media.mime);
    }
    await withTenant(org.id, (db) => repo.insertMessage(db, { channel: "whatsapp", direction: "inbound", userId: user.id, body: text.slice(0, 2000), providerMessageId: ev.messageId, status: "received", ritualSessionId: open.id }));
    const answers = { ...open.answers };
    const order: RitualQuestion["id"][] = open.questions.map((q: RitualQuestion) => q.id);
    const current = order.find((id) => answers[id] === undefined);
    if (!current) return;

    // Regras primeiro; IA só se não entendermos.
    let accepted = true;
    if (current === "action" && !parseActionReply(text)) accepted = false;
    if (current === "metric" && parseMetricReply(text) === null && !/^(pular|nao sei|não sei)$/i.test(text.trim())) accepted = false;
    if (!accepted) {
      try {
        const ai = await interpretRitualReply(await aiFor(org.id), text, open.questions);
        if (current === "action" && ai.action) text = ai.action;
        if (current === "metric" && ai.metric !== null) text = String(ai.metric);
        accepted = current === "action" ? !!ai.action : ai.metric !== null;
        if (ai.blocker && !answers.blocker) answers.blocker = ai.blocker;
      } catch {
        /* segue com a pergunta de novo */
      }
    }
    if (!accepted) {
      await wa.sendText(ev.from, current === "action" ? "Não entendi. Responda: Feito, Em parte ou Não deu." : "Me diga só o número (ex.: 12), ou \"pular\".");
      return;
    }
    answers[current] = text;
    await withTenant(org.id, (db) => repo.updateRitualSession(db, open.id, { status: "in_progress", answers: { [current]: text } }));
    const next = open.questions.find((q: RitualQuestion) => answers[q.id] === undefined);
    if (next) {
      if (next.kind === "action_status") await wa.sendButtons(ev.from, next.text, next.options!.map((o: { id: string; label: string }) => ({ id: o.id, title: o.label })));
      else await wa.sendText(ev.from, next.text);
      return;
    }
    const out = await submitRitual(org.id, open.id, { action: answers.action, metric: answers.metric, blocker: answers.blocker && !isNoBlocker(answers.blocker) ? answers.blocker : undefined }, user.id);
    await wa.sendText(ev.from, out.summary);
    return;
  }
}

/** RF14 — alertas: ritual ausente, marco atrasado, indicador fora da tolerância. */
export async function evaluateOrgAlerts(orgId: string, today = new Date().toISOString().slice(0, 10)) {
  return withTenant(orgId, async (db) => {
    const cycle = await repo.getActiveCycle(db);
    if (!cycle) return [];
    const metrics = await repo.latestMetrics(db);
    const deviations = cycle.priorities
      .filter((p) => p.target !== null && metrics[p.metric_code])
      .map((p) => {
        const m = getMetric(p.metric_code);
        return { metric: p.metric_code, value: metrics[p.metric_code]!.value, target: p.target!, direction: m.direction, tolerance: m.tolerance };
      });
    return evaluateAlerts({
      missedRitualsInRow: await repo.missedRitualsInRow(db, cycle.cycle.id),
      lateMilestones: (await repo.lateMilestones(db, today)).map((m) => ({ title: m.title, dueDate: m.due_date })),
      metricDeviations: deviations,
    });
  });
}
