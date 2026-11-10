// T10 mínimo: AssociationRun de la pasada 1 (docs/spec-t10-run-minimo.md v0.2, §4). Pruebas N1 a N11.
// Casos armados a mano (tests/helpers/engineFixtures.ts) y el primer fixture real (N4, N5, N9).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { associatePass1, CodigoExcluidoYListadoError } from "@/engine/associate";
import { engineRunId, ListadoInvalidoError, listadoId } from "@/engine/hash";
import { buildRun, MarcoDistintoError } from "@/engine/run";
import { DEFAULT_PARAMS, type AssociationRun, type InstanceResult } from "@/engine/types";
import { ENGINE_VERSION, FRAME_VERSION, VOCABULARY_VERSION } from "@/engine/versions";
import { observeDae } from "@/model/observe";
import { toListing } from "@/pdf/listing";
import { validateFurniture } from "@/pdf/validate";
import { code, input, MODEL_ID, obs, params, row } from "../helpers/engineFixtures";
import { olmoDocuments } from "../helpers/pdfFixtures";

const ROOT = path.resolve(__dirname, "..", "..");

/** Segura, anómala, inexistente, cupo excedido, faltante y malla suelta (spec T10 §4). */
const mixed = () =>
  input(
    [
      obs("_C01", { key: "ID10" }), // segura
      obs("_C02__", { key: "ID9" }), // anómala
      obs("_C09", { key: "ID3" }), // inexistente
      obs("_C03", { key: "ID4" }), // cupo excedido
      obs("_C03", { key: "ID5" }),
      obs(null, { key: "ID6" }), // malla suelta
    ],
    [row("C01", 1), row("C02", 1), row("C03", 1), row("C04", 1) /* faltante */],
  );

/** LCG local con semilla fija (Numerical Recipes); Fisher-Yates. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  let s = seed >>> 0;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const byKey = (run: AssociationRun, key: string): InstanceResult => {
  const found = run.results.find((r) => r.instanceKey === key);
  if (found === undefined) throw new Error(`sin resultado para ${key}`);
  return found;
};

describe("N1 (M7, G3): determinismo", () => {
  it("misma entrada dos veces → mismo JSON, sin fechas", () => {
    const a = JSON.stringify(buildRun(mixed()));
    expect(JSON.stringify(buildRun(mixed()))).toBe(a);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("N2 (M6, G4): invariancia ante permutaciones", () => {
  it("20 permutaciones de observaciones y de filas dan el mismo JSON", () => {
    const base = mixed();
    const expected = JSON.stringify(buildRun(base));
    for (let seed = 1; seed <= 20; seed++) {
      const permuted = { ...base, observations: shuffle(base.observations, seed), listado: shuffle(base.listado, seed * 7919) };
      expect(JSON.stringify(buildRun(permuted)), `semilla ${seed}`).toBe(expected);
    }
  });

  it("el LCG sí permuta (la prueba no es vacía)", () => {
    const keys = mixed().observations.map((o) => o.instanceKey);
    expect(shuffle(keys, 1)).not.toEqual(keys);
  });
});

describe("N3: engineRunId", () => {
  const versions = { engine: ENGINE_VERSION, vocabulary: VOCABULARY_VERSION, frame: FRAME_VERSION };
  const base = { modelId: MODEL_ID, listadoId: "sha256:" + "a".repeat(64), versions, params };
  const id = engineRunId(base);

  it("tiene prefijo sha256: y no depende del orden de las claves de entrada", () => {
    expect(id).toMatch(/^sha256:[0-9a-f]{64}$/);
    const reordered = {
      params: { tupleRoundingMm: params.tupleRoundingMm, epsilonMm: params.epsilonMm, toleranceMm: params.toleranceMm },
      versions: { frame: versions.frame, vocabulary: versions.vocabulary, engine: versions.engine },
      listadoId: base.listadoId,
      modelId: base.modelId,
    };
    expect(engineRunId(reordered)).toBe(id);
  });

  it("cambia con cada parámetro, cada versión, el modelId y el listadoId", () => {
    const variants = [
      { ...base, modelId: "sha256:" + "b".repeat(64) },
      { ...base, listadoId: "sha256:" + "c".repeat(64) },
      { ...base, versions: { ...versions, engine: "motor/2" } },
      { ...base, versions: { ...versions, vocabulary: "vocabulario/1" } },
      { ...base, versions: { ...versions, frame: "marco/2" } },
      { ...base, params: { ...params, toleranceMm: 0.5 } },
      { ...base, params: { ...params, epsilonMm: 1e-5 } },
      { ...base, params: { ...params, tupleRoundingMm: 0.1 } },
    ];
    const ids = variants.map(engineRunId);
    expect(new Set([id, ...ids]).size).toBe(variants.length + 1);
  });

  it("no cambia con furnitureId (y buildRun usa engineRunId)", () => {
    const a = buildRun(mixed());
    const b = buildRun({ ...mixed(), furnitureId: "otro" });
    expect(b.engineRunId).toBe(a.engineRunId);
    expect(a.engineRunId).toBe(engineRunId({ modelId: a.modelId, listadoId: a.listadoId, versions: a.versions, params: a.params }));
  });
});

describe("N6 (T10-E3): código repetido en el listado", () => {
  const dup = input([obs("_C01", { key: "ID1" })], [row("C01", 1), row("C01", 2, { name: "Otro" })]);

  it("buildRun lanza ListadoInvalidoError con motivo codigo-repetido", () => {
    let caught: unknown;
    try {
      buildRun(dup);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ListadoInvalidoError);
    expect(caught).toMatchObject({ code: code("C01"), motivo: "codigo-repetido" });
  });

  it("associatePass1 con el mismo listado da codigo-duplicado (K12)", () => {
    expect(associatePass1(dup).results[0].reasons).toEqual(["codigo-duplicado"]);
  });
});

describe("N7 (T10-E4): códigos excluidos del listado", () => {
  const c05 = code("C05");
  const run = buildRun({
    ...input([obs("_C05", { key: "ID1" }), obs("_C05__", { key: "ID2" }), obs("_C01", { key: "ID3" })], [row("C01", 1)]),
    excludedCodes: [c05],
  });

  it("dudosa con codigo-excluido, sin medir, con la evidencia de §2", () => {
    expect(byKey(run, "ID1")).toEqual({
      instanceKey: "ID1",
      level: "dudosa",
      pieceCode: null,
      reasons: ["codigo-excluido"],
      warnings: [],
      candidates: [],
      evidence: [{ kind: "codigo", result: "no-cumple", detail: `código ${c05}, excluido del listado (datos no tomables)` }],
    });
    expect(byKey(run, "ID2").reasons).toEqual(["nombre-anomalo", "codigo-excluido"]);
  });

  it("fuera de faltante, sin-confirmar y typeSummary", () => {
    expect(run.inconsistencies).toEqual([]);
    expect(run.typeSummary.map((t) => t.pieceCode)).toEqual([code("C01")]);
  });

  it("un código en el listado y en excludedCodes lanza", () => {
    const both = { ...input([obs("_C01")], [row("C01", 1)]), excludedCodes: [code("C01")] };
    expect(() => associatePass1(both)).toThrow(CodigoExcluidoYListadoError);
    expect(() => buildRun(both)).toThrow(CodigoExcluidoYListadoError);
  });

  it("sin excludedCodes el mismo código sigue siendo codigo-inexistente", () => {
    expect(buildRun(input([obs("_C05")], [row("C01", 1)])).results[0].reasons).toEqual(["codigo-inexistente"]);
  });
});

describe("N8: passes y forma del run", () => {
  const run = buildRun(mixed());

  it("passes es 1", () => {
    expect(run.passes).toBe(1);
  });

  it("claves en el orden de §3.1.5, versiones y params", () => {
    expect(Object.keys(run)).toEqual([
      "furnitureId",
      "modelId",
      "listadoId",
      "engineRunId",
      "versions",
      "params",
      "passes",
      "results",
      "typeSummary",
      "inconsistencies",
    ]);
    expect(run.versions).toEqual({ engine: "motor/1", vocabulary: "vocabulario/0", frame: "marco/1" });
    expect(Object.keys(run.params)).toEqual(["toleranceMm", "epsilonMm", "tupleRoundingMm"]);
    expect(run.listadoId).toBe(listadoId(mixed().listado));
  });

  it("results, typeSummary e inconsistencies son los de associatePass1", () => {
    const p1 = associatePass1(mixed());
    expect({ results: run.results, typeSummary: run.typeSummary, inconsistencies: run.inconsistencies }).toEqual(p1);
  });
});

describe("N11 (§3.1.4): marco distinto", () => {
  it("una observación con frameVersion distinto de FRAME_VERSION lanza MarcoDistintoError", () => {
    const o = { ...obs("_C01", { key: "ID2" }), frameVersion: "marco/2" };
    expect(() => buildRun(input([obs("_C01", { key: "ID1" }), o], [row("C01", 2)]))).toThrow(MarcoDistintoError);
  });
});

describe("N10: pureza (M3, H10)", () => {
  const filesUnder = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => path.join(ROOT, dir, f));
  const IMPORTS_RUN = /from\s+["'](@\/engine\/run|[./]+(engine\/)?run)["']/;

  it("associate.ts sigue sin node:crypto ni ./hash", () => {
    const src = readFileSync(path.join(ROOT, "src", "engine", "associate.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'](node:)?crypto["']/);
    expect(src).not.toMatch(/from\s+["'](\.\/hash|@\/engine\/hash)["']/);
  });

  it("run.ts no lo importa ningún \"use client\" ni src/pdf/", () => {
    for (const file of filesUnder("src/pdf")) expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_RUN);
    const clients = filesUnder("src").filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(clients.length).toBeGreaterThan(0);
    for (const file of clients) expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_RUN);
  });
});

// --- Primer fixture real (N4, N5, N9). Si N9 no coincide con K17 se para y se reporta. ---

describe("primer fixture (observeDae + toListing, tol 2 mm)", () => {
  const bytes = readFileSync(path.join(ROOT, "public", "models", "Olmo", "olmo.dae"));
  const listing = toListing("olmo", validateFurniture(olmoDocuments()));
  if (listing.status === "bloqueado") throw new Error(listing.reason);
  const runOnce = () => {
    const observed = observeDae(bytes);
    return buildRun({
      furnitureId: "olmo",
      modelId: observed.modelId,
      observations: observed.observations,
      listado: listing.pieces,
      params: { toleranceMm: olmoDef.toleranceMm, ...DEFAULT_PARAMS },
      excludedCodes: listing.excluded.map((e) => e.code),
    });
  };
  const run = runOnce();

  it("N4: listadoId del run = listadoId(listado) = literal de TP-61", () => {
    expect(run.listadoId).toBe(listadoId(listing.pieces));
    expect(run.listadoId).toBe("sha256:46d3cdea2a2f50362f98f8b09052a90f245c89802cd8aa959de588a7b538a2db");
  });

  it("N5 (T10-E6): orden binario y claves y códigos en ASCII", () => {
    const keys = run.results.map((r) => r.instanceKey);
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    const ascii = /^[\x20-\x7e]*$/;
    for (const k of keys) expect(k, k).toMatch(ascii);
    for (const p of listing.pieces) expect(p.code, p.code).toMatch(ascii);
    const ordered = buildRun(input([obs("_C01", { key: "ID9" }), obs("_C01", { key: "ID10" })], [row("C01", 2)]));
    expect(ordered.results.map((r) => r.instanceKey)).toEqual(["ID10", "ID9"]);
  });

  it("N9: cifras de K17 (32 segura, 1 dudosa C01 nombre-anomalo, 6 sin-asociar) e igual en dos corridas", () => {
    const count = (level: InstanceResult["level"]) => run.results.filter((r) => r.level === level).length;
    expect(listing.excluded).toEqual([]);
    expect([count("segura"), count("dudosa"), count("sin-asociar")]).toEqual([32, 1, 6]);
    const dudosa = run.results.filter((r) => r.level === "dudosa");
    expect(dudosa[0].reasons).toEqual(["nombre-anomalo"]);
    expect(run.inconsistencies.at(-1)).toMatchObject({ kind: "sin-confirmar", pieceCode: "0001-01-M01-C01", instanceKeys: [dudosa[0].instanceKey] });
    expect(run.passes).toBe(1);
    expect(JSON.stringify(runOnce())).toBe(JSON.stringify(run));
  });
});
