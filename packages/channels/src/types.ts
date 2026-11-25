import type { TemplateKey } from "./templates";

export interface InboundText {
  kind: "text";
  from: string; // E.164
  messageId: string;
  text: string;
  timestamp: number;
}
export interface InboundButton {
  kind: "button";
  from: string;
  messageId: string;
  /** id do botão (ex.: "done") ou texto do botão de template. */
  payload: string;
  title: string;
  timestamp: number;
}
export interface InboundAudio {
  kind: "audio";
  from: string;
  messageId: string;
  mediaId: string;
  mime: string;
  timestamp: number;
}
export interface StatusUpdate {
  kind: "status";
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipient: string;
}
export type InboundEvent = InboundText | InboundButton | InboundAudio | StatusUpdate;

export interface MessagingChannel {
  name: string;
  sendTemplate(to: string, key: TemplateKey, params: string[]): Promise<{ messageId: string }>;
  /** Texto livre: só dentro da janela de 24h após a última mensagem do usuário. */
  sendText(to: string, text: string): Promise<{ messageId: string }>;
  /** Até 3 botões de resposta rápida (dentro da janela de 24h). */
  sendButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<{ messageId: string }>;
  downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }>;
}
