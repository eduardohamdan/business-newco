# Segurança e LGPD

## Já implementado
- RLS forçado em todas as tabelas de negócio; papel `beos_app` sem bypass; testes de vazamento entre empresas.
- Login sem senha: código de 6 dígitos com hash SHA-256, 10 min de validade, 5 tentativas, 5 códigos/hora por e-mail.
- Sessão: token aleatório de 256 bits em cookie `httpOnly`/`sameSite=lax`/`secure` (produção); no banco só o hash.
- Auditoria append-only (`audit_events`): login de operador, uploads, correções, ciclo, assinatura, exportação, exclusão.
- Minimização: CPF de terceiros mascarado na descrição; contraparte guardada como hash com sal por empresa (`data_salt`).
- Webhooks autenticados (assinatura HMAC da Meta; token do Asaas) com comparação em tempo constante.
- IA: conteúdo do cliente delimitado como dado; guarda numérica; recusa fora do escopo; teto de custo.
- Exportação completa (JSON) e exclusão da empresa (cascata + remoção de arquivos + trilha de auditoria).
- Cabeçalhos: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Pendente para produção (ver plano de construção, P1.5–P1.8)
- Política de privacidade, termos, DPO nomeado, registro das operações de tratamento, DPA com fornecedores (LLM, WhatsApp,
  pagamentos, e-mail, nuvem), cláusulas de transferência internacional quando o LLM processar fora do Brasil.
- CSP, rate limit por IP, pentest externo, plano de resposta a incidentes (comunicação à ANPD), retenção configurável.
- Fornecedores de IA com contrato que proíba treino com dados do cliente (retenção zero quando disponível).
