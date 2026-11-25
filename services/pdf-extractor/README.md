# pdf-extractor

Serviço HTTP que extrai lançamentos de extratos bancários em PDF (com texto). Usado pelo Raio-X quando o cliente envia PDF.

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest -q
uvicorn app.main:app --port 8090
```

`POST /extract` (multipart `file`) → `{ transactions[], opening_balance_cents, closing_balance_cents, period_start, period_end, warnings[] }`.

Limitações do MVP: PDFs escaneados (imagem) não são lidos; layouts muito diferentes do padrão "data descrição valor [D/C] [saldo]" precisam de regras por banco. Cada banco novo deve entrar com um PDF de exemplo **anonimizado** em `tests/`.
