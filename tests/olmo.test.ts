// A6: el caso Olmo (con anomalías) sigue pasando sin regresiones.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { checkAssociation } from "@/data/mapping";
import { textureUrlFor } from "@/model/textureLibrary";
import { verifyModel } from "@/model/verifyModel";
import { loadDaeModel } from "./helpers/loadModel";

const model = loadDaeModel(path.join(__dirname, "..", "public", "models", "Olmo", "olmo.dae"));
const result = verifyModel(model.parts, olmoDef.pieceTypes, { toleranceMm: olmoDef.toleranceMm });

describe("A6: Olmo sin regresiones", () => {
  it("21 tipos, 33 instancias, 0 advertencias y 1 anomalía (el `__` de C01)", () => {
    expect(result.types).toBe(21);
    expect(result.distinctCodes).toBe(21);
    expect(result.instances).toBe(33);
    expect(result.warnings).toEqual([]);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toContain("_0001-01-M01-C01__");
  });

  it("la asociación por código es exacta (sin huérfanas ni ambiguas)", () => {
    const report = checkAssociation(
      model.parts.map((p) => p.instanceId),
      olmoDef.pieceTypes,
    );
    expect(report).toEqual({ orphans: [], ambiguous: [], countMismatches: [], ok: true });
  });

  it("las 6 geometrías sueltas sin código se cuentan como excluidas (y no hay líneas)", () => {
    expect(model.excluded).toEqual({ lineObjects: 0, meshesWithoutCode: 6 });
  });
});

describe("Texturas del Olmo", () => {
  it("cada pieza tiene una superficie con la imagen de su placa, y coincide con el material del listado", () => {
    const expected: Record<string, string> = { "Blanco Nature": "Blanco_nature.png", Gaudi: "GAUDI.jpeg", "MDF blanco": "Blanco_nature.png" };
    for (const part of model.parts) {
      const piece = olmoDef.pieceTypes.find((p) => part.instanceId.startsWith(`${p.code}#`));
      expect(part.surfaces).toHaveLength(1);
      expect(part.surfaces[0].image, part.instanceId).toBe(expected[piece!.material]);
      expect(part.geometry.getAttribute("uv")).toBeDefined();
      expect(part.geometry.groups).toEqual([{ start: 0, count: part.geometry.getAttribute("position").count, materialIndex: 0 }]);
    }
  });

  it("las imágenes del .dae se encuentran en la biblioteca compartida", () => {
    const files = new Set(model.parts.map((p) => p.surfaces[0].image));
    for (const file of files) expect(textureUrlFor(olmoDef, file!), file!).toMatch(/^\/textures\//);
  });
});
