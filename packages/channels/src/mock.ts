import { randomUUID } from "node:crypto";
import { renderTemplate, type TemplateKey } from "./templates";
import type { MessagingChannel } from "./types";

/** Canal falso para desenvolvimento e testes: guarda as mensagens em memória e imprime no console. */
export interface SentMessage {
  to: string;
  kind: "template" | "text" | "buttons";
  body: string;
  messageId: string;
}

export function mockChannel(opts: { silent?: boolean } = {}): MessagingChannel & { outbox: SentMessage[] } {
  const outbox: SentMessage[] = [];
  const push = (m: Omit<SentMessage, "messageId">) => {
    const messageId = `mock-${randomUUID()}`;
    outbox.push({ ...m, messageId });
    if (!opts.silent) console.log(`[whatsapp:mock] → ${m.to}: ${m.body}`);
    return { messageId };
  };
  return {
    name: "mock",
    outbox,
    sendTemplate: async (to, key: TemplateKey, params) => push({ to, kind: "template", body: renderTemplate(key, params) }),
    sendText: async (to, text) => push({ to, kind: "text", body: text }),
    sendButtons: async (to, body, buttons) => push({ to, kind: "buttons", body: `${body} [${buttons.map((b) => b.title).join(" | ")}]` }),
    downloadMedia: async () => ({ bytes: new Uint8Array(), mime: "audio/ogg" }),
  };
}
