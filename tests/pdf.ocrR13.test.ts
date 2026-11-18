// R-13: anclas de la columna "No." (TP-123 a TP-127).
// Spec: docs/spec-revision-ocr-real.md v0.8 (aprobada el 11/11/2026), §4.6. Entradas en memoria con la ESTRUCTURA observada
// en las corridas reales (tests/helpers/ocrRealLike.ts), con datos ficticios (TS-12b). Sin red y sin nada de .ocr-data/.

import { describe, expect, it } from "vitest";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import type { CutListPdf, PdfTextElement, PdfTextInput } from "@/pdf/types";
import { unmarkedAgainst } from "./helpers/ocrDiff";
import { ocrRealLike, ocrRealLikeExpected } from "./helpers/ocrRealLike";
import { ok } from "./helpers/ocrAssert";

const EXPECTED = ocrRealLikeExpected();


// R-13: anclas de la columna "No." (TP-123 a TP-127)

/** La tabla cerrada: cada mayúscula latina y su gemela cirílica de glifo idéntico. */
const TWINS = [
  ["A", "\u0410"],
  ["B", "\u0412"],
  ["E", "\u0415"],
  ["K", "\u041A"],
  ["M", "\u041C"],
  ["H", "\u041D"],
  ["O", "\u041E"],
  ["P", "\u0420"],
  ["C", "\u0421"],
  ["T", "\u0422"],
  ["X", "\u0425"],
] as const;

/** Documento de dos hojas de dos páginas; la fila 6 de la hoja 1 (la segunda de la continuación) lleva `letter`. */
function withLetter(letter: string): CutListPdf {
  const doc = ocrRealLikeExpected();
  doc.boards[0].pieces[5].letter = letter;
  return doc;
}
const ANCHOR_Y = 130; // fila 6 de la hoja 1: página 3, segunda fila (las filas van de a 60 desde y = 70)
const anchorOf = (input: PdfTextInput, letter: string) => {
  const anchor = input.elements.find((e) => e.page === 3 && e.y === ANCHOR_Y && e.text === letter);
  if (!anchor) throw new Error(`el fixture no tiene la letra de fila ${letter}`);
  return anchor;
};
const replaceText = (input: PdfTextInput, target: PdfTextElement, text: string): PdfTextInput => ({
  ...input,
  elements: input.elements.map((e) => (e === target ? { ...e, text } : e)),
});
const withExtra = (input: PdfTextInput, extra: PdfTextElement): PdfTextInput => ({ ...input, elements: [...input.elements, extra] });

describe("TP-123 gemela cirílica en la letra de fila (R-13 a)", () => {
  it.each(TWINS)("la letra %s llega como su gemela cirílica: fila separada, con su letra latina, cantidad, L y A; los cantos se asignan", (latin, cyrillic) => {
    const doc = withLetter(latin);
    const base = ocrRealLike({}, doc);
    const input = replaceText(base, anchorOf(base, latin), cyrillic);
    const document = ok(parseOcrWords(input));
    expect(document.boards[0].pieces).toHaveLength(7);
    expect(document.boards[0].pieces[5].letter).toBe(latin);
    expect(document.boards[0].pieces.reduce((sum, p) => sum + (p.quantity ?? 0), 0)).toBe(document.boards[0].pieceCount);
    expect(unmarkedAgainst(document, doc)).toEqual([]);
    expect(document.pending).toEqual([]);
  });
});

describe("TP-124 un carácter no latino fuera de la tabla (R-13 a)", () => {
  it.each([
    ["una cirílica sin gemela latina", "\u0414"],
    ["una minúscula cirílica", "\u0430"],
    ["otra cirílica sin gemela", "\u0411"],
  ])("%s: no es ancla, como hoy; la fila se funde con la anterior y sus campos quedan en pending, nunca un valor", (_name, letter) => {
    const doc = withLetter("F");
    const base = ocrRealLike({}, doc);
    const document = ok(parseOcrWords(replaceText(base, anchorOf(base, "F"), letter)));
    const pieces = document.boards[0].pieces;
    expect(pieces).toHaveLength(6);
    expect(pieces.map((p) => p.letter)).not.toContain(letter);
    const fused = pieces[4];
    expect([fused.quantity, fused.finalL, fused.finalA]).toEqual([null, null, null]);
    const paths = document.pending.map((p) => p.path);
    for (const field of ["quantity", "finalL", "finalA"]) expect(paths).toContain(`boards[0].pieces[4].${field}`);
  });
});

describe("TP-125 anclas superpuestas iguales (R-13 b)", () => {
  const duplicate = (input: PdfTextInput, anchor: PdfTextElement, text: string) => withExtra(input, { ...anchor, text, x: anchor.x + 0.3, y: anchor.y + 0.98 });
  it("dos cajas a 0,14 del alto con la misma letra: una sola fila; la segunda caja no está en ninguna celda", () => {
    const doc = withLetter("H");
    const base = ocrRealLike({}, doc);
    const document = ok(parseOcrWords(duplicate(base, anchorOf(base, "H"), "H")));
    expect(document.boards[0].pieces).toHaveLength(7);
    expect(unmarkedAgainst(document, doc)).toEqual([]);
    expect(document.pending).toEqual([]);
  });
  it("una latina y su gemela cirílica: una sola fila", () => {
    const doc = withLetter("C");
    const base = ocrRealLike({}, doc);
    const document = ok(parseOcrWords(duplicate(base, anchorOf(base, "C"), "\u0421")));
    expect(document.boards[0].pieces).toHaveLength(7);
    expect(unmarkedAgainst(document, doc)).toEqual([]);
    expect(document.pending).toEqual([]);
  });
});

describe("TP-126 anclas superpuestas distintas (R-13 b)", () => {
  it("cajas de 2 y 1 caracteres con letras distintas: no se funden; la fila vacía queda en pending; nunca se elige una letra", () => {
    const doc = withLetter("H");
    const base = ocrRealLike({}, doc);
    const anchor = anchorOf(base, "H");
    const document = ok(parseOcrWords(withExtra(base, { ...anchor, text: "CC", width: anchor.width * 2, x: anchor.x - anchor.width / 2, y: anchor.y + 0.98 })));
    const pieces = document.boards[0].pieces;
    expect(pieces).toHaveLength(8);
    expect(pieces.slice(5, 7).map((p) => p.letter)).toEqual(["H", "CC"]);
    const empty = pieces[5];
    expect([empty.quantity, empty.finalL, empty.finalA]).toEqual([null, null, null]);
    const paths = document.pending.map((p) => p.path);
    for (const field of ["quantity", "finalL", "finalA"]) expect(paths).toContain(`boards[0].pieces[5].${field}`);
  });
});

describe("TP-127 el paso de los cantos no tiene piso (H-C, límite conocido)", () => {
  it("dos marcas de una fila casi en la misma x, sin fusión de filas: pending en edges de la hoja, como hoy (TP-90)", () => {
    const base = ocrRealLike();
    // Mueve la marca s2 de la pieza B (hoja 1, página 2) a 3 pt de la marca s1.
    const moved = base.elements.map((e) => (e.page === 2 && e.y >= 571 && e.y < 600 && e.x + e.width / 2 > 459 && e.x + e.width / 2 < 498 ? { ...e, x: e.x - 36 } : e));
    const document = ok(parseOcrWords({ ...base, elements: moved }));
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
    const paths = document.pending.map((p) => p.path);
    for (let piece = 0; piece < 6; piece += 1) expect(paths, `pieza ${piece}`).toContain(`boards[0].pieces[${piece}].edges`);
  });
});
