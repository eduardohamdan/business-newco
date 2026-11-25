import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileMethodFromDir } from "./compile";
import { getMethod, getTrack } from "./index";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../content");

describe("método", () => {
  it("compila sem inconsistências", () => {
    const m = compileMethodFromDir(dir);
    expect(m.tracks).toHaveLength(24);
    expect(m.questions.length).toBeGreaterThanOrEqual(18);
  });
  it("tem 4 trilhas por dimensão", () => {
    const m = getMethod();
    for (const d of m.manifest.dimensions) {
      expect(m.tracks.filter((t) => t.dimension === d.code)).toHaveLength(4);
    }
  });
  it("JSON gerado é igual ao YAML", () => {
    expect(getMethod()).toEqual(compileMethodFromDir(dir));
  });
  it("busca trilha por código", () => {
    expect(getTrack("cf-separar-pf-pj").indicator.metric).toBe("despesas_pessoais_pj_pct");
    expect(() => getTrack("xx-nao-existe")).toThrow();
  });
});
