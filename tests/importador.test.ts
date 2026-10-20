// I1–I3 del importador de prueba (docs/spec-importador-prueba.md): lectura del CSV, errores y advertencias,
// armado del FurnitureDef. Módulos puros (R6), sin React, sin three, sin red ni .dae.
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { createRegistry } from "@/data/registry";
import type { FurnitureDef } from "@/data/types";
import { buildFurnitureDef } from "@/importer/buildDef";
import { readListing, type ListingIssue, type ListingResult } from "@/importer/listing";
import {
  LISTADO_M01,
  LISTADO_V2_DESAJUSTE,
  addColumn,
  dropColumn,
  editCell,
  readCell,
  readFixture,
  toSemicolonWithDecimalComma,
} from "./helpers/csv";

const m01 = readFixture(LISTADO_M01);
const v2 = readFixture(LISTADO_V2_DESAJUSTE);

const errors = (result: ListingResult) => result.issues.filter((i) => i.severity === "error");
const warnings = (result: ListingResult) => result.issues.filter((i) => i.severity === "warning");
const totalInstances = (result: ListingResult) => result.rows.reduce((sum, row) => sum + row.instances.length, 0);

/** Los problemas que apuntan a esa fila y columna (la fila 1 es el encabezado). */
const at = (result: ListingResult, row: number, column: string): ListingIssue[] =>
  result.issues.filter((i) => i.row === row && i.column === column);

describe("I1: lectura del CSV", () => {
  it.each([
    [LISTADO_M01, m01],
    [LISTADO_V2_DESAJUSTE, v2],
  ])("%s: 21 filas, 33 instancias y ningún problema", (_name, text) => {
    const result = readListing(text);
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(21);
    expect(totalInstances(result)).toBe(33);
  });

  it("lee los campos de una fila (C04: 2 instancias nombradas, medidas numéricas)", () => {
    const c04 = readListing(m01).rows.find((r) => r.codigo === "0001-01-M01-C04");
    expect(c04).toMatchObject({
      row: 5,
      nombrePieza: "Laterales sector cajones",
      quantity: 2,
      instances: ["Izq", "Der"],
      lengthMm: 550,
      widthMm: 494,
      thicknessMm: 18,
      material: "MDF",
    });
  });

  it("acepta BOM al principio (la primera columna se reconoce)", () => {
    const result = readListing(`﻿${m01}`);
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(21);
    expect(result.rows[0].codigo).toBe("0001-01-M01-C01");
  });

  it("acepta fin de línea CRLF", () => {
    const result = readListing(m01.replaceAll("\n", "\r\n"));
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(21);
  });

  it("acepta `;` como separador y coma decimal; la coma decimal avisa pero no bloquea", () => {
    const text = toSemicolonWithDecimalComma(m01);
    expect(text).toContain("0,22"); // el fixture convertido es el que dice el nombre de la prueba
    expect(text).not.toContain("0.22");

    const result = readListing(text);
    expect(errors(result)).toEqual([]);
    expect(warnings(result).length).toBeGreaterThan(0);
    expect(warnings(result).every((w) => w.column === "canto_espesor_mm")).toBe(true);
    expect(result.rows).toHaveLength(21);
    expect(totalInstances(result)).toBe(33);

    const c01 = result.rows.find((r) => r.codigo === "0001-01-M01-C01");
    expect(c01?.edgeBanding?.thicknessMm).toBe(0.22);
  });
});

describe("I2: errores y advertencias con fila y columna", () => {
  // En los fixtures: fila 2 = C01, 3 = C02, 4 = C03, 5 = C04 (cantidad 2, instancias "Izq|Der").

  it.each(["codigo", "cantidad", "largo_mm", "ancho_mm", "espesor_mm"])(
    "columna obligatoria faltante (%s): error en el encabezado (fila 1)",
    (column) => {
      const result = readListing(dropColumn(m01, column));
      expect(at(result, 1, column).map((i) => i.severity)).toEqual(["error"]);
    },
  );

  it.each(["largo_mm", "ancho_mm", "espesor_mm", "cantidad"])("número inválido en %s", (column) => {
    const result = readListing(editCell(m01, 3, column, "abc"));
    expect(at(result, 3, column).map((i) => i.severity)).toEqual(["error"]);
    // No arrastra errores en otras filas (una cantidad inválida puede sumar otro error en su propia fila).
    expect(errors(result).every((i) => i.row === 3)).toBe(true);
  });

  it.each(["canto_largo_1", "canto_largo_2", "canto_corto_1", "canto_corto_2"])(
    "valor distinto de SI/NO en %s",
    (column) => {
      const result = readListing(editCell(m01, 4, column, "TAL VEZ"));
      expect(at(result, 4, column).map((i) => i.severity)).toEqual(["error"]);
      expect(errors(result)).toHaveLength(1);
    },
  );

  it("la cantidad de valores en `instancias` distinta de `cantidad` (C04: cantidad 2, una sola instancia)", () => {
    const result = readListing(editCell(m01, 5, "instancias", "Izq"));
    expect(at(result, 5, "instancias").map((i) => i.severity)).toEqual(["error"]);
    expect(errors(result)).toHaveLength(1);
  });

  it("código repetido: el error apunta a la segunda aparición", () => {
    const dup = editCell(m01, 4, "codigo", readCell(m01, 3, "codigo"));
    const result = readListing(dup);
    expect(at(result, 4, "codigo").map((i) => i.severity)).toEqual(["error"]);
    expect(at(result, 3, "codigo")).toEqual([]);
  });

  it.each(["canto_tipo", "canto_ancho_mm", "canto_espesor_mm"])(
    "algún lado con canto = SI y %s vacío: error en esa celda",
    (column) => {
      const result = readListing(editCell(m01, 3, column, ""));
      expect(at(result, 3, column).map((i) => i.severity)).toEqual(["error"]);
    },
  );

  it("sin canto en ningún lado, los campos de canto pueden ir vacíos (C06 los trae vacíos)", () => {
    expect(readCell(m01, 7, "canto_tipo")).toBe("");
    expect(errors(readListing(m01))).toEqual([]);
  });

  it("varios errores se informan todos, cada uno en su fila y columna", () => {
    const text = editCell(editCell(m01, 3, "largo_mm", "abc"), 6, "canto_corto_1", "QUIZAS");
    const result = readListing(text);
    expect(errors(result).map((i) => [i.row, i.column])).toEqual([
      [3, "largo_mm"],
      [6, "canto_corto_1"],
    ]);
  });

  it("columna desconocida: advertencia en el encabezado y no bloquea", () => {
    const result = readListing(addColumn(m01, "comentario_interno", "x"));
    expect(errors(result)).toEqual([]);
    expect(at(result, 1, "comentario_interno").map((i) => i.severity)).toEqual(["warning"]);
    expect(result.rows).toHaveLength(21);
  });

  it("los mensajes están escritos (no vacíos) para que el informe los muestre", () => {
    const result = readListing(editCell(m01, 3, "largo_mm", "abc"));
    expect(result.issues.every((i) => i.message.trim().length > 0)).toBe(true);
  });
});

describe("I3: armado del FurnitureDef", () => {
  const IMPORT_ID = "0123456789abcdef";
  const ID8 = "01234567";
  const DIMS = { x: 1200, y: 750, z: 550 }; // D9: las da el .dae; acá se pasan a mano
  const listing = readListing(m01);
  const def = buildFurnitureDef(listing.rows, { importId: IMPORT_ID, dimsMm: DIMS });

  const moduleOf = (code: string) => {
    const piece = def.pieceTypes.find((p) => p.code === code);
    return def.modules.find((m) => m.id === piece?.moduleId);
  };
  const edges = (code: string) => [...(def.pieceTypes.find((p) => p.code === code)?.edgeBanding ?? [])].sort();

  it("no trae modelUrl (lo agrega quien registra la importación) y usa la tolerancia de 2 mm", () => {
    expect("modelUrl" in def).toBe(false);
    expect(def.toleranceMm).toBe(2);
  });

  it("D10: id, nombre y qrId del mueble llevan `prueba-<id8>` (el `mueble_id` del CSV, `olmo`, chocaría con Olmo)", () => {
    expect(def.furniture.id).toBe(`prueba-${ID8}`);
    expect(def.furniture.id).not.toBe(olmoDef.furniture.id);
    expect(def.furniture.name).toBe(`prueba-${ID8} Escritorio Olmo`);
    expect(def.furniture.qrId).toBe(`prueba-${ID8}-mueble`);
  });

  it("D9: las medidas generales son las que recibe `buildFurnitureDef`, no las del CSV", () => {
    expect(def.furniture.dimsMm).toEqual(DIMS);
  });

  it("dos piezas con el mismo último segmento de código (…-M01-C04 y …-M02-C04) no repiten qrId", () => {
    const rows = listing.rows.slice(0, 2).map((r) => ({ ...r }));
    rows[1] = { ...rows[1], codigo: rows[0].codigo.replace("M01", "M02") };
    const qrIds = buildFurnitureDef(rows, { importId: IMPORT_ID, dimsMm: DIMS }).pieceTypes.map((p) => p.qrId);
    expect(new Set(qrIds).size).toBe(2);
    expect(() =>
      createRegistry([{ ...buildFurnitureDef(rows, { importId: IMPORT_ID, dimsMm: DIMS }), modelUrl: "/x" }]),
    ).not.toThrow();
  });

  it("los módulos salen de modulo_nro y modulo_nombre, con qrId `prueba-<id8>-mod-<n>`", () => {
    expect(def.modules.map((m) => [m.qrId, m.name])).toEqual([
      [`prueba-${ID8}-mod-1`, "Escritorio"],
      [`prueba-${ID8}-mod-2`, "Sector cajones"],
      [`prueba-${ID8}-mod-3`, "Estante abierto"],
    ]);
    expect(def.modules.every((m) => m.furnitureId === def.furniture.id)).toBe(true);
  });

  it("21 tipos de pieza, cada uno en su módulo, con qrId `prueba-<id8>-c<NN>`", () => {
    expect(def.pieceTypes).toHaveLength(21);
    expect(def.pieceTypes.reduce((sum, p) => sum + p.quantity, 0)).toBe(33);
    expect(def.pieceTypes.find((p) => p.code === "0001-01-M01-C04")?.qrId).toBe(`prueba-${ID8}-c04`);
    expect(moduleOf("0001-01-M01-C01")?.name).toBe("Escritorio");
    expect(moduleOf("0001-01-M01-C19")?.name).toBe("Escritorio");
    expect(moduleOf("0001-01-M01-C04")?.name).toBe("Sector cajones");
    expect(moduleOf("0001-01-M01-C21")?.name).toBe("Sector cajones");
    expect(moduleOf("0001-01-M01-C14")?.name).toBe("Estante abierto");
  });

  it("toma de la fila nombre, medidas, material, cantidad y observaciones", () => {
    const c07 = def.pieceTypes.find((p) => p.code === "0001-01-M01-C07");
    expect(c07).toMatchObject({
      name: "Gola horizontal",
      lengthMm: 404,
      widthMm: 36,
      thicknessMm: 18,
      material: "MDF",
      quantity: 2,
      notes: "Medida 404x36 confirmada por Casa Mueble (16/10)",
    });
    expect(def.pieceTypes.find((p) => p.code === "0001-01-M01-C01")?.notes).toBeNull();
  });

  it("los cantos siguen la convención: largo 1 = largo-A, largo 2 = largo-B, corto 1 = corto-A, corto 2 = corto-B", () => {
    expect(edges("0001-01-M01-C01")).toEqual(["corto-A", "corto-B", "largo-A", "largo-B"]); // SI SI SI SI
    expect(edges("0001-01-M01-C02")).toEqual(["corto-A", "largo-A", "largo-B"]); // SI SI SI NO
    expect(edges("0001-01-M01-C04")).toEqual(["corto-A", "largo-A"]); // SI NO SI NO
    expect(edges("0001-01-M01-C05")).toEqual(["corto-A"]); // NO NO SI NO
    expect(edges("0001-01-M01-C19")).toEqual(["corto-A", "corto-B"]); // NO NO SI SI
  });

  it("una pieza sin canto queda en `[]` (dato confirmado), no en `null` (sin dato)", () => {
    for (const code of ["0001-01-M01-C06", "0001-01-M01-C20", "0001-01-M01-C21"]) {
      expect(def.pieceTypes.find((p) => p.code === code)?.edgeBanding).toEqual([]);
    }
  });

  it("el canto del mueble sale de canto_tipo, canto_ancho_mm y canto_espesor_mm", () => {
    expect(def.furniture.edgeBandSpec).toMatchObject({ type: "ABS", widthMm: 22, thicknessMm: 0.22 });
  });

  const withModel = (d: Omit<FurnitureDef, "modelUrl">): FurnitureDef => ({ ...d, modelUrl: "/api/importaciones/x/modelo" });

  it("pasa createRegistry junto a Olmo aunque repita todos sus códigos de pieza", () => {
    const registry = createRegistry([olmoDef, withModel(def)]);
    expect(registry.findDefByQrId(`prueba-${ID8}-c04`)?.furniture.id).toBe(def.furniture.id);
    expect(registry.findDefByQrId(`prueba-${ID8}-mueble`)?.furniture.id).toBe(def.furniture.id);
    expect(registry.findDefByQrId("olmo-c04")).toBe(olmoDef);
  });

  it("dos importaciones del mismo CSV (distinto importId) también conviven en el registro", () => {
    const other = buildFurnitureDef(listing.rows, { importId: "fedcba9876543210", dimsMm: DIMS });
    expect(() => createRegistry([olmoDef, withModel(def), withModel(other)])).not.toThrow();
    expect(other.furniture.qrId).toBe("prueba-fedcba98-mueble");
  });

  it("todos los qrId de lo importado llevan el prefijo `prueba-<id8>-`", () => {
    const qrIds = [def.furniture.qrId, ...def.modules.map((m) => m.qrId), ...def.pieceTypes.map((p) => p.qrId)];
    expect(qrIds.every((q) => q.startsWith(`prueba-${ID8}-`))).toBe(true);
    expect(new Set(qrIds).size).toBe(qrIds.length);
  });
});
