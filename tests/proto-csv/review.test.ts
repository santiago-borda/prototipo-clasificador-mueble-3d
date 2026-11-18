// C8 y C9 del spike (docs/spec-proto-csv-ocl.md §3 y §5): cruce del CSV del gabinete con su .dae real, con el motor
// (pasada 1) y el cruce del PDF sin cambios. El .dae se lee con `observeDae` (Node); C14 prueba que la vía del
// navegador da la misma observación. Las variantes del CSV son SINTÉTICAS (se dice qué se cambió).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRecords } from "@/importer/listing";
import { observeDae } from "@/model/observe";
import { parseOclCsv } from "@/proto-csv/parse";
import { DERIVED_REASONS, SOFT_REASONS, levelOf, reviewListing } from "@/proto-csv/review";

const DIR = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const LISTADO = readFileSync(path.join(DIR, "gabinete-prueba-canto.csv"), "utf8");
const DAE = observeDae(new Uint8Array(readFileSync(path.join(DIR, "gabinete-prueba-opencutlist.dae"))));
const TOL = 2;

const C01 = "0001-01-M01-C01";
const C02 = "0001-01-M01-C02";
const C03 = "0001-01-M01-C03";
const C04 = "0001-01-M01-C04";

const quote = (cell: string) => (/[";]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
function edit(mutate: (rows: string[][], col: (name: string) => number, rowOf: (d: string) => number) => void): string {
  const rows = parseRecords(LISTADO.replace(/^﻿/, ""), ";").filter((r) => r.some((c) => c !== ""));
  const col = (name: string) => rows[0].indexOf(name);
  const rowOf = (d: string) => rows.findIndex((r) => r[col("Designación")] === d);
  mutate(rows, col, rowOf);
  return rows.map((r) => r.map(quote).join(";")).join("\r\n") + "\r\n";
}

function review(text: string) {
  const parsed = parseOclCsv(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return reviewListing(parsed.listing, DAE, TOL);
}

describe("C8: CSV del gabinete × gabinete-prueba-opencutlist.dae (fixtures reales)", () => {
  const r = review(LISTADO);

  it("5 instancias segura en la pasada 1 y 4 tipos segura; se puede aprobar", () => {
    expect(DAE.observations).toHaveLength(5);
    expect(r.pass1.results.map((x) => x.level)).toEqual(["segura", "segura", "segura", "segura", "segura"]);
    expect(r.types.map((t) => [t.code, t.level, t.instances.length])).toEqual([
      [C01, "segura", 2],
      [C02, "segura", 1],
      [C03, "segura", 1],
      [C04, "segura", 1],
    ]);
    expect(r.types.every((t) => t.reasons.length === 0)).toBe(true);
    expect([r.dudosas, r.orphanInstances.length, r.looseMeshes, r.unkeyedRows]).toEqual([0, 0, 0, 0]);
    expect(r.canApprove).toBe(true);
  });

  it("canto disponible (Canto_Blanco): cumple en C01 a C03 (por cruce de caras) y en C04 sin canto (regla de modelo)", () => {
    expect(r.modelHasEdgeFaces).toBe(true);
    expect(r.cross.edges).toEqual({ [C01]: "cumple", [C02]: "cumple", [C03]: "cumple", [C04]: "no-disponible" });
    expect(Object.fromEntries(r.types.map((t) => [t.code, t.edgeCheck]))).toEqual({ [C01]: "cumple", [C02]: "cumple", [C03]: "cumple", [C04]: "cumple" });
  });

  it("caras de canto del .dae = lados marcados en el CSV (C03: 2 de 800 y 2 de 400)", () => {
    const c03 = DAE.observations.find((o) => o.rawName?.includes("C03"));
    expect(c03?.edgeRunsMm).toEqual([expect.closeTo(400, 1), expect.closeTo(400, 1), expect.closeTo(800, 1), expect.closeTo(800, 1)]);
  });

  it("sin hallazgos del cruce", () => {
    expect(r.cross.findings).toEqual([]);
  });
});

describe("C9: desajustes (variantes sintéticas del CSV)", () => {
  it("C04 × 2 en el CSV (el .dae tiene 1): C04 advertencia (faltante + cantidad) y se puede aprobar", () => {
    const r = review(
      edit((rows, col, rowOf) => {
        rows[rowOf(C04)][col("Cantidad")] = "2";
      }),
    );
    const c04 = r.types.find((t) => t.code === C04);
    expect(c04?.level).toBe("advertencia");
    expect(c04?.reasons).toEqual(expect.arrayContaining([{ source: "motor", reason: "faltante" }, { source: "cruce", reason: "cantidad-no-coincide" }]));
    expect(r.types.filter((t) => t.code !== C04).every((t) => t.level === "segura")).toBe(true);
    expect([r.dudosas, r.advertencias, r.canApprove]).toEqual([0, 1, true]);
  });

  it("medida fuera de tolerancia (C02 Longitud 770 en el CSV): advertencia, con sus razones del motor y del cruce", () => {
    const r = review(
      edit((rows, col, rowOf) => {
        rows[rowOf(C02)][col("Longitud")] = "770,0 mm";
        rows[rowOf(`${C02} - Longitud del borde 2`)][col("Longitud")] = "770,0 mm";
      }),
    );
    const c02 = r.types.find((t) => t.code === C02);
    expect(c02?.level).toBe("advertencia");
    expect(c02?.reasons).toEqual(
      expect.arrayContaining([
        { source: "motor", reason: "medida-fuera-de-tolerancia" },
        { source: "cruce", reason: "medida-no-coincide" },
        { source: "cruce", reason: "canteado-no-coincide" },
        { source: "motor", reason: "instancia-no-segura" },
      ]),
    );
    expect([r.dudosas, r.advertencias, r.canApprove]).toEqual([0, 1, true]);
  });

  it("canto marcado en el CSV que el .dae no tiene (C04 con borde inferior): advertencia canteado-no-coincide por la regla de modelo", () => {
    const r = review(
      edit((rows, col, rowOf) => {
        rows[rowOf(C04)][col("Longitud del borde 1")] = "Canto_Blanco (0,2 mm x 22,0 mm)";
        const extra = [...rows[rowOf(`${C03} - Longitud del borde 1`)]];
        extra[col("Designación")] = `${C04} - Longitud del borde 1`;
        extra[col("Longitud")] = "764,0 mm";
        rows.push(extra);
      }),
    );
    const c04 = r.types.find((t) => t.code === C04);
    expect(c04?.edgeCheck).toBe("no-coincide");
    expect(c04?.reasons).toEqual([{ source: "cruce", reason: "canteado-no-coincide" }]);
    expect(c04?.level).toBe("advertencia");
    expect([r.dudosas, r.advertencias, r.canApprove]).toEqual([0, 1, true]);
  });

  it("límite: C01 con el canto izquierdo pasado a derecho en el CSV sigue segura (mismo lado A)", () => {
    // Límite conocido: el cruce cuenta lados L y A (como A8), no cuál de los dos. Se deja escrito, no se arregla acá.
    const r = review(
      edit((rows, col, rowOf) => {
        const c01 = rows[rowOf(C01)];
        [c01[col("Ancho del borde 1")], c01[col("Ancho de borde 2")]] = [c01[col("Ancho de borde 2")], c01[col("Ancho del borde 1")]];
        rows[rowOf(`${C01} - Ancho del borde 1`)][col("Designación")] = `${C01} - Ancho de borde 2`;
      }),
    );
    expect(r.types.find((t) => t.code === C01)?.level).toBe("segura");
    expect(r.advertencias).toBe(0);
  });

  it("CSV sin C02 (pieza y sus filas de canto quitadas): la instancia de C02 queda huérfana y bloquea", () => {
    const r = review(
      edit((rows, col) => {
        for (let i = rows.length - 1; i > 0; i--) if (rows[i][col("Designación")].startsWith(C02)) rows.splice(i, 1);
      }),
    );
    expect(r.orphanInstances.map((o) => o.reasons)).toEqual([["codigo-inexistente"]]);
    expect(r.advertencias).toBe(0);
    expect(r.types.map((t) => t.code)).toEqual([C01, C03, C04]);
    expect(r.canApprove).toBe(false);
  });

  it("código excluido por el CSV (C03 anómalo): tipo dudosa con la razón del CSV; su instancia, codigo-excluido", () => {
    const r = review(
      edit((rows, col, rowOf) => {
        rows[rowOf(C03)][col("Designación")] = `_${C03}__`;
      }),
    );
    const c03 = r.types.find((t) => t.code === C03);
    expect(c03).toMatchObject({ level: "dudosa", piece: null, edgeCheck: "excluido", reasons: [{ source: "csv", reason: "nombre-anomalo" }] });
    expect(r.pass1.results.find((x) => x.instanceKey === c03?.instances[0].instanceKey)?.reasons).toEqual(["codigo-excluido"]);
    expect(r.canApprove).toBe(false);
  });
});

describe("C9b: mezcla de razones (levelOf, lista cerrada en review.ts)", () => {
  const cruce = (reason: string) => ({ source: "cruce" as const, reason });

  it("SOFT_REASONS y DERIVED_REASONS son las listas cerradas de la spec §3", () => {
    expect([...SOFT_REASONS].sort()).toEqual(["cantidad-no-coincide", "canteado-no-coincide", "cupo-excedido", "faltante", "medida-fuera-de-tolerancia", "medida-no-coincide"].sort());
    expect([...DERIVED_REASONS].sort()).toEqual(["instancia-no-segura", "sin-confirmar"]);
  });

  it("sin razones: segura", () => expect(levelOf([])).toBe("segura"));
  it("una razón blanda: advertencia", () => expect(levelOf([cruce("medida-no-coincide")])).toBe("advertencia"));
  it("blandas más derivadas: advertencia", () => expect(levelOf([cruce("faltante"), cruce("cupo-excedido"), cruce("instancia-no-segura"), cruce("sin-confirmar")])).toBe("advertencia"));
  it("una blanda con una dura: dudosa", () => expect(levelOf([cruce("faltante"), cruce("geometria-no-alineada")])).toBe("dudosa"));
  it("solo derivadas: dudosa (la causa real no está)", () => expect(levelOf([cruce("instancia-no-segura"), cruce("sin-confirmar")])).toBe("dudosa"));
  it("una razón fuera de SOFT_REASONS: dudosa", () => expect(levelOf([cruce("medida-no-coincide"), cruce("razon-inventada")])).toBe("dudosa"));
  it.each(["geometria-no-alineada", "empate", "conflicto", "cupo-completo-sugerido", "nombre-anomalo", "codigo-excluido", "codigo-inexistente"])("%s sola: dudosa", (reason) => {
    expect(levelOf([cruce(reason)])).toBe("dudosa");
  });
});
