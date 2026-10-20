// I4 del importador de prueba (docs/spec-importador-prueba.md): el informe de validación cruza el CSV con el
// olmo.dae real (reutiliza verifyModel y checkAssociation) y define el estado. Dos fixtures: el CSV con todos
// los códigos en M01 (D6) y el CSV v2 original, con M02/M03 en 14 piezas (caso de desajuste).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { measureDimsMm } from "@/importer/dims";
import { buildImportReport } from "@/importer/report";
import { LISTADO_M01, LISTADO_V2_DESAJUSTE, editCell, readFixture } from "./helpers/csv";
import { loadDaeModel } from "./helpers/loadModel";

const model = loadDaeModel(path.join(__dirname, "..", "public", "models", "olmo.dae"));
const IMPORT_ID = "0123456789abcdef";

const report = (csvText: string) => buildImportReport({ csvText, parts: model.parts, importId: IMPORT_ID });

describe("I4: informe de validación contra el olmo.dae", () => {
  it("CSV con todos los códigos en M01: el informe queda correcto", () => {
    const r = report(readFixture(LISTADO_M01));
    expect(r.status).toBe("correcto");
    expect(r.issues).toEqual([]);
    expect(r.verification).toMatchObject({ types: 21, instances: 33, distinctCodes: 21, warnings: [] });
    expect(r.association).toEqual({ orphans: [], ambiguous: [], countMismatches: [], ok: true });
  });

  it("D9: las medidas generales salen de la caja de las piezas del .dae", () => {
    // Medido: 1200 x 750 x 571. El mock dice 550 de profundidad (la de los cuerpos); la caja de todas las
    // piezas llega a 571 porque las tapas de los cajones sobresalen del frente.
    const dims = { x: 1200, y: 750, z: 571 };
    expect(measureDimsMm(model.parts)).toEqual(dims);
    expect(report(readFixture(LISTADO_M01)).def?.furniture.dimsMm).toEqual(dims);
  });

  it("las anomalías del .dae se informan pero no cambian el estado (el `__` de C01)", () => {
    const r = report(readFixture(LISTADO_M01));
    expect(r.verification?.anomalies).toHaveLength(1);
    expect(r.verification?.anomalies[0]).toContain("_0001-01-M01-C01__");
    expect(r.status).toBe("correcto");
  });

  describe("CSV v2 original (M02/M03 en 14 piezas)", () => {
    const r = report(readFixture(LISTADO_V2_DESAJUSTE));

    it("el CSV en sí es válido: el estado es 'con advertencias', no 'bloqueado' (R5: se puede subir)", () => {
      expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(r.status).toBe("con-advertencias");
    });

    it("señala 14 tipos sin instancias (C04–C15, C20 y C21 llevan M02/M03 en el CSV)", () => {
      expect(r.association?.countMismatches).toHaveLength(14);
      for (const suffix of ["C04", "C09", "C15", "C20", "C21"]) {
        expect(r.association?.countMismatches.some((m) => m.includes(`-${suffix}:`))).toBe(true);
      }
      // Los 7 tipos que conservan M01 (C01–C03, C16–C19) no aparecen.
      for (const suffix of ["C01", "C02", "C03", "C16", "C17", "C18", "C19"]) {
        expect(r.association?.countMismatches.some((m) => m.includes(`-${suffix}:`))).toBe(false);
      }
    });

    it("deja huérfanas las instancias del .dae que ningún tipo reclama", () => {
      // El .dae tiene 33 instancias; solo las 9 de los tipos que conservan M01 se asocian.
      // Las otras 33 − 9 = 24 (los mismos 14 tipos, con M01 en el .dae) quedan huérfanas.
      expect(r.association?.orphans).toHaveLength(24);
      expect(r.association?.orphans.every((id) => id.startsWith("0001-01-M01-C"))).toBe(true);
      expect(r.association?.orphans).toContain("0001-01-M01-C04#1");
      expect(r.association?.orphans).not.toContain("0001-01-M01-C01#1");
      expect(r.association?.ambiguous).toEqual([]);
      expect(r.association?.ok).toBe(false);
    });

    it("la verificación del cruce también avisa de las cantidades que no coinciden", () => {
      expect(r.verification?.warnings.length).toBeGreaterThanOrEqual(14);
    });
  });

  it("un CSV con errores bloquea (R5) y no llega a cruzarse con el .dae", () => {
    const r = report(editCell(readFixture(LISTADO_M01), 3, "largo_mm", "abc"));
    expect(r.status).toBe("bloqueado");
    expect(r.issues.some((i) => i.severity === "error" && i.row === 3 && i.column === "largo_mm")).toBe(true);
    expect(r.verification).toBeNull();
    expect(r.association).toBeNull();
  });

  it("una medida fuera de tolerancia del .dae es advertencia, no bloqueo", () => {
    // C01 mide 980 x 550 en el .dae; con 1000 en el CSV, la diferencia de 20 mm supera los 2 mm.
    const r = report(editCell(readFixture(LISTADO_M01), 2, "largo_mm", "1000"));
    expect(r.status).toBe("con-advertencias");
    expect(r.verification?.warnings.some((w) => w.includes("0001-01-M01-C01#1"))).toBe(true);
    expect(r.association?.ok).toBe(true);
  });
});
