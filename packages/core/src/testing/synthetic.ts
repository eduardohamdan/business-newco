import type { Answers } from "../maturity";
import { getMethod } from "@beos/method";

/**
 * Gerador determinístico de empresas sintéticas para testes, seed de desenvolvimento e conjunto de avaliação.
 * Nunca use dados reais de clientes em testes.
 */
export interface SyntheticProfile {
  name: string;
  sector: "saude" | "servicos" | "varejo";
  monthlyRevenueCents: number;
  /** Fração das saídas que é gasto pessoal (0–1). */
  personalShare: number;
  /** Saídas / entradas (>1 = queimando caixa). */
  burnRatio: number;
  openingBalanceCents: number;
  maturity: "baixa" | "media" | "alta";
  teamSize: number;
  seed: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const fmt = (cents: number) => {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100).toLocaleString("pt-BR")},${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
};

/** Gera um extrato CSV de 3 meses completos no formato "Data;Histórico;Valor;Saldo". */
export function syntheticStatementCsv(p: SyntheticProfile, startMonth = "2026-07"): string {
  const r = rng(p.seed);
  const lines = ["Data;Histórico;Valor;Saldo", `30/06/2026;SALDO ANTERIOR;;${fmt(p.openingBalanceCents)}`];
  let balance = p.openingBalanceCents;
  const [y0, m0] = startMonth.split("-").map(Number) as [number, number];
  const payers = ["MARIA SOUZA", "JOAO LIMA", "CLINICA BOA SAUDE LTDA", "ANA PAULA", "CARLOS ALVES", "EMPRESA XPTO LTDA"];
  for (let k = 0; k < 3; k++) {
    const y = y0 + Math.floor((m0 - 1 + k) / 12);
    const m = ((m0 - 1 + k) % 12) + 1;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const entries: [number, string, number][] = [];
    // Receita: ~12 recebimentos
    let rev = 0;
    for (let i = 0; i < 12; i++) {
      const v = Math.round((p.monthlyRevenueCents / 12) * (0.7 + r() * 0.6));
      rev += v;
      const payer = payers[Math.floor(r() * payers.length)]!;
      entries.push([1 + Math.floor(r() * (days - 1)), i % 3 === 0 ? `CIELO VENDAS CREDITO` : `PIX RECEBIDO - ${payer}`, v]);
    }
    const out = Math.round(rev * p.burnRatio);
    const personal = Math.round(out * p.personalShare);
    const business = out - personal;
    const split: [string, number][] = [
      ["PAGTO SALARIO FOLHA", 0.32],
      ["ALUGUEL SALA COMERCIAL", 0.14],
      ["DAS SIMPLES NACIONAL", 0.08],
      ["FORNECEDOR DISTRIBUIDORA NORTE", 0.28],
      ["ENEL ENERGIA", 0.04],
      ["CONTABILIDADE SILVA HONORARIOS", 0.04],
      ["META ADS FACEBK", 0.05],
      ["TARIFA PACOTE SERVICOS", 0.01],
      ["COMPRA DIVERSOS", 0.04],
    ];
    for (const [desc, share] of split) entries.push([1 + Math.floor(r() * (days - 1)), desc, -Math.round(business * share)]);
    if (personal > 0) {
      entries.push([5, "NETFLIX.COM", -Math.round(personal * 0.1)]);
      entries.push([10, "MENSALIDADE ESCOLAR COLEGIO", -Math.round(personal * 0.5)]);
      entries.push([20, "DROGARIA PAGUE MENOS", -(personal - Math.round(personal * 0.1) - Math.round(personal * 0.5))]);
    }
    entries.sort((a, b) => a[0] - b[0]);
    for (const [d, desc, v] of entries) {
      balance += v;
      lines.push(`${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y};${desc};${fmt(v)};${fmt(balance)}`);
    }
  }
  return lines.join("\n");
}

/** Respostas do questionário coerentes com o nível de maturidade. */
export function syntheticAnswers(p: SyntheticProfile): Answers {
  const idx = p.maturity === "baixa" ? 0 : p.maturity === "media" ? 1 : 2;
  const answers: Answers = {};
  for (const q of getMethod().questions) {
    const n = q.options.length;
    const pos = idx === 0 ? 0 : idx === 1 ? Math.floor((n - 1) / 2) : n - 1;
    answers[q.code] = q.options[pos]!.value;
  }
  return answers;
}

export const SYNTHETIC_PROFILES: SyntheticProfile[] = [
  { name: "Clínica em sobrevivência", sector: "saude", monthlyRevenueCents: 9_000_000, personalShare: 0.15, burnRatio: 1.08, openingBalanceCents: 1_200_000, maturity: "baixa", teamSize: 6, seed: 11 },
  { name: "Agência organizando", sector: "servicos", monthlyRevenueCents: 15_000_000, personalShare: 0.02, burnRatio: 0.92, openingBalanceCents: 9_000_000, maturity: "media", teamSize: 9, seed: 22 },
  { name: "Varejo em crescimento", sector: "varejo", monthlyRevenueCents: 38_000_000, personalShare: 0.0, burnRatio: 0.88, openingBalanceCents: 45_000_000, maturity: "alta", teamSize: 25, seed: 33 },
];
