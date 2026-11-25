import { createHmac, timingSafeEqual } from "node:crypto";
import { fromWaId, toWaId } from "./phone";
import { TEMPLATES, type TemplateKey } from "./templates";
import type { InboundEvent, MessagingChannel } from "./types";

export interface WhatsAppConfig {
  graphVersion: string;
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  /** Código de idioma dos templates aprovados. */
  language?: string;
}

export function loadWhatsAppConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  return {
    graphVersion: env.WHATSAPP_GRAPH_VERSION ?? "v23.0",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken: env.WHATSAPP_ACCESS_TOKEN ?? "",
    appSecret: env.WHATSAPP_APP_SECRET ?? "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? "",
    language: "pt_BR",
  };
}

/**
 * WhatsApp Business Platform (Cloud API). Canal de SERVIÇO com fluxos estruturados — não é um assistente aberto
 * (política da Meta para chatbots de IA de uso geral, em vigor desde 15/01/2026).
 */
export function whatsappCloud(cfg: WhatsAppConfig): MessagingChannel {
  const base = `https://graph.facebook.com/${cfg.graphVersion}`;
  async function call(path: string, body: unknown) {
    const res = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${json?.error?.message ?? "erro"}`);
    return json;
  }
  const send = async (payload: object) => {
    const r = await call(`${cfg.phoneNumberId}/messages`, { messaging_product: "whatsapp", ...payload });
    return { messageId: r.messages?.[0]?.id as string };
  };
  return {
    name: "whatsapp_cloud",
    sendTemplate: (to, key, params) => {
      const t = TEMPLATES[key];
      return send({
        to: toWaId(to),
        type: "template",
        template: {
          name: t.name,
          language: { code: cfg.language ?? "pt_BR" },
          components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }],
        },
      });
    },
    sendText: (to, text) => send({ to: toWaId(to), type: "text", text: { body: text.slice(0, 4096) } }),
    sendButtons: (to, body, buttons) =>
      send({
        to: toWaId(to),
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body.slice(0, 1024) },
          action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
        },
      }),
    async downloadMedia(mediaId) {
      const meta = await fetch(`${base}/${mediaId}`, { headers: { authorization: `Bearer ${cfg.accessToken}` } }).then((r) => r.json() as Promise<any>);
      const res = await fetch(meta.url, { headers: { authorization: `Bearer ${cfg.accessToken}` } });
      if (!res.ok) throw new Error(`Falha ao baixar mídia ${mediaId}`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), mime: meta.mime_type ?? "audio/ogg" };
    },
  };
}

/** GET de verificação do webhook (hub.challenge). */
export function verifyWebhookChallenge(params: URLSearchParams, verifyToken: string): string | null {
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === verifyToken) return params.get("hub.challenge");
  return null;
}

/** Valida X-Hub-Signature-256 (HMAC SHA-256 do corpo cru com o App Secret). */
export function verifySignature(rawBody: string | Uint8Array, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Converte o payload do webhook em eventos tipados. Ignora o que não entendemos. */
export function parseWebhook(body: any): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      for (const m of v.messages ?? []) {
        const from = fromWaId(m.from);
        const timestamp = Number(m.timestamp ?? 0);
        if (m.type === "text") out.push({ kind: "text", from, messageId: m.id, text: m.text?.body ?? "", timestamp });
        else if (m.type === "interactive" && m.interactive?.type === "button_reply")
          out.push({ kind: "button", from, messageId: m.id, payload: m.interactive.button_reply.id, title: m.interactive.button_reply.title, timestamp });
        else if (m.type === "button") out.push({ kind: "button", from, messageId: m.id, payload: m.button?.payload ?? m.button?.text, title: m.button?.text ?? "", timestamp });
        else if (m.type === "audio") out.push({ kind: "audio", from, messageId: m.id, mediaId: m.audio?.id, mime: m.audio?.mime_type ?? "audio/ogg", timestamp });
      }
      for (const s of v.statuses ?? []) out.push({ kind: "status", messageId: s.id, status: s.status, recipient: fromWaId(s.recipient_id ?? "") });
    }
  }
  return out;
}
