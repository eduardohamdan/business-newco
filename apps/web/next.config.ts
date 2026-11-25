import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Monorepo: carrega o .env da raiz (variáveis já definidas no ambiente têm prioridade).
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ["@beos/core", "@beos/method", "@beos/db", "@beos/ai", "@beos/channels", "@beos/billing", "@beos/services"],
  serverExternalPackages: ["pg", "pg-boss", "@aws-sdk/client-s3"],
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
