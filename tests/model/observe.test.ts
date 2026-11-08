// Adapter .dae → Observation (spec-motor §4a y §5.2; plan T4; docs/spec-adapter-observation-listadoid.md §3).
// .dae sintéticos de tests/helpers/daeBuilder.ts (Y arriba: los ejes del XML son los del marco) y el .dae real.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { modelId } from "@/engine/hash";
import { FRAME_VERSION } from "@/engine/versions";
import { DaeStructureError } from "@/model/daeIndex";
import { OddEdgeTrianglesError, observeDae, type DaeObservation } from "@/model/observe";
import { buildDae, enc, type PanelSpec } from "../helpers/daeBuilder";

const ROOT = path.resolve(__dirname, "..", "..");
const OLMO = path.join(ROOT, "public", "models", "Olmo", "olmo.dae");
const close = (values: number[]) => values.map((v) => expect.closeTo(v, 3));
const one = (panel: PanelSpec, unit?: { meter: number; name: string }) => observeDae(enc(buildDae({ unit, panels: [panel] }))).observations[0];
const panel = (overrides: Partial<PanelSpec> = {}): PanelSpec => ({ name: "_9999-01-M01-C01", sizeMm: [500, 300, 18], atMm: [0, 0, 0], ...overrides });

describe("detector de canto en el adapter (§13: paneles contados a mano)", () => {
  it("panel 500 x 300 con canto en los dos lados largos → [500, 500]", () => {
    expect(one(panel({ cantoFaces: ["y-", "y+"] })).edgeRunsMm).toEqual(close([500, 500]));
  });

  it("largo < ancho (300 de largo, 500 de ancho): devuelve largos crudos, sin clasificar", () => {
    expect(one(panel({ sizeMm: [300, 500, 18], cantoFaces: ["y-"] })).edgeRunsMm).toEqual(close([300]));
  });

  it("largo ≈ ancho (400 x 401): dos caras con largos 400 y 401", () => {
    expect(one(panel({ sizeMm: [400, 401, 18], cantoFaces: ["x-", "y-"] })).edgeRunsMm).toEqual(close([400, 401]));
  });

  it('sin caras Canto_* → "no-disponible"', () => {
    expect(one(panel()).edgeRunsMm).toBe("no-disponible");
  });

  it("cantidad impar de triángulos de canto → OddEdgeTrianglesError con instanceKey", () => {
    const bytes = enc(buildDae({ panels: [panel({ cantoFaces: ["y-", "y+"] })], oddCantoTriangles: true }));
    let error: unknown;
    try {
      observeDae(bytes);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(OddEdgeTrianglesError);
    expect((error as OddEdgeTrianglesError).instanceKey).toMatch(/^ID\d+$/);
    expect((error as OddEdgeTrianglesError).count).toBe(3);
  });
});

describe("observeDae: campos de Observation", () => {
  it("unidad: el mismo panel en pulgadas y en cm da el mismo sizeMm, ascendente", () => {
    const p = panel({ atMm: [100, 200, 300] });
    const inch = one(p, { meter: 0.0254, name: "inch" });
    const cm = one(p, { meter: 0.01, name: "centimeter" });
    expect(inch.sizeMm).toEqual(close([18, 300, 500]));
    expect(cm.sizeMm).toEqual(close(inch.sizeMm));
  });

  it("orientación por el eje del espesor: Y → horizontal, X → vertical-lateral, Z → vertical-frontal", () => {
    expect(one(panel({ sizeMm: [500, 18, 300] })).orientation).toBe("horizontal");
    expect(one(panel({ sizeMm: [18, 300, 500] })).orientation).toBe("vertical-lateral");
    expect(one(panel({ sizeMm: [500, 300, 18] })).orientation).toBe("vertical-frontal");
  });

  it("empate en el eje menor: gana el primer eje (X, Y, Z), para que sea determinista", () => {
    expect(one(panel({ sizeMm: [100, 100, 100] })).orientation).toBe("vertical-lateral");
    expect(one(panel({ sizeMm: [500, 18, 18] })).orientation).toBe("horizontal");
  });

  it("panel girado 90° en Z sigue alineado y cambia de orientación", () => {
    const turned = one(panel({ sizeMm: [500, 18, 300], rotZDeg: 90 }));
    expect(turned.axisAligned).toBe(true);
    expect(turned.orientation).toBe("vertical-lateral");
    expect(turned.sizeMm).toEqual(close([18, 300, 500]));
  });

  it("panel girado 30° en Z: axisAligned false", () => {
    expect(one(panel({ rotZDeg: 30 })).axisAligned).toBe(false);
  });

  it("triángulos degenerados (área nula) no cuentan para axisAligned", () => {
    // Caja de espesor 0: las caras laterales son triángulos de área nula.
    expect(one(panel({ sizeMm: [500, 300, 0] })).axisAligned).toBe(true);
  });

  it("transformada espejada → mirrored true; sin espejo, false", () => {
    expect(one(panel({ mirrorX: true })).mirrored).toBe(true);
    expect(one(panel()).mirrored).toBe(false);
  });

  it("centerRel y crossesMidplane respecto de la caja de referencia (cruzar es estricto: tocar no cruza)", () => {
    const p = (x: number): PanelSpec => panel({ sizeMm: [100, 18, 300], atMm: [x, 0, 0] });
    const result = observeDae(enc(buildDae({ panels: [p(0), p(450), p(400), p(900)] })));
    expect(result.referenceBoxMm.min).toEqual(close([0, 0, 0]));
    expect(result.referenceBoxMm.max).toEqual(close([1000, 18, 300]));
    expect(result.observations.map((o) => o.centerRel[0])).toEqual(close([0.05, 0.5, 0.45, 0.95]));
    expect(result.observations.map((o) => o.crossesMidplane[0])).toEqual([false, true, false, false]);
    for (const o of result.observations) {
      expect(o.centerRel.slice(1)).toEqual(close([0.5, 0.5]));
      expect(o.crossesMidplane.slice(1)).toEqual([true, true]);
    }
  });

  it("caja de referencia sin espesor en un eje: centerRel 0,5 y no cruza", () => {
    const flat = one(panel({ sizeMm: [500, 300, 0] }));
    expect(flat.centerRel[2]).toBe(0.5);
    expect(flat.crossesMidplane[2]).toBe(false);
  });

  it("rawName del XML (inválido y malla suelta) y una observación por entrada del índice", () => {
    const result = observeDae(enc(buildDae({ panels: [panel({ name: "pieza rara" }), panel({ name: null, atMm: [600, 0, 0] })], lineObjects: 2 })));
    expect(result.observations.map((o) => o.rawName)).toEqual(["pieza rara", null]);
    expect(result.lineObjects).toBe(2);
  });

  it("dos instancias del mismo componente: dos observaciones con instanceKey distinto", () => {
    const shared = (x: number) => panel({ sharedComponent: "a", atMm: [x, 0, 0] });
    const result = observeDae(enc(buildDae({ panels: [shared(0), shared(600)] })));
    expect(result.observations).toHaveLength(2);
    expect(new Set(result.observations.map((o) => o.instanceKey)).size).toBe(2);
    expect(result.observations.map((o) => o.centerRel[0])).toEqual(close([500 / 2200, 1700 / 2200]));
  });

  it("modelId = modelId(bytes) del .dae (con \\r\\n → \\n), igual en cada observación; frameVersion marco/1", () => {
    const xml = buildDae({ panels: [panel()] });
    const lf = observeDae(enc(xml));
    const crlf = observeDae(enc(xml.replace(/\n/g, "\r\n")));
    expect(lf.modelId).toBe(modelId(enc(xml)));
    expect(crlf.modelId).toBe(lf.modelId);
    for (const o of lf.observations) expect(o).toMatchObject({ modelId: lf.modelId, frameVersion: FRAME_VERSION });
  });

  it("una instancia sin triángulos en la escena → DaeStructureError", () => {
    const xml = buildDae({ panels: [], lineObjects: 1 }).replace(
      "<library_nodes>",
      `<library_nodes><node id="SOLO-LINEAS" name="_9999-01-M01-C05"><instance_geometry url="#ID100"/></node>`,
    ).replace(`<node name="raiz">`, `<node name="raiz"><node id="INST" name="i"><instance_node url="#SOLO-LINEAS"/></node>`);
    expect(() => observeDae(enc(xml))).toThrowError(DaeStructureError);
  });
});

describe("observeDae con el .dae real del primer fixture", () => {
  const bytes = readFileSync(OLMO);
  const obs: DaeObservation = observeDae(bytes);

  it("39 observaciones, 6 con rawName null, ninguna con Canto_, todas alineadas, ninguna espejada", () => {
    expect(obs.observations).toHaveLength(39);
    expect(obs.observations.filter((o) => o.rawName === null)).toHaveLength(6);
    expect(obs.observations.every((o) => o.edgeRunsMm === "no-disponible" && o.axisAligned && !o.mirrored)).toBe(true);
    expect(obs.lineObjects).toBe(0);
    expect(new Set(obs.observations.map((o) => o.instanceKey)).size).toBe(39);
  });

  it("I6: modelId es el hash del .dae, nunca el furnitureId ni la URL del modelo", () => {
    expect(obs.modelId).toBe(modelId(bytes));
    expect(obs.modelId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(obs.modelId).not.toBe(olmoDef.furniture.id);
    expect(obs.modelId).not.toBe(olmoDef.modelUrl);
  });

  it("marco v1: las tapas de cajón (C12, C13) están en la mitad del frente (+Z)", () => {
    const tapas = obs.observations.filter((o) => /-C1[23]$/.test(o.rawName ?? ""));
    expect(tapas).toHaveLength(2);
    for (const o of tapas) {
      expect(o.orientation, o.rawName ?? "").toBe("vertical-frontal");
      expect(o.centerRel[2], o.rawName ?? "").toBeGreaterThan(0.5);
    }
  });
});

describe("dónde corre observe.ts (importa @/engine/hash, que usa node:crypto)", () => {
  const filesUnder = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => path.join(ROOT, dir, f));
  const IMPORTS_OBSERVE = /from\s+["'](@\/model\/observe|[./]+(model\/)?observe)["']/;

  it("ningún archivo con \"use client\" ni de src/pdf/ ni de src/engine/ importa el adapter", () => {
    const clients = filesUnder("src").filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(clients.length).toBeGreaterThan(0);
    for (const file of [...clients, ...filesUnder("src/pdf"), ...filesUnder("src/engine")]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_OBSERVE);
    }
  });
});
