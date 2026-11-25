export * from "./types";
export * from "./phone";
export * from "./templates";
export * from "./whatsapp";
export * from "./mock";
export * from "./email";
export * from "./stt";

import { mockChannel } from "./mock";
import { loadWhatsAppConfig, whatsappCloud } from "./whatsapp";
import type { MessagingChannel } from "./types";

let cached: MessagingChannel | undefined;
export function whatsappFromEnv(env: NodeJS.ProcessEnv = process.env): MessagingChannel {
  if (!cached) cached = env.WHATSAPP_PROVIDER === "cloud" ? whatsappCloud(loadWhatsAppConfig(env)) : mockChannel();
  return cached;
}
