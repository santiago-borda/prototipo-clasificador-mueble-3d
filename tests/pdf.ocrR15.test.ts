// R-15: el `/` del material es opcional en cada aparición (TP-134 a TP-146, CA-11).
// Spec: docs/spec-revision-ocr-real.md §4.8 (aprobada el 12/11/2026) y spec-esquema §8.2 (R-7, R-11, R-15). Entradas en
// memoria con la ESTRUCTURA observada en las corridas reales (tests/helpers/ocrRealLike.ts), con datos ficticios (TS-12b).
// Sin red y sin nada de .ocr-data/.

import { describe, expect, it } from "vitest";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import type { CutListPdf } from "@/pdf/types";
import { validateCutListPdf } from "@/pdf/validate";
import { unmarkedAgainst } from "./helpers/ocrDiff";
import { defaultSummaryTable, ocrRealLike, ocrRealLikeExpected, withSummaryTable, wordsRow, type OcrRealLikeOptions, type SummaryTableSpec } from "./helpers/ocrRealLike";
import { ok, rejection } from "./helpers/ocrAssert";

const EXPECTED = ocrRealLikeExpected();
const WANT_ROW = EXPECTED.summary.boards[0];
const TAIL = "- Tipo Ficticio";

const readTable = (spec: SummaryTableSpec, options: OcrRealLikeOptions = {}, doc: CutListPdf = EXPECTED) => parseOcrWords(withSummaryTable(ocrRealLike(options, doc), spec));

/** La tabla del Resumen con el primer segmento de cada fila reemplazado por `first`. */
const withFirst = (first: string, doc: CutListPdf = EXPECTED): SummaryTableSpec => {
  const spec = defaultSummaryTable(doc);
  return { ...spec, rows: spec.rows.map((row) => ({ ...row, first })) };
};
/** Fila del Resumen sin `/`, con la cola de dos palabras (la forma observada en la validación 1). */
const NO_SLASH_ROW = `${WANT_ROW.material} ${WANT_ROW.thicknessMm} mm ${TAIL}`;
const SLASH_ROW = `${WANT_ROW.material} / ${WANT_ROW.thicknessMm} mm ${TAIL}`;

/** El mismo documento con otro material en el título, la tabla y las hojas. */
function withMaterial(doc: CutListPdf, material: string): CutListPdf {
  const copy = structuredClone(doc);
  copy.header.material = material;
  copy.summary.boards = copy.summary.boards.map((row) => ({ ...row, material }));
  copy.boards = copy.boards.map((board) => ({ ...board, material }));
  return copy;
}

function expectAllDudosa(document: CutListPdf) {
  const validation = validateCutListPdf(document);
  expect(validation.status).toBe("validado");
  if (validation.status !== "validado") return;
  expect(validation.rows.length).toBeGreaterThan(0);
  expect(validation.rows.every((row) => row.level === "dudosa" && row.reasons.includes("origen-ocr"))).toBe(true);
}

const EMPTY_TABLE = { reason: "estructura-no-reconocida", rule: "resumen-tabla-vacia", page: 1 } as const;
const NO_TITLE = { reason: "estructura-no-reconocida", rule: "resumen-sin-titulo-o-tabla", page: 1 } as const;
const AMBIGUOUS_ROW = { reason: "estructura-no-reconocida", rule: "resumen-fila-ambigua", page: 1 } as const;

describe("TP-134 fila del Resumen sin '/', material de dos palabras (R-15 a)", () => {
  it("se lee: material y espesor iguales a los del título, sin la cola; celdas iguales a las de TP-108; sin pending nuevo", () => {
    const document = ok(readTable(withFirst(NO_SLASH_ROW)));
    expect(WANT_ROW.material.split(" ")).toHaveLength(2);
    expect(document.summary.boards).toEqual([WANT_ROW]);
    expect(document.header.material).toBe(EXPECTED.header.material);
    expect(document.header.thicknessMm).toBe(EXPECTED.header.thicknessMm);
    expect(JSON.stringify(document)).not.toContain("Ficticio");
    expect(document.pending).toEqual([]);
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
  });
});

describe("TP-135 material de una palabra y sin cola (R-15 a)", () => {
  it("fila leída, igual", () => {
    const doc = withMaterial(EXPECTED, "Gris");
    const document = ok(readTable(withFirst(`Gris ${WANT_ROW.thicknessMm} mm`, doc), {}, doc));
    expect(document.summary.boards).toEqual([{ ...WANT_ROW, material: "Gris" }]);
    expect(document.header.material).toBe("Gris");
    expect(document.pending).toEqual([]);
  });
});

describe("TP-136 fila con '/' (CA-2): sin cambio", () => {
  it("TP-108 da las mismas salidas (TP-106 se verifica en tests/pdf.ocrRealLike.test.ts, sin tocar)", () => {
    const document = ok(readTable(withFirst(SLASH_ROW)));
    expect(document.summary.boards).toEqual([WANT_ROW]);
    expect(document.pending).toEqual([]);
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
  });
});

describe("TP-137 fila sin '/' con un material distinto del título (R-15 a, e)", () => {
  it.each([
    ["(a) otra palabra", `Azul Sintético ${WANT_ROW.thicknessMm} mm ${TAIL}`],
    ["(b) una palabra de menos", `Sintético ${WANT_ROW.thicknessMm} mm ${TAIL}`],
    ["(c) una palabra de más delante", `Otro ${NO_SLASH_ROW}`],
  ])("%s: la línea no es fila; primera línea → resumen-tabla-vacia", (_name, first) => {
    expect(rejection(readTable(withFirst(first)))).toEqual(EMPTY_TABLE);
  });
  it("una línea posterior que no coincide cierra la tabla: ningún valor de esa línea", () => {
    const spec = defaultSummaryTable(EXPECTED);
    const [row] = spec.rows;
    const document = ok(readTable({ ...spec, rows: [row, { ...row, first: `Azul Sintético 15 mm ${TAIL}` }] }));
    expect(document.summary.boards).toEqual([WANT_ROW]);
  });
});

describe("TP-138 fila sin '/' con otro espesor (R-15 a, e)", () => {
  it("resumen-tabla-vacia", () => {
    expect(rejection(readTable(withFirst(`${WANT_ROW.material} 15 mm ${TAIL}`)))).toEqual(EMPTY_TABLE);
  });
});

describe("TP-139 título sin '/' (R-15 g, c; O-R15-1)", () => {
  const slashTable = () => defaultSummaryTable(EXPECTED, { tail: TAIL });
  it("(a) con '|' a la izquierda e igual a la fila con '/': se lee; sin pending nuevo; toda fila dudosa", () => {
    const document = ok(readTable(slashTable(), { titleSlash: false }));
    expect(document.header.material).toBe(WANT_ROW.material);
    expect(document.header.thicknessMm).toBe(WANT_ROW.thicknessMm);
    expect(document.summary.boards).toEqual([WANT_ROW]);
    expect(document.pending).toEqual([]);
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
    expectAllDudosa(document);
  });
  it.each<[string, SummaryTableSpec, OcrRealLikeOptions]>([
    ["(b) otro material", defaultSummaryTable(EXPECTED, { tail: TAIL }), { titleSlash: false, titleMaterial: "Azul Sintético" }],
    ["(c) otro espesor", defaultSummaryTable(EXPECTED, { tail: TAIL }), { titleSlash: false, titleThickness: 15 }],
    ["(d) sin '|' y sin '/'", defaultSummaryTable(EXPECTED, { tail: TAIL }), { titleSlash: false, titleSeparator: false }],
    ["(e) título y fila sin '/'", withFirst(NO_SLASH_ROW), { titleSlash: false }],
    ["(f) con '|' y solo el espesor", defaultSummaryTable(EXPECTED, { tail: TAIL }), { titleSlash: false, titleMaterial: "" }],
  ])("%s: rechazo resumen-sin-titulo-o-tabla", (_name, spec, options) => {
    expect(rejection(readTable(spec, options))).toEqual(NO_TITLE);
  });
});

describe("TP-139 (R-15 g, R-3) dos títulos sin '/' distintos", () => {
  const extraTitle = wordsRow(1, 25, 40, [
    ["Otro", 0],
    ["|", 0.2],
    ["Azul", 0.44],
    ["Sintético", 0.3],
    ["15", 0.3],
    ["mm", 0.25],
  ]);
  const twoRows = (): SummaryTableSpec => {
    const spec = defaultSummaryTable(EXPECTED);
    const [row] = spec.rows;
    return { ...spec, rows: [row, { ...row, first: "Azul Sintético / 15 mm" }] };
  };
  const input = (spec: SummaryTableSpec) => {
    const base = withSummaryTable(ocrRealLike({ titleSlash: false }), spec);
    return { ...base, elements: [...base.elements, ...extraTitle] };
  };
  it("los dos iguales a una fila con '/': no se elige, resumen-titulo-ambiguo", () => {
    expect(rejection(parseOcrWords(input(twoRows())))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-titulo-ambiguo", page: 1 });
  });
  it("uno sin fila que lo respalde: resumen-sin-titulo-o-tabla", () => {
    expect(rejection(parseOcrWords(input(defaultSummaryTable(EXPECTED))))).toEqual(NO_TITLE);
  });
});

describe("TP-140 título sin separador (rama 2 de R-7) y fila sin '/' (R-15 c)", () => {
  it("R-15 no actúa: resumen-tabla-vacia; nunca un material sin respaldo", () => {
    expect(rejection(readTable(withFirst(NO_SLASH_ROW), { titleSeparator: false }))).toEqual(EMPTY_TABLE);
  });
});

describe("TP-141 el material dos veces en la fila (R-15 d, R-3)", () => {
  const plain = `${WANT_ROW.material} ${WANT_ROW.thicknessMm} mm`;
  const slashed = `${WANT_ROW.material} / ${WANT_ROW.thicknessMm} mm`;
  it.each([
    ["(a) primero con '/' y después sin", `${slashed} - ${plain}`],
    ["(a) primero sin '/' y después con", `${plain} - ${slashed}`],
    ["(b) las dos sin '/', iguales", `${plain} - ${plain}`],
  ])("%s: resumen-fila-ambigua", (_name, first) => {
    expect(rejection(readTable(withFirst(first)))).toEqual(AMBIGUOUS_ROW);
  });
});

describe("TP-142 igualdad exacta desde la primera palabra (R-15 a)", () => {
  it.each([
    ["después de otra palabra del primer segmento", `Tablero ${NO_SLASH_ROW}`],
    ["partido por un separador", `${WANT_ROW.material.split(" ").join(" - ")} ${WANT_ROW.thicknessMm} mm ${TAIL}`],
  ])("%s: no es fila (rechazo vigente)", (_name, first) => {
    expect(rejection(readTable(withFirst(first)))).toEqual(EMPTY_TABLE);
  });
});

describe("TP-143 banda de hoja con el Resumen sin '/' (R-15 b: /-b sin cambio)", () => {
  const table = () => withFirst(NO_SLASH_ROW);
  it("sin '/' e igual al título: leído", () => {
    expect(ok(readTable(table())).boards.map((b) => b.material)).toEqual([WANT_ROW.material, WANT_ROW.material]);
  });
  it("sin '/' y distinta: hoja-incompleta", () => {
    expect(rejection(readTable(table(), { bandMaterial: "Azul Sintético" }))).toEqual({ reason: "hoja-incompleta", rule: "hoja-sin-material", page: 2 });
  });
  it("con '/' y otro material (TP-101): leído, el de la banda", () => {
    expect(ok(readTable(table(), { bandSlash: true, bandMaterial: "Azul Sintético" })).boards.map((b) => b.material)).toEqual(["Azul Sintético", "Azul Sintético"]);
  });
});

describe("TP-144 combinación del Blanco: Resumen sin '/' y bandas con '/' (R-15 a, b)", () => {
  it("documento leído; título, fila y hoja con el mismo material y espesor; toda fila dudosa", () => {
    const document = ok(readTable(withFirst(NO_SLASH_ROW), { bandSlash: true }));
    const pairs = [[document.header.material, document.header.thicknessMm], ...document.summary.boards.map((b) => [b.material, b.thicknessMm]), ...document.boards.map((b) => [b.material, b.thicknessMm])];
    expect(pairs).toEqual(Array.from({ length: 4 }, () => [WANT_ROW.material, WANT_ROW.thicknessMm]));
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
    expectAllDudosa(document);
  });
});

describe("TP-145 combinación del Cedro: Resumen con '/' y bandas sin '/' (sin cambio)", () => {
  it("documento leído", () => {
    const document = ok(readTable(withFirst(SLASH_ROW), { bandSlash: false }));
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
    expect(document.pending).toEqual([]);
  });
});

describe("TP-146 título sin '/' aceptado y bandas (R-15 g, b)", () => {
  const table = () => defaultSummaryTable(EXPECTED, { tail: TAIL });
  it.each([
    ["bandas sin '/'", false],
    ["bandas con '/'", true],
  ])("%s: leídas (/-b contra el título resuelto); toda fila dudosa", (_name, bandSlash) => {
    const document = ok(readTable(table(), { titleSlash: false, bandSlash }));
    expect(document.boards.map((b) => [b.material, b.thicknessMm])).toEqual(EXPECTED.boards.map((b) => [b.material, b.thicknessMm]));
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
    expectAllDudosa(document);
  });
  it("banda sin '/' distinta del título resuelto: hoja-incompleta", () => {
    expect(rejection(readTable(table(), { titleSlash: false, bandThickness: 15 }))).toEqual({ reason: "hoja-incompleta", rule: "hoja-sin-material", page: 2 });
  });
});

describe("CA-11 ningún material ni espesor sin una aparición con '/' que lo respalde", () => {
  it("barrido de título (con/sin '/', con/sin '|', material y espesor) × fila (con/sin '/', material y espesor)", () => {
    const materials = [WANT_ROW.material, "Azul Sintético"];
    const thicknesses = [WANT_ROW.thicknessMm, 15];
    let read = 0;
    let rejected = 0;
    for (const titleSlash of [true, false])
      for (const titleSeparator of [true, false])
        for (const titleMaterial of materials)
          for (const titleThickness of thicknesses)
            for (const rowSlash of [true, false])
              for (const rowMaterial of materials)
                for (const rowThickness of thicknesses) {
                  const first = `${rowMaterial}${rowSlash ? " /" : ""} ${rowThickness} mm ${TAIL}`;
                  const reading = readTable(withFirst(first), { titleSlash, titleSeparator, titleMaterial, titleThickness, bandSlash: true, bandMaterial: rowMaterial, bandThickness: rowThickness });
                  const label = JSON.stringify({ titleSlash, titleSeparator, titleMaterial, titleThickness, rowSlash, rowMaterial, rowThickness });
                  if (!reading.ok) {
                    rejection(reading);
                    rejected += 1;
                    continue;
                  }
                  read += 1;
                  const document = reading.document;
                  // Nunca las dos apariciones sin '/'; la que no lo tiene es exactamente igual a la que sí.
                  expect(titleSlash || rowSlash, label).toBe(true);
                  if (!titleSlash) expect(titleSeparator, label).toBe(true);
                  if (!rowSlash) expect(titleSlash && titleSeparator, label).toBe(true);
                  if (!titleSlash || !rowSlash) expect([titleMaterial, titleThickness], label).toEqual([rowMaterial, rowThickness]);
                  expect(document.summary.boards.map((b) => [b.material, b.thicknessMm]), label).toEqual([[rowMaterial, rowThickness]]);
                  // Con R-15 en juego y los datos del documento, ninguna fila de pieza deja de ser dudosa.
                  if ((!titleSlash || !rowSlash) && rowMaterial === WANT_ROW.material && rowThickness === WANT_ROW.thicknessMm) expectAllDudosa(document);
                }
    expect(read).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });
});
