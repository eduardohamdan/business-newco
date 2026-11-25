import { describe, expect, it } from "vitest";
import { computeCnpjCheckDigits, formatBRL, isValidCnpj, isValidCpf, parseAmount } from "../src";

describe("parseAmount", () => {
  it.each([
    ["1.234,56", 123456],
    ["-1.234,56", -123456],
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["R$ 1.234,56", 123456],
    ["(1.234,56)", -123456],
    ["1.234,56 D", -123456],
    ["1.234,56 C", 123456],
    ["1.234,56-", -123456],
    ["350,5", 35050],
    ["1.000", 100000],
    ["0,01", 1],
  ])("%s → %d centavos", (input, cents) => expect(parseAmount(input)).toBe(cents));
  it("rejeita texto", () => expect(parseAmount("abc")).toBeNull());
  it("formata BRL", () => expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56"));
});

describe("CNPJ", () => {
  it("valida CNPJ numérico", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
  it("valida CNPJ alfanumérico (formato Receita Federal 2026)", () => {
    const base = "12ABC34501DE";
    const dv = computeCnpjCheckDigits(base);
    expect(dv).toBe("35"); // exemplo oficial divulgado pela Receita: 12.ABC.345/01DE-35
    expect(isValidCnpj(`12.ABC.345/01DE-${dv}`)).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
  });
  it("valida CPF", () => {
    expect(isValidCpf("123.456.789-09")).toBe(true);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });
});
