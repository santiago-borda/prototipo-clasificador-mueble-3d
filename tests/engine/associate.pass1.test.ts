// T8: pasada 1 del motor (docs/spec-t8-pasada-1.md v0.2, §3 y §4; spec-motor §6.1 y §6.2; plan T8, M5 parte
// pasada 1 y M15). Casos armados a mano (K1 a K16) y los fixtures reales (K17; K17b se saltea si falta Sabrina/ y
// no escribe códigos ni cifras).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import type { FurnitureDef } from "@/data/types";
import { associatePass1, ModeloDistintoError, type Pass1Result } from "@/engine/associate";
import { normalizeName } from "@/engine/normalize";
import { DEFAULT_PARAMS, type Evidence, type InstanceResult, type Reason } from "@/engine/types";
import { observeDae } from "@/model/observe";
import { toListing } from "@/pdf/listing";
import { validateFurniture } from "@/pdf/validate";
import { code, input, obs, OTHER_MODEL_ID, row } from "../helpers/engineFixtures";
import { HAS_SABRINA_FIXTURE, olmoDocuments, sabrinaDocuments } from "../helpers/pdfFixtures";

const only = (r: Pass1Result): InstanceResult => {
  expect(r.results).toHaveLength(1);
  return r.results[0];
};
const kinds = (e: readonly Evidence[]) => e.map((x) => x.kind);
const byKey = (r: Pass1Result, key: string): InstanceResult => {
  const found = r.results.find((x) => x.instanceKey === key);
  if (found === undefined) throw new Error(`sin resultado para ${key}`);
  return found;
};

describe("K1 a K8: niveles y razones, una instancia", () => {
  it("K1: canónico, medidas ok, cupo ok → segura con codigo-exacto", () => {
    const r = only(associatePass1(input([obs("_C01")], [row("C01", 1)])));
    expect(r).toMatchObject({ level: "segura", pieceCode: code("C01"), reasons: ["codigo-exacto"], warnings: [], candidates: [] });
    expect(kinds(r.evidence)).toEqual(["codigo", "espesor", "medidas", "cantidad"]);
    expect(r.evidence.every((e) => e.result === "cumple")).toBe(true);
  });

  it.each<[string, string, { size?: [number, number, number]; axisAligned?: boolean }, Reason[], Evidence["kind"][]]>([
    ["K2: anómalo, medidas ok", "_C01__", {}, ["nombre-anomalo"], ["codigo", "espesor", "medidas", "cantidad"]],
    ["K3: anómalo e inexistente", "_C09__", {}, ["nombre-anomalo", "codigo-inexistente"], ["codigo"]],
    ["K4: formato inválido", "panel", {}, ["formato-invalido"], ["codigo"]],
    ["K5: medidas fuera", "_C01", { size: [18, 300, 510] }, ["medida-fuera-de-tolerancia"], ["codigo", "espesor", "medidas", "cantidad"]],
    ["K6: no alineada", "_C01", { axisAligned: false }, ["geometria-no-alineada"], ["codigo", "espesor", "medidas", "cantidad"]],
    ["K7: anómalo y medidas fuera", "_C01__", { size: [18, 300, 510] }, ["nombre-anomalo", "medida-fuera-de-tolerancia"], ["codigo", "espesor", "medidas", "cantidad"]],
  ])("%s → dudosa", (_, name, o, reasons, evidenceKinds) => {
    const r = only(associatePass1(input([obs(name, o)], [row("C01", 1)])));
    expect(r).toMatchObject({ level: "dudosa", pieceCode: null, reasons, warnings: [], candidates: [] });
    expect(kinds(r.evidence)).toEqual(evidenceKinds);
  });

  it("K6: la evidencia de medidas sale no-disponible (la decide checkDims, no axisAligned)", () => {
    const r = only(associatePass1(input([obs("_C01", { axisAligned: false })], [row("C01", 1)])));
    expect(r.evidence.filter((e) => e.kind === "espesor" || e.kind === "medidas").map((e) => e.result)).toEqual(["no-disponible", "no-disponible"]);
  });

  it("K8: sin componente → sin-asociar, sin evidencia, inconsistencia sin-componente con su clave", () => {
    const run = associatePass1(input([obs(null, { key: "ID7" })], []));
    expect(only(run)).toEqual({
      instanceKey: "ID7",
      level: "sin-asociar",
      pieceCode: null,
      reasons: ["sin-componente"],
      warnings: [],
      candidates: [],
      evidence: [],
    });
    expect(run.inconsistencies).toEqual([{ kind: "sin-componente", pieceCode: null, instanceKeys: ["ID7"], detail: "malla sin componente" }]);
    expect(run.typeSummary).toEqual([]);
  });
});

describe("K9 a K13: cupo e inconsistencias por tipo (M15)", () => {
  it("K9: 3 reclamantes, quantity 2 → las 3 dudosas con cupo-excedido; cupo-excedido y sin-confirmar (T8-E6)", () => {
    const run = associatePass1(input([obs("_C01", { key: "ID1" }), obs("_C01", { key: "ID2" }), obs("_C01", { key: "ID3" })], [row("C01", 2)]));
    for (const r of run.results) {
      expect(r).toMatchObject({ level: "dudosa", pieceCode: null, reasons: ["cupo-excedido"] });
      expect(r.evidence.at(-1)).toEqual({ kind: "cantidad", result: "no-cumple", detail: "reclamantes 3, cantidad del listado 2" });
    }
    expect(run.inconsistencies).toEqual([
      { kind: "cupo-excedido", pieceCode: code("C01"), instanceKeys: ["ID1", "ID2", "ID3"], detail: "reclamantes 3, cantidad del listado 2" },
      { kind: "sin-confirmar", pieceCode: code("C01"), instanceKeys: ["ID1", "ID2", "ID3"], detail: "seguras 0, reclamantes 3" },
    ]);
    expect(run.typeSummary).toEqual([{ pieceCode: code("C01"), quantity: 2, claimants: 3, seguras: 0 }]);
  });

  it("K9: un reclamante fuera de medida suma cupo-excedido después de su razón de medidas", () => {
    const run = associatePass1(
      input([obs("_C01", { key: "ID1" }), obs("_C01", { key: "ID2", size: [18, 300, 510] }), obs("_C01", { key: "ID3" })], [row("C01", 2)]),
    );
    expect(byKey(run, "ID2").reasons).toEqual(["medida-fuera-de-tolerancia", "cupo-excedido"]);
    expect(byKey(run, "ID1").reasons).toEqual(["cupo-excedido"]);
  });

  it("K10: 1 reclamante, quantity 2 → faltante con 1 clave; la instancia sigue segura", () => {
    const run = associatePass1(input([obs("_C01", { key: "ID1" })], [row("C01", 2)]));
    expect(only(run)).toMatchObject({ level: "segura", reasons: ["codigo-exacto"] });
    expect(run.inconsistencies).toEqual([{ kind: "faltante", pieceCode: code("C01"), instanceKeys: ["ID1"], detail: "reclamantes 1, cantidad del listado 2" }]);
    expect(run.typeSummary).toEqual([{ pieceCode: code("C01"), quantity: 2, claimants: 1, seguras: 1 }]);
  });

  it("K11: 2 reclamantes, uno fuera de medida → sin-confirmar con la clave del que no es seguro", () => {
    const run = associatePass1(input([obs("_C01", { key: "ID1" }), obs("_C01", { key: "ID2", size: [18, 300, 510] })], [row("C01", 2)]));
    expect(byKey(run, "ID1").level).toBe("segura");
    expect(byKey(run, "ID2").level).toBe("dudosa");
    expect(run.inconsistencies).toEqual([{ kind: "sin-confirmar", pieceCode: code("C01"), instanceKeys: ["ID2"], detail: "seguras 1, reclamantes 2" }]);
  });

  it("K12: código en dos filas → dudosa codigo-duplicado; ni faltante, ni sin-confirmar, ni typeSummary para ese código", () => {
    const run = associatePass1(
      input(
        [obs("_C01", { key: "ID1" }), obs("_C01__", { key: "ID2" }), obs("_C02", { key: "ID3" })],
        [row("C01", 5), row("C01", 1, { name: "Otro" }), row("C02", 1)],
      ),
    );
    expect(byKey(run, "ID1")).toMatchObject({ level: "dudosa", pieceCode: null, reasons: ["codigo-duplicado"] });
    expect(byKey(run, "ID2").reasons).toEqual(["nombre-anomalo", "codigo-duplicado"]);
    // No se mide ni entra en cupo: solo la evidencia de código.
    expect(kinds(byKey(run, "ID1").evidence)).toEqual(["codigo"]);
    expect(run.inconsistencies).toEqual([]);
    expect(run.typeSummary).toEqual([{ pieceCode: code("C02"), quantity: 1, claimants: 1, seguras: 1 }]);
  });

  it("K13: tipo sin instancias → faltante con instanceKeys []", () => {
    const run = associatePass1(input([obs("_C01")], [row("C01", 1), row("C02", 1)]));
    expect(run.inconsistencies).toEqual([{ kind: "faltante", pieceCode: code("C02"), instanceKeys: [], detail: "reclamantes 0, cantidad del listado 1" }]);
  });

  it("formato inválido e inexistente no son reclamantes de ningún tipo", () => {
    const run = associatePass1(input([obs("panel", { key: "ID1" }), obs("_C09", { key: "ID2" })], [row("C01", 1)]));
    expect(run.typeSummary).toEqual([{ pieceCode: code("C01"), quantity: 1, claimants: 0, seguras: 0 }]);
    expect(run.inconsistencies.map((i) => i.kind)).toEqual(["faltante"]);
  });
});

describe("K14: otro modelo", () => {
  it("una observación con modelId distinto lanza ModeloDistintoError", () => {
    expect(() => associatePass1(input([obs("_C01", { key: "ID1" }), obs("_C01", { key: "ID2", modelId: OTHER_MODEL_ID })], [row("C01", 2)]))).toThrow(
      ModeloDistintoError,
    );
  });
});

describe("K15: orden", () => {
  const run = associatePass1(
    input(
      [obs("_C02", { key: "ID9" }), obs(null, { key: "ID9/ID1" }), obs(null, { key: "ID10" }), obs("_C04", { key: "ID11", size: [18, 300, 510] }), obs("_C04", { key: "ID100" })],
      [row("C04", 2), row("C03", 1), row("C02", 1), row("C01", 1)],
    ),
  );

  it("results por instanceKey binario (ID10 < ID100 < ID11 < ID9 < ID9/ID1)", () => {
    expect(run.results.map((r) => r.instanceKey)).toEqual(["ID10", "ID100", "ID11", "ID9", "ID9/ID1"]);
  });

  it("typeSummary por código binario", () => {
    expect(run.typeSummary.map((t) => t.pieceCode)).toEqual([code("C01"), code("C02"), code("C03"), code("C04")]);
  });

  it("inconsistencias por kind, pieceCode y claves", () => {
    expect(run.inconsistencies.map((i) => [i.kind, i.pieceCode, i.instanceKeys])).toEqual([
      ["faltante", code("C01"), []],
      ["faltante", code("C03"), []],
      ["sin-componente", null, ["ID10"]],
      ["sin-componente", null, ["ID9/ID1"]],
      ["sin-confirmar", code("C04"), ["ID11"]],
    ]);
  });

  it("no depende del orden de entrada", () => {
    const shuffled = associatePass1(
      input(
        [obs("_C04", { key: "ID100" }), obs(null, { key: "ID10" }), obs("_C04", { key: "ID11", size: [18, 300, 510] }), obs(null, { key: "ID9/ID1" }), obs("_C02", { key: "ID9" })],
        [row("C01", 1), row("C02", 1), row("C04", 2), row("C03", 1)],
      ),
    );
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(run));
  });
});

describe("K16: detail con texto fijo (§3.3)", () => {
  const codigoOf = (name: string | null, listado = [row("C01", 1)]) => only(associatePass1(input([obs(name)], listado))).evidence[0];

  it("canónico y existente", () => {
    expect(codigoOf("_C01")).toEqual({ kind: "codigo", result: "cumple", detail: `código ${code("C01")}, en el listado` });
  });
  it("anómalo y existente (rawName tal cual)", () => {
    expect(codigoOf("_C01__")).toEqual({ kind: "codigo", result: "no-cumple", detail: `nombre anómalo _${code("C01")}__, código ${code("C01")} en el listado` });
  });
  it("formato inválido", () => {
    expect(codigoOf("panel")).toEqual({ kind: "codigo", result: "no-cumple", detail: "nombre sin código válido" });
  });
  it("inexistente (también si es anómalo)", () => {
    expect(codigoOf("_C09")).toEqual({ kind: "codigo", result: "no-cumple", detail: `código ${code("C09")}, no está en el listado` });
    expect(codigoOf("_C09__")).toEqual({ kind: "codigo", result: "no-cumple", detail: `código ${code("C09")}, no está en el listado` });
  });
  it("duplicado", () => {
    expect(codigoOf("_C01", [row("C01", 1), row("C01", 1), row("C01", 2)])).toEqual({
      kind: "codigo",
      result: "no-cumple",
      detail: `código ${code("C01")}, en 3 filas del listado`,
    });
  });
  it("cantidad que cumple", () => {
    const r = only(associatePass1(input([obs("_C01")], [row("C01", 2)])));
    expect(r.evidence.at(-1)).toEqual({ kind: "cantidad", result: "cumple", detail: "reclamantes 1, cantidad del listado 2" });
  });
  it("espesor y medidas son los de checkDims, tal cual", () => {
    const r = only(associatePass1(input([obs("_C01")], [row("C01", 1)])));
    expect(r.evidence.slice(1, 3).map((e) => e.detail)).toEqual([
      "espesor 18.00 mm, listado 18.00 mm, tolerancia 2.00 mm",
      "medidas 300.00 x 500.00 mm, listado 300.00 x 500.00 mm, tolerancia 2.00 mm",
    ]);
  });
  it("sin rule", () => {
    const r = only(associatePass1(input([obs("_C01")], [row("C01", 1)])));
    for (const e of r.evidence) expect(e).not.toHaveProperty("rule");
  });
});

// --- K17: primer fixture real. Si no coincide se para y se reporta: no se ajusta la regla ni el listado. ---

const ROOT = path.resolve(__dirname, "..", "..");

describe("K17: primer fixture (observeDae + toListing, tol 2 mm)", () => {
  const observed = observeDae(readFileSync(path.join(ROOT, "public", "models", "Olmo", "olmo.dae")));
  const listing = toListing("olmo", validateFurniture(olmoDocuments()));
  if (listing.status === "bloqueado") throw new Error(listing.reason);
  const run = associatePass1({
    furnitureId: "olmo",
    modelId: observed.modelId,
    observations: observed.observations,
    listado: listing.pieces,
    params: { toleranceMm: olmoDef.toleranceMm, ...DEFAULT_PARAMS },
  });
  const count = (level: InstanceResult["level"]) => run.results.filter((r) => r.level === level).length;
  const anomalous = observed.observations.filter((o) => normalizeName(o.rawName).kind === "anomalo");

  it("32 segura, 1 dudosa (C01, nombre-anomalo), 6 sin-asociar", () => {
    expect(olmoDef.toleranceMm).toBe(2);
    expect([count("segura"), count("dudosa"), count("sin-asociar")]).toEqual([32, 1, 6]);
    expect(anomalous).toHaveLength(1);
    const c01 = byKey(run, anomalous[0].instanceKey);
    expect(c01).toMatchObject({ level: "dudosa", reasons: ["nombre-anomalo"] });
    expect(normalizeName(anomalous[0].rawName)).toEqual({ kind: "anomalo", code: "0001-01-M01-C01" });
  });

  it("inconsistencias: sin-confirmar de C01 y 6 sin-componente; ni faltante ni cupo-excedido", () => {
    expect(run.inconsistencies.map((i) => i.kind)).toEqual([...Array<string>(6).fill("sin-componente"), "sin-confirmar"]);
    expect(run.inconsistencies.at(-1)).toMatchObject({ pieceCode: "0001-01-M01-C01", instanceKeys: [anomalous[0].instanceKey] });
  });
});

// Segundo fixture: local (carpeta ignorada), misma detección que D8b. Sin códigos ni cifras.
const SABRINA = path.join(ROOT, "Sabrina");
const SABRINA_DEF = path.join(SABRINA, "data", "sabrina.def.ts");
const SABRINA_DAE_DIR = path.join(SABRINA, "Archivo Collada");
const sabrinaDae = existsSync(SABRINA_DAE_DIR) ? readdirSync(SABRINA_DAE_DIR).find((name) => name.toLowerCase().endsWith(".dae")) : undefined;
const hasSabrina = HAS_SABRINA_FIXTURE && existsSync(SABRINA_DEF) && sabrinaDae !== undefined;
const sabrinaDef: FurnitureDef | undefined = hasSabrina ? ((await import(/* @vite-ignore */ SABRINA_DEF)) as { sabrinaDef: FurnitureDef }).sabrinaDef : undefined;

describe.skipIf(!hasSabrina)("K17b: segundo fixture (local)", () => {
  it("todas las instancias con código son segura; ni faltante ni cupo-excedido", () => {
    const def = sabrinaDef as FurnitureDef;
    const observed = observeDae(readFileSync(path.join(SABRINA_DAE_DIR, sabrinaDae as string)));
    const listing = toListing(def.furniture.id, validateFurniture(sabrinaDocuments()));
    if (listing.status === "bloqueado") throw new Error(listing.reason);
    const run = associatePass1({
      furnitureId: def.furniture.id,
      modelId: observed.modelId,
      observations: observed.observations,
      listado: listing.pieces,
      params: { toleranceMm: def.toleranceMm, ...DEFAULT_PARAMS },
    });
    const coded = new Set(observed.observations.filter((o) => o.rawName !== null).map((o) => o.instanceKey));
    const notSafe = run.results.filter((r) => coded.has(r.instanceKey) && r.level !== "segura");
    expect(notSafe.length, "instancias con código que no quedan segura (detalle omitido a propósito)").toBe(0);
    const bad = run.inconsistencies.filter((i) => i.kind === "faltante" || i.kind === "cupo-excedido");
    expect(bad.length, "faltante o cupo-excedido (detalle omitido a propósito)").toBe(0);
  });
});
