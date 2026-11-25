import io

from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.extract import extract, parse_amount
from app.main import app


def make_pdf(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 800
    for line in lines:
        c.drawString(40, y, line)
        y -= 16
    c.save()
    return buf.getvalue()


SAMPLE = [
    "BANCO EXEMPLO S.A. - Extrato de Conta Corrente PJ",
    "Periodo: 01/09/2026 a 30/09/2026",
    "Data Historico Valor Saldo",
    "01/09/2026 SALDO ANTERIOR 10.534,56",
    "02/09/2026 ALUGUEL SALA 3 1.800,00 D 8.734,56",
    "15/09/2026 PIX RECEBIDO - JOAO LIMA 2.500,00 C 11.234,56",
    "29/09/2026 DAS SIMPLES NACIONAL -1.234,56 10.000,00",
    "30/09/2026 SALDO FINAL 10.000,00",
]


def test_parse_amount():
    assert parse_amount("1.234,56") == 123456
    assert parse_amount("1.234,56", "D") == -123456
    assert parse_amount("(10,00)") == -1000


def test_extract_lines_and_balances():
    r = extract(make_pdf(SAMPLE))
    assert [t["amount_cents"] for t in r["transactions"]] == [-180000, 250000, -123456]
    assert r["opening_balance_cents"] == 1053456
    assert r["closing_balance_cents"] == 1000000
    assert r["period_start"] == "2026-09-02"
    assert r["transactions"][0]["page"] == 1
    # conciliação: inicial + movimentos = final
    assert r["opening_balance_cents"] + sum(t["amount_cents"] for t in r["transactions"]) == r["closing_balance_cents"]


def test_endpoint_rejects_non_pdf():
    client = TestClient(app)
    res = client.post("/extract", files={"file": ("x.pdf", b"nao sou pdf", "application/pdf")})
    assert res.status_code == 415
    res = client.post("/extract", files={"file": ("x.pdf", make_pdf(SAMPLE), "application/pdf")})
    assert res.status_code == 200
    assert len(res.json()["transactions"]) == 3
