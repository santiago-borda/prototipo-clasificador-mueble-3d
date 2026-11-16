// C1 a C7 del spike de carga por CSV (docs/spec-proto-csv-ocl.md §5). Fixture real del gabinete
// (tests/fixtures/csv-ocl/gabinete/, README.md = verdad de referencia). Los casos de C3 a C6 son variantes
// SINTÉTICAS armadas acá a partir del CSV real (se dice en cada una qué se cambió).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listadoId } from "@/engine/hash";
import type { ListadoRow } from "@/engine/types";
import { parseRecords } from "@/importer/listing";
import { parseOclCsv, type CsvParse } from "@/proto-csv/parse";

const DIR = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const read = (name: string) => readFileSync(path.join(DIR, name), "utf8");
const LISTADO = read("gabinete-prueba-canto.csv");
const INSTANCIAS = read("gabinete-prueba-listainstancias.csv");

const C01 = "0001-01-M01-C01";
const C02 = "0001-01-M01-C02";
const C03 = "0001-01-M01-C03";
const C04 = "0001-01-M01-C04";
const CANTO = { label: "Canto_Blanco (0,2 mm x 22,0 mm)", material: "Canto_Blanco", widthMm: 22, thicknessText: "0,2 mm" };

/** El CSV como tabla (encabezado + filas), para armar variantes sintéticas. */
const table = (text: string) => parseRecords(text.replace(/^﻿/, ""), ";").filter((r) => r.some((c) => c !== ""));
/** Celdas con `"` o `;` entre comillas, con `""` adentro (como las escribe OpenCutList). */
const quote = (cell: string) => (/[";]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
const toCsv = (rows: string[][]) => rows.map((r) => r.map(quote).join(";")).join("\r\n") + "\r\n";
const col = (rows: string[][], name: string) => rows[0].indexOf(name);
/** Fila de datos (índice en la tabla) cuya Designación es exactamente `designation`. */
const rowOf = (rows: string[][], designation: string) => rows.findIndex((r) => r[col(rows, "Designación")] === designation);
const edit = (mutate: (rows: string[][]) => void) => {
  const rows = table(LISTADO);
  mutate(rows);
  return toCsv(rows);
};

function ok(result: CsvParse) {
  if (!result.ok) throw new Error(`rechazado: ${result.reason} ${result.message}`);
  return result;
}
const excludedCodes = (result: CsvParse) => {
  const { listing } = ok(result);
  return listing.status === "borrador" ? listing.excluded.map((e) => [e.code, e.reasons]) : [];
};

describe("C1: Listado de piezas del gabinete (fixture real)", () => {
  const result = ok(parseOclCsv(LISTADO));
  const byCode = new Map(result.listing.pieces.map((p) => [p.code, p]));

  it("publicable: 4 tipos y 5 piezas físicas (C01 × 2), en orden de código", () => {
    expect(result.listing.status).toBe("publicable");
    expect(result.listing.pieces.map((p) => p.code)).toEqual([C01, C02, C03, C04]);
    expect(result.listing.pieces.reduce((n, p) => n + p.quantity, 0)).toBe(5);
    expect(byCode.get(C01)?.quantity).toBe(2);
  });

  it("medidas FINALES (L, A, espesor) y material = README; crudas aparte", () => {
    const dims = result.listing.pieces.map((p) => [p.code, p.lengthMm, p.widthMm, p.thicknessMm, p.material]);
    expect(dims).toEqual([
      [C01, 700, 400, 18, "Blanco 18"],
      [C02, 764, 400, 18, "Blanco 18"],
      [C03, 800, 400, 18, "Blanco 18"],
      [C04, 764, 664, 3, "Blanco 3 mm"],
    ]);
    expect(result.listing.pieces.map((p) => p.rawLA)).toEqual([
      [699.8, 399.8],
      [763.8, 399.8],
      [799.6, 399.6],
      [764, 664],
    ]);
  });

  it("cantos = tabla del README (inferior = largo-B, superior = largo-A, izquierdo = corto-A, derecho = corto-B)", () => {
    expect(byCode.get(C01)?.edgeBanding).toEqual(["corto-A", "largo-A"]); // superior + izquierdo
    expect(byCode.get(C02)?.edgeBanding).toEqual(["corto-B", "largo-A"]); // superior + derecho
    expect(byCode.get(C03)?.edgeBanding).toEqual(["corto-A", "corto-B", "largo-A", "largo-B"]);
    expect(byCode.get(C04)?.edgeBanding).toEqual([]);
  });

  it("celda de canto: ancho 22 como número, espesor solo como texto (el CSV lo redondea)", () => {
    expect(byCode.get(C03)?.strips).toEqual({ s1: CANTO, s2: CANTO, s3: CANTO, s4: CANTO });
    expect(byCode.get(C01)?.strips).toEqual({ s1: null, s2: CANTO, s3: CANTO, s4: null });
  });

  it("8 filas de canto (A a H), 10 tramos contando cantidades, 5764 mm; no son piezas", () => {
    expect(result.edgeRows).toHaveLength(8);
    expect(result.edgeRows.reduce((n, e) => n + e.quantity, 0)).toBe(10);
    expect(result.edgeTotalMm).toBe(5764);
    expect(result.edgeRows.map((e) => e.strip)).toEqual(["s1", "s2", "s2", "s2", "s3", "s4", "s4", "s3"]);
  });

  it("letra local por material (A en Blanco 18 y en Blanco 3 mm); nombre vacío con aviso (P1)", () => {
    expect(result.listing.pieces.map((p) => p.letter)).toEqual(["C", "B", "A", "A"]);
    expect(result.listing.pieces.every((p) => p.name === "")).toBe(true);
    expect(result.issues.map((i) => i.reason)).toEqual(["nombre-ausente", "nombre-ausente", "nombre-ausente", "nombre-ausente"]);
  });
});

describe("C2: Lista de instancias (fixture real)", () => {
  it("se rechaza con un mensaje que dice qué exportar", () => {
    const result = parseOclCsv(INSTANCIAS);
    expect(result).toMatchObject({ ok: false, reason: "lista-de-instancias" });
    expect(!result.ok && result.message).toMatch(/Listado de piezas/);
  });
});

describe("C3: encabezado (variantes sintéticas del CSV real)", () => {
  it("columnas permutadas: mismo resultado que C1", () => {
    const rows = table(LISTADO);
    const order = rows[0].map((_, i) => i).reverse();
    expect(parseOclCsv(toCsv(rows.map((r) => order.map((i) => r[i] ?? ""))))).toEqual(parseOclCsv(LISTADO));
  });

  it("tildes, mayúsculas, espacios y «de»/«del» intercambiados: mismo resultado que C1", () => {
    const text = edit((rows) => {
      const h = rows[0];
      h[col(rows, "Designación")] = "DESIGNACION";
      h[col(rows, "Nombre del material")] = "  nombre   del material ";
      h[col(rows, "Ancho del borde 1")] = "Ancho de borde 1";
      h[col(rows, "Ancho de borde 2")] = "Ancho del borde 2";
    });
    expect(parseOclCsv(text)).toEqual(parseOclCsv(LISTADO));
  });

  it("las dos «Etiquetas» del CSV real no molestan (no se usan)", () => {
    expect(table(LISTADO)[0].filter((h) => h === "Etiquetas")).toHaveLength(2);
    expect(parseOclCsv(LISTADO).ok).toBe(true);
  });

  it("sin una columna de borde: columna-faltante con la indicación de Opciones", () => {
    const text = edit((rows) => {
      const i = col(rows, "Ancho de borde 2");
      for (const r of rows) r.splice(i, 1);
    });
    const result = parseOclCsv(text);
    expect(result).toMatchObject({ ok: false, reason: "columna-faltante", column: "Ancho de borde 2" });
    expect(!result.ok && result.message).toMatch(/desmarcá «ocultar la columna de cantos» en|Opciones, desmarcá «ocultar la columna de cantos»/);
  });

  it("sin Grosor: columna-faltante", () => {
    const text = edit((rows) => {
      const i = col(rows, "Grosor");
      for (const r of rows) r.splice(i, 1);
    });
    expect(parseOclCsv(text)).toMatchObject({ ok: false, reason: "columna-faltante", column: "Grosor" });
  });

  it("un campo usado dos veces: columna-ambigua", () => {
    const text = edit((rows) => {
      const i = col(rows, "Cantidad");
      for (const r of rows) r.push(r[i]);
    });
    expect(parseOclCsv(text)).toMatchObject({ ok: false, reason: "columna-ambigua", column: "Cantidad" });
  });

  it("archivo vacío: csv-vacio", () => {
    expect(parseOclCsv("")).toMatchObject({ ok: false, reason: "csv-vacio" });
    expect(parseOclCsv("﻿\r\n")).toMatchObject({ ok: false, reason: "csv-vacio" });
  });
});

describe("C4: valores (variantes sintéticas)", () => {
  it.each([["80,0 cm"], ['31 1/2"'], ["0,8 m"], ["31,5 in"]])("%s en Longitud: rechazo unidad-no-soportada", (value) => {
    const text = edit((rows) => {
      rows[rowOf(rows, C03)][col(rows, "Longitud")] = value;
    });
    const result = parseOclCsv(text);
    expect(result).toMatchObject({ ok: false, reason: "unidad-no-soportada", column: "Longitud" });
    expect(!result.ok && result.message).toMatch(/milímetros/);
  });

  it("Cantidad «2,0» y medida vacía: valor-invalido, el código a excluded y borrador", () => {
    const text = edit((rows) => {
      rows[rowOf(rows, C01)][col(rows, "Cantidad")] = "2,0";
      rows[rowOf(rows, C04)][col(rows, "Anchura")] = "";
    });
    const result = ok(parseOclCsv(text));
    expect(result.listing.status).toBe("borrador");
    expect(excludedCodes(result)).toEqual([
      [C01, ["valor-invalido"]],
      [C04, ["valor-invalido"]],
    ]);
    expect(result.listing.pieces.map((p) => p.code)).toEqual([C02, C03]);
  });

  it("Cantidad 0: valor-invalido", () => {
    const text = edit((rows) => {
      rows[rowOf(rows, C02)][col(rows, "Cantidad")] = "0";
    });
    expect(excludedCodes(parseOclCsv(text))).toEqual([[C02, ["valor-invalido"]]]);
  });
});

describe("C5: razones de fila (variantes sintéticas)", () => {
  it("código anómalo (`_…__`): se normaliza y queda en excluded con nombre-anomalo", () => {
    const text = edit((rows) => {
      rows[rowOf(rows, C04)][col(rows, "Designación")] = `_${C04}__`;
    });
    expect(excludedCodes(parseOclCsv(text))).toEqual([[C04, ["nombre-anomalo"]]]);
  });

  it("código mal formado y Designación vacía: fila sin clave (formato-invalido, codigo-ausente)", () => {
    const text = edit((rows) => {
      rows[rowOf(rows, C04)][col(rows, "Designación")] = "Fondo";
      rows[rowOf(rows, C02)][col(rows, "Designación")] = "";
    });
    const { listing } = ok(parseOclCsv(text));
    expect(listing.status).toBe("borrador");
    if (listing.status !== "borrador") return;
    expect(listing.unkeyedRows.map((u) => u.reasons)).toEqual([["codigo-ausente"], ["formato-invalido"]]);
    // C02 perdió su fila de pieza: sus filas de canto quedan sin pieza.
    expect(listing.excluded).toEqual([expect.objectContaining({ code: C02, reasons: ["fila-canto-no-coincide"] })]);
  });

  it("código repetido: codigo-repetido, las dos filas", () => {
    const text = edit((rows) => {
      rows.push([...rows[rowOf(rows, C04)]]);
    });
    const result = ok(parseOclCsv(text));
    expect(excludedCodes(result)).toEqual([[C04, ["codigo-repetido"]]]);
    expect(result.listing.status === "borrador" && result.listing.excluded[0].csvRows).toEqual([5, 14]);
  });

  it("Tipo de material «Madera maciza»: tipo-material-no-soportado", () => {
    const text = edit((rows) => {
      rows[rowOf(rows, C04)][col(rows, "Tipo de material")] = "Madera maciza";
    });
    expect(excludedCodes(parseOclCsv(text))).toEqual([[C04, ["tipo-material-no-soportado"]]]);
  });

  it("fila de canto para un lado sin marca: fila-canto-no-coincide", () => {
    const text = edit((rows) => {
      const extra = [...rows[rowOf(rows, `${C03} - Longitud del borde 1`)]];
      extra[col(rows, "Designación")] = `${C04} - Longitud del borde 1`;
      extra[col(rows, "Longitud")] = "764,0 mm";
      rows.push(extra);
    });
    expect(excludedCodes(parseOclCsv(text))).toEqual([[C04, ["fila-canto-no-coincide"]]]);
  });

  it("lado marcado sin su fila de canto, o con otra cantidad: fila-canto-no-coincide", () => {
    const sinFila = edit((rows) => {
      rows.splice(rowOf(rows, `${C03} - Ancho de borde 2`), 1);
    });
    expect(excludedCodes(parseOclCsv(sinFila))).toEqual([[C03, ["fila-canto-no-coincide"]]]);
    const otraCantidad = edit((rows) => {
      rows[rowOf(rows, `${C01} - Ancho del borde 1`)][col(rows, "Cantidad")] = "1";
    });
    expect(excludedCodes(parseOclCsv(otraCantidad))).toEqual([[C01, ["fila-canto-no-coincide"]]]);
  });

  it("celda de canto ilegible: canto-ilegible", () => {
    const text = edit((rows) => {
      rows[rowOf(rows, C04)][col(rows, "Longitud del borde 1")] = "Canto raro";
    });
    expect(excludedCodes(parseOclCsv(text))).toEqual([[C04, ["canto-ilegible"]]]);
  });
});

describe("C5b: el cruce de filas de canto se saltea si la pieza ya tiene otra razón (sintético)", () => {
  it("C03 (4 lados con canto) con Longitud ilegible: solo valor-invalido, sin fila-canto-no-coincide en cascada", () => {
    const text = edit((rows) => {
      rows[rowOf(rows, C03)][col(rows, "Longitud")] = "abc";
    });
    expect(excludedCodes(parseOclCsv(text))).toEqual([[C03, ["valor-invalido"]]]);
  });

  it("C01 (cantidad 2, con canto) con Cantidad 3: las filas de canto (cantidad 2) no coinciden → fila-canto-no-coincide", () => {
    // Contraste: con la pieza sana, la comparación sí corre.
    const text = edit((rows) => {
      rows[rowOf(rows, C01)][col(rows, "Cantidad")] = "3";
    });
    expect(excludedCodes(parseOclCsv(text))).toEqual([[C01, ["fila-canto-no-coincide"]]]);
  });
});

describe("C6: determinismo y L/A sin reordenar", () => {
  it("el mismo texto dos veces da el mismo JSON", () => {
    expect(JSON.stringify(parseOclCsv(LISTADO))).toBe(JSON.stringify(parseOclCsv(LISTADO)));
  });

  it("con LF o CRLF da lo mismo", () => {
    expect(parseOclCsv(LISTADO.replace(/\r\n/g, "\n"))).toEqual(parseOclCsv(LISTADO.replace(/\r?\n/g, "\r\n")));
  });

  it("filas permutadas: mismas piezas y mismo listadoId", () => {
    const rows = table(LISTADO);
    const permuted = toCsv([rows[0], ...rows.slice(1).reverse()]);
    const a = ok(parseOclCsv(LISTADO)).listing.pieces;
    const b = ok(parseOclCsv(permuted)).listing.pieces;
    expect(b.map((p) => p.code)).toEqual(a.map((p) => p.code));
    expect(listadoId(b)).toBe(listadoId(a));
  });

  it("L < A (sintético: C04 con Longitud 664 y Anchura 764): se guardan tal cual", () => {
    const text = edit((rows) => {
      const r = rows[rowOf(rows, C04)];
      r[col(rows, "Longitud")] = "664,0 mm";
      r[col(rows, "Anchura")] = "764,0 mm";
    });
    const c04 = ok(parseOclCsv(text)).listing.pieces.find((p) => p.code === C04);
    expect([c04?.lengthMm, c04?.widthMm]).toEqual([664, 764]);
  });
});

describe("C7: listadoId sobre las piezas del CSV = filas escritas a mano", () => {
  it("misma definición que el motor (ListadoRow); P1: el nombre va vacío", () => {
    const hand: ListadoRow[] = [
      { code: C01, name: "", lengthMm: 700, widthMm: 400, thicknessMm: 18, material: "Blanco 18", quantity: 2, edgeBanding: ["corto-A", "largo-A"], notes: null },
      { code: C02, name: "", lengthMm: 764, widthMm: 400, thicknessMm: 18, material: "Blanco 18", quantity: 1, edgeBanding: ["corto-B", "largo-A"], notes: null },
      { code: C03, name: "", lengthMm: 800, widthMm: 400, thicknessMm: 18, material: "Blanco 18", quantity: 1, edgeBanding: ["corto-A", "corto-B", "largo-A", "largo-B"], notes: null },
      { code: C04, name: "", lengthMm: 764, widthMm: 664, thicknessMm: 3, material: "Blanco 3 mm", quantity: 1, edgeBanding: [], notes: null },
    ];
    const pieces: readonly ListadoRow[] = ok(parseOclCsv(LISTADO)).listing.pieces;
    expect(listadoId(pieces)).toBe(listadoId(hand));
  });
});
