// Normalización del nombre del componente (spec-motor §3 y §6.1; plan T2, M4) y normalizador único
// (docs/spec-adapter-observation-listadoid.md §3.2, E3).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isCode, normalizeName, type NameStatus } from "@/engine/normalize";
import { CODE_FORMAT } from "@/model/ids";
import { looksLikeCode, normalizeCode } from "@/pdf/code";

const ROOT = path.resolve(__dirname, "..", "..");

const M4: [string | null, NameStatus][] = [
  [null, { kind: "sin-componente" }],
  ["9999-01-M01-C04", { kind: "canonico", code: "9999-01-M01-C04" }],
  ["_9999-01-M01-C04", { kind: "canonico", code: "9999-01-M01-C04" }],
  ["__9999-01-M01-C04", { kind: "anomalo", code: "9999-01-M01-C04" }], // solo inicial
  ["_9999-01-M01-C01__", { kind: "anomalo", code: "9999-01-M01-C01" }], // solo final (C01 del primer fixture)
  ["9999-01-M01-C04_", { kind: "anomalo", code: "9999-01-M01-C04" }], // solo final, sin _ inicial
  ["___9999-01-M01-C04__", { kind: "anomalo", code: "9999-01-M01-C04" }], // ambos
  ["instance_3", { kind: "formato-invalido" }],
  ["_9999-01-M01-C4", { kind: "formato-invalido" }],
  ["x_9999-01-M01-C04", { kind: "formato-invalido" }],
  ["", { kind: "formato-invalido" }],
];

describe("M4: normalizeName (§6.1)", () => {
  it.each(M4)("normalizeName(%j)", (raw, expected) => expect(normalizeName(raw)).toEqual(expected));
});

describe("una sola regla del formato (§3.2)", () => {
  const extras = [" 9999-01-M01-C04", "9999-01-M01-C04 ", "9999-01-M1-C04", "99999-01-M01-C04", "9999-01-m01-C04", "9999-01-M01-C04\n"];
  const samples = [...M4.map(([raw]) => raw).filter((r): r is string => r !== null), ...extras];

  it.each(samples)("CODE_FORMAT de @/model/ids y el formato del motor coinciden sobre %j", (s) => {
    expect(isCode(s)).toBe(CODE_FORMAT.test(s));
  });

  it("también sobre los códigos normalizados de la tabla", () => {
    for (const [, status] of M4) {
      if ("code" in status) {
        expect(isCode(status.code)).toBe(true);
        expect(CODE_FORMAT.test(status.code)).toBe(true);
      }
    }
  });

  it("src/pdf/code.ts no tiene regex propias ni importa @/model/: envuelve a normalizeName", () => {
    const src = readFileSync(path.join(ROOT, "src", "pdf", "code.ts"), "utf8");
    expect(src).toMatch(/from\s+["']@\/engine\/normalize["']/);
    expect(src).not.toMatch(/from\s+["']@\/model\//);
    expect(src).not.toMatch(/new RegExp|\/\^/);
  });

  it("src/engine/hash.ts toma el formato del código de normalize.ts", () => {
    const src = readFileSync(path.join(ROOT, "src", "engine", "hash.ts"), "utf8");
    expect(src).toMatch(/from\s+["']\.\/normalize["']/);
    expect(src).not.toMatch(/\\d\{4\}/);
  });
});

describe("normalizeCode traduce los estados del motor y conserva la diferencia en \"\" (§3.2)", () => {
  it.each(M4.filter(([raw]) => raw !== null && raw !== ""))("%j", (raw, status) => {
    const pdf = normalizeCode(raw);
    if (status.kind === "canonico" || status.kind === "anomalo") expect(pdf).toEqual({ state: status.kind, code: status.code });
    else expect(pdf).toEqual({ state: "invalido", code: null });
  });

  it("celda vacía o null del PDF = ausente; componente con nombre vacío = formato-invalido", () => {
    expect(normalizeCode(null)).toEqual({ state: "ausente", code: null });
    expect(normalizeCode("")).toEqual({ state: "ausente", code: null });
    expect(normalizeCode("   ")).toEqual({ state: "ausente", code: null });
    expect(normalizeName("")).toEqual({ kind: "formato-invalido" });
  });

  it("looksLikeCode acepta exactamente los canónicos y anómalos del motor", () => {
    for (const [raw, status] of M4) {
      if (raw === null) continue;
      expect(looksLikeCode(raw), raw).toBe(status.kind === "canonico" || status.kind === "anomalo");
    }
  });
});
