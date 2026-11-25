export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  name: string;
  send(m: EmailMessage): Promise<{ id: string }>;
}

/** Desenvolvimento: imprime o e-mail no console (inclui o código de acesso). */
export function consoleEmail(): EmailSender {
  return {
    name: "console",
    async send(m) {
      console.log(`\n[email:console] Para: ${m.to}\nAssunto: ${m.subject}\n${m.text}\n`);
      return { id: `console-${Date.now()}` };
    },
  };
}

/** Resend (https://resend.com) via HTTP. */
export function resendEmail(apiKey: string, from: string): EmailSender {
  return {
    name: "resend",
    async send(m) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Resend ${res.status}: ${j?.message ?? "erro"}`);
      return { id: j.id };
    },
  };
}

export function emailFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender {
  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) return resendEmail(env.RESEND_API_KEY, env.EMAIL_FROM ?? "nao-responda@exemplo.com.br");
  return consoleEmail();
}
