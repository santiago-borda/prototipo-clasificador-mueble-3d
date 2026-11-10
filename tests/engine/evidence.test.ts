// T7 mínimo: verificación dura por par (docs/spec-t7-verificaciones-duras.md v0.2, §3 y §4; spec-motor §6.2, elemento 2).
// Casos armados a mano (D1 a D7) y el primer fixture real (D8, T7-E5). El segundo fixture se saltea si falta Sabrina/
// y no escribe códigos ni cifras.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import type { FurnitureDef } from "@/data/types";
import { checkDims } from "@/engine/evidence";
import { normalizeName } from "@/engine/normalize";
import { DEFAULT_PARAMS, type EngineParams, type ListadoRow, type Observation } from "@/engine/types";
import { observeDae } from "@/model/observe";
import { toListing } from "@/pdf/listing";
import { validateFurniture } from "@/pdf/validate";
import { HAS_SABRINA_FIXTURE, olmoDocuments, sabrinaDocuments } from "../helpers/pdfFixtures";

const p: EngineParams = { toleranceMm: 2, ...DEFAULT_PARAMS };

function row(dims: Partial<Pick<ListadoRow, "lengthMm" | "widthMm" | "thicknessMm">> = {}): ListadoRow {
  return {
    code: "9999-01-M01-C01",
    name: "Lateral",
    lengthMm: 500,
    widthMm: 300,
    thicknessMm: 18,
    material: "Melamina 18 mm",
    quantity: 1,
    edgeBanding: null,
    notes: null,
    ...dims,
  };
}

function obs(sizeMm: [number, number, number], axisAligned = true): Observation {
  return {
    modelId: "sha256:" + "0".repeat(64),
    instanceKey: "ID1/ID2",
    frameVersion: "marco/1",
    rawName: "_9999-01-M01-C01",
    sizeMm,
    axisAligned,
    orientation: "vertical-lateral",
    centerRel: [0.5, 0.5, 0.5],
    crossesMidplane: [false, false, false],
    edgeRunsMm: "no-disponible",
    mirrored: false,
  };
}

const K: [number, boolean][] = [
  [0.95, true],
  [1.0, true],
  [1.05, false],
];

describe("D1: largo = listado ± k·tol (borde inclusivo)", () => {
  it.each(K)("+k, k=%s → ok %s", (k, ok) => {
    expect(checkDims(obs([18, 300, 500 + k * 2]), row(), p).ok).toBe(ok);
  });
  it.each(K)("−k, k=%s → ok %s", (k, ok) => {
    expect(checkDims(obs([18, 300, 500 - k * 2]), row(), p).ok).toBe(ok);
  });
  it("el que no cumple da medidas no-cumple y espesor cumple", () => {
    const r = checkDims(obs([18, 300, 502.1]), row(), p);
    expect(r.evidence.map((e) => [e.kind, e.result])).toEqual([
      ["espesor", "cumple"],
      ["medidas", "no-cumple"],
    ]);
  });
});

describe("D2: ancho = listado ± k·tol", () => {
  it.each(K)("+k, k=%s → ok %s", (k, ok) => {
    expect(checkDims(obs([18, 300 + k * 2, 500]), row(), p).ok).toBe(ok);
  });
  it.each(K)("−k, k=%s → ok %s", (k, ok) => {
    expect(checkDims(obs([18, 300 - k * 2, 500]), row(), p).ok).toBe(ok);
  });
});

describe("D3: espesor fuera", () => {
  it("21 mm con listado 18 y tol 2 → no ok; espesor no-cumple, medidas cumple", () => {
    const r = checkDims(obs([21, 300, 500]), row(), p);
    expect(r.measured).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.evidence.map((e) => [e.kind, e.result])).toEqual([
      ["espesor", "no-cumple"],
      ["medidas", "cumple"],
    ]);
  });
});

describe("D4: geometría no alineada", () => {
  it("no se mide: measured false, deviationMm null, dos no-disponible", () => {
    const r = checkDims(obs([18, 300, 500], false), row(), p);
    expect(r).toEqual({
      measured: false,
      ok: false,
      deviationMm: null,
      evidence: [
        { kind: "espesor", result: "no-disponible", detail: "geometría no alineada: no se mide" },
        { kind: "medidas", result: "no-disponible", detail: "geometría no alineada: no se mide" },
      ],
    });
  });
});

describe("D5: listado con largo < ancho", () => {
  it("150 x 900 contra la caja [18, 150, 900] → ok", () => {
    const r = checkDims(obs([18, 150, 900]), row({ lengthMm: 150, widthMm: 900 }), p);
    expect(r.ok).toBe(true);
    expect(r.deviationMm).toBe(0);
  });
});

describe("D6: deviationMm", () => {
  it("suma exacta de |Δ| (0,5 + 1 + 1,25)", () => {
    const r = checkDims(obs([18.5, 299, 501.25]), row(), p);
    expect(r.ok).toBe(true);
    expect(r.deviationMm).toBe(2.75);
  });
  it("también cuando no cumple (3 + 0 + 0)", () => {
    expect(checkDims(obs([21, 300, 500]), row(), p).deviationMm).toBe(3);
  });
});

describe("D7: detail con formato fijo (§3.2)", () => {
  it("caso que cumple", () => {
    expect(checkDims(obs([18, 300, 500]), row(), p).evidence).toEqual([
      { kind: "espesor", result: "cumple", detail: "espesor 18.00 mm, listado 18.00 mm, tolerancia 2.00 mm" },
      { kind: "medidas", result: "cumple", detail: "medidas 300.00 x 500.00 mm, listado 300.00 x 500.00 mm, tolerancia 2.00 mm" },
    ]);
  });
  it("caso que no cumple, con listado de largo < ancho (se muestra ordenado)", () => {
    const r = checkDims(obs([15.5, 152.125, 903]), row({ lengthMm: 150, widthMm: 900, thicknessMm: 18 }), { ...p, toleranceMm: 0.5 });
    expect(r.evidence).toEqual([
      { kind: "espesor", result: "no-cumple", detail: "espesor 15.50 mm, listado 18.00 mm, tolerancia 0.50 mm" },
      { kind: "medidas", result: "no-cumple", detail: "medidas 152.13 x 903.00 mm, listado 150.00 x 900.00 mm, tolerancia 0.50 mm" },
    ]);
  });
  it("caso no alineado", () => {
    expect(checkDims(obs([18, 300, 500], false), row(), p).evidence.map((e) => e.detail)).toEqual([
      "geometría no alineada: no se mide",
      "geometría no alineada: no se mide",
    ]);
  });
  it("sin rule (no hay vocabulario)", () => {
    for (const e of checkDims(obs([18, 300, 500]), row(), p).evidence) expect(e).not.toHaveProperty("rule");
  });
});

// --- D8 (T7-E5): observaciones con código del .dae real contra su fila del listado del PDF. ---
// Si falla, se para y se avisa: no se toca la tolerancia ni el listado (spec-t7 §2).

const ROOT = path.resolve(__dirname, "..", "..");

function failuresOf(observations: readonly Observation[], rows: readonly ListadoRow[], toleranceMm: number) {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const params: EngineParams = { toleranceMm, ...DEFAULT_PARAMS };
  let checked = 0;
  const failures: { code: string; instanceKey: string; deviationMm: number | null }[] = [];
  for (const o of observations) {
    const name = normalizeName(o.rawName);
    if (name.kind !== "canonico" && name.kind !== "anomalo") continue;
    const type = byCode.get(name.code);
    if (type === undefined) continue;
    checked++;
    const r = checkDims(o, type, params);
    if (!r.ok) failures.push({ code: name.code, instanceKey: o.instanceKey, deviationMm: r.deviationMm });
  }
  return { checked, failures };
}

describe("D8: primer fixture, .dae contra el listado del PDF", () => {
  it("las 33 observaciones con código cumplen con tol = olmoDef.toleranceMm", () => {
    const observed = observeDae(readFileSync(path.join(ROOT, "public", "models", "Olmo", "olmo.dae")));
    const listing = toListing("olmo", validateFurniture(olmoDocuments()));
    if (listing.status === "bloqueado") throw new Error(listing.reason);
    expect(olmoDef.toleranceMm).toBe(2);
    const { checked, failures } = failuresOf(observed.observations, listing.pieces, olmoDef.toleranceMm);
    expect(checked).toBe(33);
    expect(failures).toEqual([]);
  });
});

// Segundo fixture: local (carpeta ignorada), misma detección que TP-40b.
const SABRINA = path.join(ROOT, "Sabrina");
const SABRINA_DEF = path.join(SABRINA, "data", "sabrina.def.ts");
const SABRINA_DAE_DIR = path.join(SABRINA, "Archivo Collada");
const sabrinaDae = existsSync(SABRINA_DAE_DIR) ? readdirSync(SABRINA_DAE_DIR).find((name) => name.toLowerCase().endsWith(".dae")) : undefined;
const hasSabrina = HAS_SABRINA_FIXTURE && existsSync(SABRINA_DEF) && sabrinaDae !== undefined;
const sabrinaDef: FurnitureDef | undefined = hasSabrina ? ((await import(/* @vite-ignore */ SABRINA_DEF)) as { sabrinaDef: FurnitureDef }).sabrinaDef : undefined;

describe.skipIf(!hasSabrina)("D8b: segundo fixture (local)", () => {
  it("todas las observaciones con código cumplen con la tolerancia de su mueble", () => {
    const def = sabrinaDef as FurnitureDef;
    const observed = observeDae(readFileSync(path.join(SABRINA_DAE_DIR, sabrinaDae as string)));
    const listing = toListing(def.furniture.id, validateFurniture(sabrinaDocuments()));
    if (listing.status === "bloqueado") throw new Error(listing.reason);
    const { checked, failures } = failuresOf(observed.observations, listing.pieces, def.toleranceMm);
    // Sin cifras escritas: se compara con el total de instancias del propio listado.
    expect(checked).toBe(listing.pieces.reduce((n, piece) => n + piece.quantity, 0));
    expect(failures.length, "observaciones fuera de tolerancia (detalle omitido a propósito)").toBe(0);
  });
});
