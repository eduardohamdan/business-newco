"""Extração de lançamentos de extratos bancários em PDF (texto, não escaneado).

Estratégia determinística: lê as linhas de texto de cada página e reconhece o padrão
"DATA  DESCRIÇÃO  VALOR [D|C|-]  [SALDO]". Layouts específicos de banco podem ser adicionados em BANK_RULES.
PDFs escaneados (imagem) não são suportados no MVP: o app pede OFX/CSV ou cai no fallback por IA.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field, asdict
from datetime import date

import pdfplumber

AMOUNT = r"-?\(?R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}\)?"
LINE_RE = re.compile(
    rf"^(?P<date>\d{{2}}/\d{{2}}(?:/\d{{2,4}})?)\s+(?P<desc>.+?)\s+(?P<amount>{AMOUNT})\s*(?P<dc>[DC\-])?(?:\s+(?P<balance>{AMOUNT})\s*(?P<bdc>[DC\-])?)?\s*$"
)
BALANCE_RE = re.compile(rf"SALDO\s+(?P<kind>ANTERIOR|INICIAL|FINAL|ATUAL|DO DIA|EM C/C)?.*?(?P<amount>{AMOUNT})\s*(?P<dc>[DC\-])?\s*$", re.I)
YEAR_RE = re.compile(r"\b(?:\d{2}/\d{2}/)(\d{4})\b")


def parse_amount(raw: str, dc: str | None = None) -> int:
    s = raw.strip()
    neg = s.startswith("-") or (s.startswith("(") and s.endswith(")")) or dc in ("D", "-")
    s = re.sub(r"[^\d,]", "", s).replace(",", ".")
    cents = int(round(float(s) * 100))
    return -cents if neg else cents


def parse_date(raw: str, year: int) -> str | None:
    parts = raw.split("/")
    try:
        d, m = int(parts[0]), int(parts[1])
        y = int(parts[2]) if len(parts) > 2 else year
        if y < 100:
            y += 2000
        return date(y, m, d).isoformat()
    except (ValueError, IndexError):
        return None


@dataclass
class Result:
    transactions: list[dict] = field(default_factory=list)
    opening_balance_cents: int | None = None
    closing_balance_cents: int | None = None
    period_start: str | None = None
    period_end: str | None = None
    bank_name: str | None = None
    warnings: list[str] = field(default_factory=list)


def extract(pdf_bytes: bytes, default_year: int | None = None) -> dict:
    res = Result()
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = [(i + 1, (p.extract_text() or "")) for i, p in enumerate(pdf.pages)]
    full = "\n".join(t for _, t in pages)
    if len(full.strip()) < 20:
        res.warnings.append("PDF sem texto (provavelmente escaneado).")
        return asdict(res)
    years = [int(y) for y in YEAR_RE.findall(full)]
    year = max(set(years), key=years.count) if years else (default_year or date.today().year)
    balances: list[int] = []
    for page_no, text in pages:
        for line_no, line in enumerate(text.splitlines(), start=1):
            line = re.sub(r"\s+", " ", line).strip()
            upper = line.upper()
            if upper.startswith("SALDO") or " SALDO " in f" {upper[:20]} ":
                m = BALANCE_RE.search(line)
                if m:
                    v = parse_amount(m.group("amount"), m.group("dc"))
                    kind = (m.group("kind") or "").upper()
                    if kind in ("ANTERIOR", "INICIAL") and res.opening_balance_cents is None:
                        res.opening_balance_cents = v
                    else:
                        balances.append(v)
                continue
            m = LINE_RE.match(line)
            if not m:
                continue
            posted = parse_date(m.group("date"), year)
            if not posted:
                continue
            amount = parse_amount(m.group("amount"), m.group("dc"))
            if amount == 0:
                continue
            tx = {"posted_at": posted, "amount_cents": amount, "description": m.group("desc").strip(), "page": page_no, "line": line_no}
            if m.group("balance"):
                tx["balance_after_cents"] = parse_amount(m.group("balance"), m.group("bdc"))
            res.transactions.append(tx)
    if not res.transactions:
        res.warnings.append("Nenhum lançamento reconhecido no PDF.")
        return asdict(res)
    if res.transactions[0]["posted_at"] > res.transactions[-1]["posted_at"]:
        res.transactions.reverse()
    first, last = res.transactions[0], res.transactions[-1]
    res.period_start, res.period_end = first["posted_at"], last["posted_at"]
    if res.opening_balance_cents is None and "balance_after_cents" in first:
        res.opening_balance_cents = first["balance_after_cents"] - first["amount_cents"]
    if balances:
        res.closing_balance_cents = balances[-1]
    elif "balance_after_cents" in last:
        res.closing_balance_cents = last["balance_after_cents"]
    return asdict(res)
