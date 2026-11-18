// R-11: fila de la tabla del Resumen (TP-108 a TP-116, CA-8).
// Spec: docs/spec-revision-ocr-real.md v0.8 (aprobada el 11/11/2026), §4.4. Entradas en memoria con la ESTRUCTURA observada
// en las corridas reales (tests/helpers/ocrRealLike.ts), con datos ficticios (TS-12b). Sin red y sin nada de .ocr-data/.

import { describe, expect, it } from "vitest";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import { SUMMARY_X, defaultSummaryTable, ocrRealLike, ocrRealLikeExpected, withSummaryTable, type OcrRealLikeOptions, type SummaryTableSpec, type TableCell } from "./helpers/ocrRealLike";
import { ok, rejection } from "./helpers/ocrAssert";

const EXPECTED = ocrRealLikeExpected();


// R-11: fila de la tabla del Resumen (TP-108 a TP-116, CA-8)

const readTable = (spec: SummaryTableSpec, options: OcrRealLikeOptions = {}) => parseOcrWords(withSummaryTable(ocrRealLike(options), spec));

/** Reemplaza (o saca, con null) la celda de la fila que está en el centro `x`. */
const setCell = (spec: SummaryTableSpec, x: number, text: string | null): SummaryTableSpec => ({
  ...spec,
  rows: spec.rows.map((row) => ({
    ...row,
    cells: row.cells.flatMap(([t, cx]): TableCell[] => (cx !== x ? [[t, cx]] : text === null ? [] : [[text, cx]])),
  })),
});
const addCell = (spec: SummaryTableSpec, text: string, x: number): SummaryTableSpec => ({
  ...spec,
  rows: spec.rows.map((row) => ({ ...row, cells: [...row.cells, [text, x] as TableCell] })),
});
const withHeader = (spec: SummaryTableSpec, label: string, x: number): SummaryTableSpec => ({ ...spec, headers: [...spec.headers, [label, x]] });

const TAIL = "- Tipo Ficticio";
const WANT_ROW = EXPECTED.summary.boards[0];

describe("TP-108 material de la fila sin la cola (R-11 a)", () => {
  it("la cola '- <tipo>' no entra al material: fila leída, sin el tipo en ningún campo y sin pending nuevo", () => {
    const document = ok(readTable(defaultSummaryTable(EXPECTED, { tail: TAIL })));
    expect(document.summary.boards).toEqual([WANT_ROW]);
    expect(document.header.material).toBe(EXPECTED.header.material);
    expect(JSON.stringify(document)).not.toContain("Ficticio");
    expect(document.pending).toEqual([]);
  });
  it("sin cola, igual que antes", () => {
    expect(ok(readTable(defaultSummaryTable(EXPECTED))).summary.boards).toEqual([WANT_ROW]);
  });
});

describe("TP-109 columna ignorada (R-11 b): Σ Costos", () => {
  it("la celda '-' bajo Σ Costos se descarta: parts y areaM2 conservan su valor, sin pending ni rechazo", () => {
    const document = ok(readTable(defaultSummaryTable(EXPECTED, { tail: TAIL, costs: true })));
    expect(document.summary.boards).toEqual([WANT_ROW]);
    expect(document.pending).toEqual([]);
  });
});

describe("TP-110 formato por columna (R-11 d)", () => {
  const base = () => defaultSummaryTable(EXPECTED, { tail: TAIL });
  it("(a) '-' bajo Σ Areas: areaM2 null + pending; el resto no cambia", () => {
    const document = ok(readTable(setCell(base(), SUMMARY_X.area, "-")));
    expect(document.summary.boards).toEqual([{ ...WANT_ROW, areaM2: null }]);
    expect(document.pending.map((p) => p.path)).toEqual(["summary.boards[0].areaM2"]);
  });
  it("(b) '-' bajo Cant.: rechazo resumen-tabla-sin-valor", () => {
    expect(rejection(readTable(setCell(base(), SUMMARY_X.count, "-")))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-tabla-sin-valor", page: 1 });
  });
  it("(c) Cant. = 2,5 (no es un entero): rechazo resumen-tabla-sin-valor", () => {
    expect(rejection(readTable(setCell(base(), SUMMARY_X.count, "2,5")))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-tabla-sin-valor", page: 1 });
  });
  it("Σ Partes que no es un entero: rechazo; Longitud con otra unidad: rechazo", () => {
    expect(rejection(readTable(setCell(base(), SUMMARY_X.parts, "20,5"))).rule).toBe("resumen-tabla-sin-valor");
    expect(rejection(readTable(setCell(base(), SUMMARY_X.length, "2610 m²"))).rule).toBe("resumen-tabla-sin-valor");
  });
});

describe("TP-111 sin reemplazo silencioso (R-11 c)", () => {
  it("(a) dos celdas en Longitud: rechazo resumen-celda-duplicada; ningún valor elegido", () => {
    const twice = addCell(addCell(setCell(defaultSummaryTable(EXPECTED, { tail: TAIL }), SUMMARY_X.length, null), "2610 mm", 335), "2611 mm", 405);
    expect(rejection(readTable(twice))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-celda-duplicada", page: 1 });
  });
  it("(b) dos celdas en Σ Areas: areaM2 null + pending; ni un valor ni el otro", () => {
    const twice = addCell(addCell(setCell(defaultSummaryTable(EXPECTED, { tail: TAIL }), SUMMARY_X.area, null), "4,8 m²", 575), "4,9 m²", 645);
    const document = ok(readTable(twice));
    expect(document.summary.boards).toEqual([{ ...WANT_ROW, areaM2: null }]);
    expect(document.pending.map((p) => p.path)).toEqual(["summary.boards[0].areaM2"]);
  });
});

describe("TP-112 el material dos veces en el renglón (R-11 e, R-3)", () => {
  const twice = (first: string): SummaryTableSpec => {
    const spec = defaultSummaryTable(EXPECTED);
    return { ...spec, rows: spec.rows.map((row) => ({ ...row, first })) };
  };
  it("(a) dos materiales distintos: rechazo resumen-fila-ambigua", () => {
    expect(rejection(readTable(twice("Gris Sintético / 18 mm - Azul Sintético / 15 mm")))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-fila-ambigua", page: 1 });
  });
  it("(b) dos veces el mismo: también rechazo", () => {
    expect(rejection(readTable(twice("Gris Sintético / 18 mm - Gris Sintético / 18 mm"))).rule).toBe("resumen-fila-ambigua");
  });
});

describe("TP-113 zona de filas (R-11, R-2)", () => {
  it("se leen las filas hasta la primera línea sin material; la que viene después no es fila", () => {
    const spec = defaultSummaryTable(EXPECTED);
    const [row] = spec.rows;
    const other = { ...row, first: "Azul Sintético / 15 mm" };
    const noMaterial = { first: "Texto sin ningún material", cells: [] };
    const after = { ...row, first: "Verde Sintético / 12 mm" };
    const document = ok(readTable({ ...spec, rows: [row, other, noMaterial, after] }));
    expect(document.summary.boards.map((b) => [b.material, b.thicknessMm])).toEqual([
      [EXPECTED.header.material, 18],
      ["Azul Sintético", 15],
    ]);
  });
  it("un Resumen sin ninguna fila: resumen-tabla-vacia (sin cambio)", () => {
    expect(rejection(readTable({ ...defaultSummaryTable(EXPECTED), rows: [] }))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-tabla-vacia", page: 1 });
  });
});

describe("TP-114 rótulo desconocido (R-11 b)", () => {
  it("una celda bajo un rótulo que no es ancla ni Σ Costos no se asigna a Σ Areas ni a Σ Partes", () => {
    const spec = addCell(withHeader(defaultSummaryTable(EXPECTED), "Σ Extra", SUMMARY_X.costs), "77", SUMMARY_X.costs);
    const document = ok(readTable(spec));
    expect(document.summary.boards).toEqual([WANT_ROW]);
    expect(document.pending).toEqual([]);
  });
});

describe("TP-115 equidistancia (R-11 b)", () => {
  it("una celda a igual distancia de Cant. y Longitud no se asigna a ninguna: sin Cant., rechazo", () => {
    const middle = (SUMMARY_X.count + SUMMARY_X.length) / 2;
    const spec = addCell(setCell(defaultSummaryTable(EXPECTED), SUMMARY_X.count, null), "2", middle);
    expect(rejection(readTable(spec))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-tabla-sin-valor", page: 1 });
  });
  it("una celda a igual distancia de Σ Areas y Σ Costos no se asigna: areaM2 null + pending", () => {
    const middle = (SUMMARY_X.area + SUMMARY_X.costs) / 2;
    // Sin la celda '-' de Σ Costos: es la que, sin R-11, pisaba el valor por otro camino.
    const spec = addCell(setCell(setCell(defaultSummaryTable(EXPECTED, { costs: true }), SUMMARY_X.area, null), SUMMARY_X.costs, null), "4,8 m²", middle);
    const document = ok(readTable(spec));
    expect(document.summary.boards).toEqual([{ ...WANT_ROW, areaM2: null }]);
    expect(document.pending.map((p) => p.path)).toEqual(["summary.boards[0].areaM2"]);
  });
});

describe("TP-116 el respaldo de R-7 con la fila con cola (R-11 f)", () => {
  const table = () => defaultSummaryTable(EXPECTED, { tail: TAIL });
  it("(b) título sin separador cuyo final coincide con la fila: el material de la fila, sin la cola", () => {
    const document = ok(readTable(table(), { titleSeparator: false }));
    expect(document.header.material).toBe(EXPECTED.header.material);
    expect(document.summary.boards[0].material).toBe(EXPECTED.header.material);
  });
  it("(c) título sin separador y sin coincidencia: rechazo resumen-titulo-sin-limite", () => {
    expect(rejection(readTable(table(), { titleSeparator: false, titleMaterial: "Plomo Sintético" }))).toEqual({
      reason: "estructura-no-reconocida",
      rule: "resumen-titulo-sin-limite",
      page: 1,
    });
  });
});

describe("CA-8 ninguna celda reemplaza a otra ni se asigna sin respaldo del encabezado", () => {
  it("una celda de más en cualquier posición: o se descarta, o rechazo, o pending; nunca un valor distinto", () => {
    const base = defaultSummaryTable(EXPECTED, { costs: true });
    const outcomes = { intact: 0, rejected: 0, areaPending: 0 };
    for (let x = 100; x <= 960; x += 20) {
      const reading = readTable(addCell(base, "999", x));
      if (!reading.ok) {
        rejection(reading);
        outcomes.rejected += 1;
        continue;
      }
      const [row] = reading.document.summary.boards;
      expect([row.count, row.lengthMm, row.widthMm, row.parts], `celda de más en x = ${x}`).toEqual([WANT_ROW.count, WANT_ROW.lengthMm, WANT_ROW.widthMm, WANT_ROW.parts]);
      if (row.areaM2 === null) {
        expect(reading.document.pending.map((p) => p.path), `x = ${x}`).toContain("summary.boards[0].areaM2");
        outcomes.areaPending += 1;
      } else {
        expect(row.areaM2, `x = ${x}`).toBe(WANT_ROW.areaM2);
        outcomes.intact += 1;
      }
    }
    // El barrido no es vacío: hay posiciones en cada resultado.
    expect(outcomes.intact).toBeGreaterThan(0);
    expect(outcomes.rejected).toBeGreaterThan(0);
  });
});
