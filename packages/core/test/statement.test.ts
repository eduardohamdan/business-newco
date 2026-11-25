import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dedupeHashes, parseCsv, parseOfx, parseStatementFile, reconcile, sanitizeDescription } from "../src";

const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f));

describe("OFX", () => {
  const st = parseOfx(fx("extrato-itau.ofx").toString("latin1"));
  it("lê lançamentos, banco e período", () => {
    expect(st.transactions).toHaveLength(4);
    expect(st.bankId).toBe("0341");
    expect(st.periodStart).toBe("2026-09-01");
    expect(st.transactions[1]!.amountCents).toBe(-35050); // vírgula decimal tolerada
    expect(st.transactions[0]!.externalId).toBe("20260902001");
  });
  it("deriva o saldo inicial do saldo final", () => {
    const r = reconcile(st);
    expect(r.status).toBe("derived");
    expect(r.openingCents).toBe(500000);
    expect(r.closingCents).toBe(605970);
  });
});

describe("CSV", () => {
  const st = parseCsv(fx("extrato-credito-debito.csv").toString("utf8"));
  it("detecta cabeçalho, colunas crédito/débito, aspas e ordem decrescente", () => {
    expect(st.transactions.map((t) => t.amountCents)).toEqual([-180000, 250000, -123456]);
    expect(st.transactions[0]!.description).toBe("ALUGUEL; SALA 3");
    expect(st.openingBalanceCents).toBe(1053456);
    expect(st.closingBalanceCents).toBe(1000000);
  });
  it("concilia saldos", () => {
    expect(reconcile(st)).toMatchObject({ status: "ok", diffCents: 0 });
  });
  it("detecta divergência", () => {
    const broken = { ...st, transactions: st.transactions.slice(1) };
    expect(reconcile(broken).status).toBe("mismatch");
  });
  it("parseStatementFile escolhe o parser pelo conteúdo", () => {
    expect(parseStatementFile("x.ofx", new Uint8Array(fx("extrato-itau.ofx"))).format).toBe("ofx");
    expect(parseStatementFile("x.csv", new Uint8Array(fx("extrato-credito-debito.csv"))).format).toBe("csv");
  });
});

describe("LGPD e deduplicação", () => {
  it("mascara CPF de terceiros e guarda só o hash", () => {
    const r = sanitizeDescription("PIX RECEBIDO - MARIA SOUZA 123.456.789-09", "org-salt");
    expect(r.description).not.toContain("123.456.789-09");
    expect(r.counterparty.kind).toBe("pf");
    expect(r.counterparty.docHash).toHaveLength(32);
    expect(r.counterparty.name).toBe("MARIA SOUZA");
    expect(sanitizeDescription("PIX RECEBIDO - MARIA SOUZA 123.456.789-09", "outra-org").counterparty.docHash).not.toBe(r.counterparty.docHash);
  });
  it("lançamentos idênticos no mesmo dia geram hashes distintos e reenvio gera os mesmos", () => {
    const t = { postedAt: "2026-09-01", amountCents: -990, description: "TARIFA", provenance: {} };
    const a = dedupeHashes("acc", [t, t]);
    expect(a[0]).not.toBe(a[1]);
    expect(dedupeHashes("acc", [t, t])).toEqual(a);
  });
});
