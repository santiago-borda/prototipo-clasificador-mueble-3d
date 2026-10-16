// A1–A5 y A8–A9 con el modelo real de Sabrina (caso limpio, segundo fixture junto a Olmo).
// El .dae y la tabla de piezas están en la carpeta ignorada `Sabrina/` (titularidad pendiente): si faltan,
// todo este archivo se saltea (A7) y la suite sigue en verde.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { checkAssociation } from "@/data/mapping";
import { createRegistry } from "@/data/registry";
import type { FurnitureDef } from "@/data/types";
import { componentCode } from "@/model/ids";
import { verifyModel } from "@/model/verifyModel";
import { computeEdgeLayout } from "@/model/edgeLayout";
import { collectEdgeFaces } from "./helpers/edgeFaces";
import { loadDaeModel, loadDaeScene } from "./helpers/loadModel";

const ROOT = path.join(__dirname, "..", "Sabrina");
const DEF_FILE = path.join(ROOT, "data", "sabrina.def.ts");
const DAE_DIR = path.join(ROOT, "Archivo Collada");
const daeName = fs.existsSync(DAE_DIR) ? fs.readdirSync(DAE_DIR).find((name) => name.toLowerCase().endsWith(".dae")) : undefined;
const available = fs.existsSync(DEF_FILE) && daeName !== undefined;

// Import dinámico por ruta calculada: si la carpeta no existe, no se intenta resolver nada.
const sabrinaDef: FurnitureDef | undefined = available
  ? ((await import(/* @vite-ignore */ DEF_FILE)) as { sabrinaDef: FurnitureDef }).sabrinaDef
  : undefined;

describe.skipIf(!available)("Sabrina (modelo real)", () => {
  const def = sabrinaDef as FurnitureDef;
  const model = available ? loadDaeModel(path.join(DAE_DIR, daeName as string)) : undefined;
  const parts = model?.parts ?? [];
  const result = verifyModel(parts, def?.pieceTypes ?? [], { toleranceMm: def?.toleranceMm });

  // A1 -------------------------------------------------------------------------------------------
  it("A1: carga sin excepciones; 29 códigos únicos tras normalizar y 105 instancias", () => {
    expect(model).toBeDefined();
    expect(def.pieceTypes).toHaveLength(29);
    expect(new Set(def.pieceTypes.map((p) => p.code)).size).toBe(29);
    expect(result.distinctCodes).toBe(29);
    expect(parts).toHaveLength(105);
    expect(result.anomalies).toEqual([]); // sin `__` ni nombres raros
  });

  it("A1: la cantidad de instancias por código es la del listado (50 + 42 + 13)", () => {
    for (const piece of def.pieceTypes) {
      const n = parts.filter((p) => componentCode(p.instanceId) === piece.code).length;
      expect(n, piece.code).toBe(piece.quantity);
    }
    const byMaterial = (material: string) =>
      def.pieceTypes.filter((p) => p.material === material).reduce((sum, p) => sum + p.quantity, 0);
    expect([byMaterial("Blanco"), byMaterial("Cedro"), byMaterial("Fondo blanco")]).toEqual([50, 42, 13]);
  });

  // A2 -------------------------------------------------------------------------------------------
  it("A2: las medidas del .dae coinciden con el listado dentro de la tolerancia (0,5 mm)", () => {
    expect(def.toleranceMm).toBe(0.5);
    expect(result.warnings).toEqual([]);
    expect(result.maxDeviationMm).toBeLessThanOrEqual(def.toleranceMm);
  });

  it("A2: 0,5 mm distingue una medida 'ajustada' (1 mm de diferencia); 2 mm no", () => {
    const first = def.pieceTypes[0];
    const shifted = [{ ...first, lengthMm: first.lengthMm + 1 }];
    const only = parts.filter((p) => componentCode(p.instanceId) === first.code);
    expect(verifyModel(only, shifted, { toleranceMm: 0.5 }).warnings.length).toBeGreaterThan(0);
    expect(verifyModel(only, shifted, { toleranceMm: 2 }).warnings).toEqual([]);
  });

  // A3 -------------------------------------------------------------------------------------------
  it("A3: las 24 líneas sueltas quedan excluidas y no hay mallas sin identificar", () => {
    expect(model?.excluded).toEqual({ lineObjects: 24, meshesWithoutCode: 0 });
  });

  // A4 -------------------------------------------------------------------------------------------
  it("A4: cada instancia la reclama exactamente un tipo y cada tipo reclama `quantity` instancias", () => {
    const report = checkAssociation(
      parts.map((p) => p.instanceId),
      def.pieceTypes,
    );
    expect(report).toEqual({ orphans: [], ambiguous: [], countMismatches: [], ok: true });
  });

  // A5 -------------------------------------------------------------------------------------------
  it("A5: los códigos de la cómoda de Sabrina chocan con los de Olmo, y el registro los mantiene separados", () => {
    const registry = createRegistry([olmoDef, def]);
    const olmoCodes = new Set(olmoDef.pieceTypes.map((p) => p.code));
    const shared = def.pieceTypes.filter((p) => olmoCodes.has(p.code));
    expect(shared.length).toBe(15); // C01–C15 repiten `0001-01-M01-Cxx`

    for (const piece of def.pieceTypes) expect(registry.findDefByQrId(piece.qrId)).toBe(def);
    for (const piece of olmoDef.pieceTypes) expect(registry.findDefByQrId(piece.qrId)).toBe(olmoDef);
    expect(registry.findDefByQrId(def.furniture.qrId)).toBe(def);
    for (const mod of def.modules) expect(registry.findDefByQrId(mod.qrId)).toBe(def);
  });

  // A8 -------------------------------------------------------------------------------------------
  // Canteado: tabla "Tiras de cantos" de los PDF (leyenda del equipo, ASUMIDO), contrastada con las caras de canto
  // del .dae: cada instancia tiene tantos lados largos y cortos como caras de canto largas y cortas.
  const tolMm = def?.toleranceMm ?? 0.5;
  const edgeFaces = available ? collectEdgeFaces(loadDaeScene(path.join(DAE_DIR, daeName as string))) : [];
  const lengthOf = (code: string) => def.pieceTypes.find((p) => p.code === code);

  it("A8: el canteado está completo: ninguna pieza queda sin dato y los fondos de 3 mm no llevan canto", () => {
    for (const piece of def.pieceTypes) {
      expect(piece.edgeBanding, piece.code).not.toBeNull();
      if (piece.thicknessMm === 3) expect(piece.edgeBanding, piece.code).toEqual([]);
    }
    expect(def.pieceTypes.filter((p) => (p.edgeBanding?.length ?? 0) > 0)).toHaveLength(25);
  });

  it("A8: cada instancia tiene tantos lados largos y cortos como caras de canto en el .dae", () => {
    expect(edgeFaces).toHaveLength(105);
    for (const instance of edgeFaces) {
      const piece = lengthOf(instance.code);
      expect(piece, instance.code).toBeDefined();
      const largos = instance.runsMm.filter((run) => Math.abs(run - (piece?.lengthMm ?? 0)) <= tolMm).length;
      const cortos = instance.runsMm.filter((run) => Math.abs(run - (piece?.widthMm ?? 0)) <= tolMm).length;
      expect(largos + cortos, `${instance.code}: caras de canto sin clasificar`).toBe(instance.runsMm.length);
      const edges = piece?.edgeBanding ?? [];
      expect({ code: instance.code, largos, cortos }).toEqual({
        code: instance.code,
        largos: edges.filter((e) => e.startsWith("largo")).length,
        cortos: edges.filter((e) => e.startsWith("corto")).length,
      });
    }
  });

  it("A8: el mapeo de la leyenda del equipo (inf/sup/izq/der) a EdgeId sigue la convención de Olmo", () => {
    const edges = (suffix: string) => def.pieceTypes.find((p) => p.code.endsWith(`-${suffix}`))?.edgeBanding;
    expect(edges("C11")).toEqual(["largo-A"]); // [sup]
    expect(edges("C13")).toEqual(["largo-B", "largo-A", "corto-A", "corto-B"]); // [inf, sup, izq, der]
    expect(edges("C01")).toEqual(["largo-B", "corto-A", "corto-B"]); // [inf, izq, der]
    expect(edges("C04")).toEqual(["corto-A"]); // [izq]
    expect(edges("C08")).toEqual(["corto-B"]); // [der]
  });

  // A9 -------------------------------------------------------------------------------------------
  it("A9: en el 3D, los bordes marcados largos miden lengthMm y los cortos widthMm (también con largo < ancho)", () => {
    for (const piece of def.pieceTypes) {
      const edges = piece.edgeBanding ?? [];
      if (edges.length === 0) continue;
      const part = parts.find((p) => componentCode(p.instanceId) === piece.code);
      expect(part, piece.code).toBeDefined();
      const layout = computeEdgeLayout(part!.geometry, edges, { lengthMm: piece.lengthMm, widthMm: piece.widthMm });
      for (const band of layout.bands) {
        const runMm = Math.max(...band.size) * 1000 - 0; // el canto corre a lo largo de su dimensión mayor
        const expected = band.id.startsWith("largo") ? piece.lengthMm : piece.widthMm;
        expect(Math.abs(runMm - expected), `${piece.code} ${band.id}`).toBeLessThanOrEqual(tolMm);
      }
    }
  });
});
