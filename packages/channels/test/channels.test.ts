import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mockChannel, parseWebhook, renderTemplate, toE164BR, verifySignature, verifyWebhookChallenge } from "../src";

describe("canais", () => {
  it("normaliza telefones brasileiros", () => {
    expect(toE164BR("(85) 99999-0000")).toBe("+5585999990000");
    expect(toE164BR("+55 85 3333-4444")).toBe("+558533334444");
    expect(toE164BR("123")).toBeNull();
  });
  it("valida assinatura do webhook", () => {
    const body = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "segredo").update(body).digest("hex");
    expect(verifySignature(body, sig, "segredo")).toBe(true);
    expect(verifySignature(body, sig, "outro")).toBe(false);
    expect(verifySignature(body, null, "segredo")).toBe(false);
  });
  it("responde ao desafio de verificação", () => {
    const p = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "t", "hub.challenge": "42" });
    expect(verifyWebhookChallenge(p, "t")).toBe("42");
    expect(verifyWebhookChallenge(p, "x")).toBeNull();
  });
  it("interpreta texto, botão, áudio e status", () => {
    const ev = parseWebhook({
      entry: [{ changes: [{ value: {
        messages: [
          { from: "5585999990000", id: "m1", timestamp: "1", type: "text", text: { body: "fiz" } },
          { from: "5585999990000", id: "m2", timestamp: "2", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "done", title: "Feito" } } },
          { from: "5585999990000", id: "m3", timestamp: "3", type: "audio", audio: { id: "media1", mime_type: "audio/ogg" } },
        ],
        statuses: [{ id: "m0", status: "read", recipient_id: "5585999990000" }],
      } }] }],
    });
    expect(ev.map((e) => e.kind)).toEqual(["text", "button", "audio", "status"]);
    expect(ev[0]).toMatchObject({ from: "+5585999990000", text: "fiz" });
  });
  it("renderiza templates e envia pelo mock", async () => {
    expect(renderTemplate("ritual_semanal", ["Ana", "3", "5", "Revisar preços"])).toContain("semana 3");
    expect(() => renderTemplate("ritual_semanal", ["Ana"])).toThrow();
    const ch = mockChannel({ silent: true });
    await ch.sendTemplate("+5585999990000", "codigo_acesso", ["123456"]);
    expect(ch.outbox[0]!.body).toContain("123456");
  });
});
