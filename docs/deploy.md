# Deploy (sugestão para o MVP)

Três processos e um banco, em região Brasil:

| Componente | Comando | Observações |
|---|---|---|
| Web | `pnpm --filter @beos/web build && pnpm --filter @beos/web start` | Node 22. Precisa de `DATABASE_URL` (papel `beos_app`). |
| Worker | `pnpm --filter @beos/worker start` | Processo separado, sempre ligado. Usa `JOBS_DATABASE_URL` (papel com permissão de criar o schema do pg-boss). |
| pdf-extractor | imagem de `services/pdf-extractor/Dockerfile` | Rede privada; `PDF_EXTRACTOR_URL` aponta para ele. |
| Postgres 16 | gerenciado, com backup diário e restauração testada | Rodar `pnpm db:migrate` com `DATABASE_ADMIN_URL` a cada deploy; definir `BEOS_APP_PASSWORD`. |

Checklist de produção: `PROCESS_INLINE=false`, `APP_ENV=production`, HTTPS, domínio no `APP_URL`, provedores reais
configurados (nenhum `mock`), `INTERNAL_OPERATOR_EMAILS` restrito, webhooks registrados (Meta e gateway), alertas de erro.
