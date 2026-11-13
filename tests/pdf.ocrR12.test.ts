// R-12: código partido, el guion y el ícono en el medio (TP-117 a TP-122), CA-9 y la línea base de TP-106.
// Spec: docs/spec-revision-ocr-real.md v0.8 (aprobada el 11/11/2026), §4.5. Entradas en memoria con la ESTRUCTURA observada
// en las corridas reales (tests/helpers/ocrRealLike.ts), con datos ficticios (TS-12b). Sin red y sin nada de .ocr-data/.

import { describe, expect, it } from "vitest";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import type { CutListPdf, PdfReading, PdfTextElement, PdfTextInput } from "@/pdf/types";
import { validateCutListPdf } from "@/pdf/validate";
import { unmarkedAgainst } from "./helpers/ocrDiff";
import { ocrRealLikeExpected, wordsRow } from "./helpers/ocrRealLike";
import { expectedSynthetic, ok } from "./helpers/ocrAssert";
import { loadReplay } from "./helpers/pdfSintetico/replay";
import { renderCutList } from "./helpers/pdfTextLayout";

const EXPECTED = ocrRealLikeExpected();


// R-12: código partido, el guion y el ícono en el medio (TP-117 a TP-122)

/** S1 en una sola hoja, como TP-107. */
function singleSheet(): CutListPdf {
  const doc = structuredClone(EXPECTED);
  doc.boards = [{ ...doc.boards[0], index: 1, total: 1 }];
  doc.summary.boards = doc.summary.boards.map((row) => ({ ...row, count: 1, parts: row.parts / 2 }));
  return doc;
}
const SHEET = singleSheet();
const CODE0 = SHEET.boards[0].pieces[0].code;
const ICON_SIGN = "*";
const BRAILLE_BLANK = "\u2800";
const PRIVATE_USE = "\uE000";

/**
 * El segundo renglón del código (`M01-C0n`, un elemento) llega como tres palabras `M01`, `-`, `C0n` (el OCR real) y,
 * en la primera fila, con `between` entre las palabras indicadas.
 */
function codeInWords(options: { dash?: string; between?: { after: 0 | 1; word: string }; extraDash?: boolean } = {}, extra: readonly PdfTextElement[] = []): PdfTextInput {
  const input = renderCutList(SHEET, { words: true });
  const elements: PdfTextElement[] = [];
  let first = true;
  for (const element of input.elements) {
    const match = /^(M\d{2})-(C\d{2})$/.exec(element.text);
    if (element.page === 1 || !match) {
      elements.push(element);
      continue;
    }
    const dash = options.dash ?? "-";
    const parts: [string, number][] = [[match[1], 0]];
    const between = first && options.between;
    if (between && between.after === 0) parts.push([between.word, 0.8]);
    parts.push([dash, 0.8]);
    if (first && options.extraDash) parts.push([dash, 0.8]);
    if (between && between.after === 1) parts.push([between.word, 0.8]);
    parts.push([match[2], 0.8]);
    elements.push(...wordsRow(element.page, element.y, element.x, parts));
    first = false;
  }
  return { ...input, elements: [...elements, ...extra] };
}
/** Una palabra suelta al final del renglón 1 de la primera fila (donde TextoPdf pone el ícono). */
const endOfRow1 = (...words: readonly string[]) => wordsRow(2, 500, 112, words.map((word, i) => [word, i === 0 ? 0 : 0.6] as const));
const firstPiece = (reading: PdfReading) => ok(reading).boards[0].pieces[0];
const codePending = (document: CutListPdf) => document.pending.some((p) => p.path === "boards[0].pieces[0].code");

describe("TP-117 el guion se conserva (R-12 a)", () => {
  it("`M01`, `-`, `C0n` como tres palabras separadas por huecos mayores que glueGapRatio: el código se lee, igual al esperado", () => {
    const document = ok(parseOcrWords(codeInWords()));
    expect(document.boards[0].pieces.map((p) => p.code)).toEqual(SHEET.boards[0].pieces.map((p) => p.code));
    expect(document.pending.filter((p) => p.path.endsWith(".code"))).toEqual([]);
  });
  it("O-R12-1: la palabra `-` que sobra queda en el nombre", () => {
    const input = codeInWords();
    const name = input.elements.find((e) => e.page === 2 && e.text === "Lateral");
    if (!name) throw new Error("el fixture no tiene la fila 'Lateral'");
    const withDash = { ...input, elements: [...input.elements, ...wordsRow(2, name.y, name.x + name.width + 5, [["-", 0]])] };
    const piece = firstPiece(parseOcrWords(withDash));
    expect(piece.code).toBe(CODE0);
    expect(piece.name).toBe("Lateral -");
  });
});

describe("TP-118 otros guiones no se convierten (R-12 a, H-02)", () => {
  it.each([
    ["U+2010", "\u2010"],
    ["U+2013", "\u2013"],
    ["U+2212", "\u2212"],
  ])("el guion %s: el código va a pending; nunca un código", (_name, dash) => {
    const document = ok(parseOcrWords(codeInWords({ dash })));
    expect(document.boards[0].pieces[0].code).not.toBe(CODE0);
    expect(codePending(document)).toBe(true);
  });
});

describe("TP-119 ícono en el medio (R-12 b)", () => {
  const icons = [
    ["un signo", ICON_SIGN],
    ["U+2800 (braille en blanco)", BRAILLE_BLANK],
    ["un carácter de uso privado", PRIVATE_USE],
  ] as const;
  for (const [name, word] of icons) {
    for (const after of [0, 1] as const) {
      it(`${name} ${after === 0 ? "entre M01 y el guion" : "entre el guion y C0n"}: el código va a pending aunque la unión cumpla el formato`, () => {
        const document = ok(parseOcrWords(codeInWords({ between: { after, word } })));
        expect(document.boards[0].pieces[0].code).not.toBe(CODE0);
        expect(codePending(document)).toBe(true);
        // Las demás filas, sin ícono, se leen.
        expect(document.boards[0].pieces.slice(1).map((p) => p.code)).toEqual(SHEET.boards[0].pieces.slice(1).map((p) => p.code));
      });
    }
  }
});

describe("TP-120 ícono junto al código, al final del renglón 1 (R-12 b)", () => {
  it.each([
    ["un signo", ICON_SIGN],
    ["U+2800", BRAILLE_BLANK],
    ["un carácter de uso privado", PRIVATE_USE],
  ])("%s: se descarta y el código se lee", (_name, word) => {
    const document = ok(parseOcrWords(codeInWords({}, endOfRow1(word))));
    expect(document.boards[0].pieces[0].code).toBe(CODE0);
    expect(codePending(document)).toBe(false);
  });
});

describe("TP-121 ícono leído como letras o dígitos (R-12 c)", () => {
  it.each([
    ["dos dígitos y un signo", ["7", "5", ICON_SIGN]],
    ["una letra", ["X"]],
  ])("%s: nunca otro código válido sin razón", (_name, words) => {
    const document = ok(parseOcrWords(codeInWords({}, endOfRow1(...words))));
    expect(document.boards[0].pieces[0].code).not.toBe(CODE0);
    const validation = validateCutListPdf(document);
    expect(validation.status).toBe("validado");
    if (validation.status !== "validado") return;
    const row = validation.rows.find((r) => r.board === 0 && r.piece === 0);
    expect(row?.reasons.some((reason) => reason === "formato-invalido" || reason === "campo-pendiente")).toBe(true);
  });
});

describe("TP-122 un `-` de más (R-12 a)", () => {
  it("junto al guion del código: la unión da `--`, pending; nunca un código", () => {
    const piece = firstPiece(parseOcrWords(codeInWords({ extraDash: true })));
    expect(piece.code).not.toBe(CODE0);
    expect(piece.code ?? "").not.toMatch(/^\d{4}-\d{2}-M\d{2}-C\d{2}$/);
  });
  it("un ícono leído como `-` al final del renglón 1: la unión rompe el formato, pending", () => {
    const document = ok(parseOcrWords(codeInWords({}, endOfRow1("-"))));
    expect(document.boards[0].pieces[0].code).not.toBe(CODE0);
    expect(codePending(document)).toBe(true);
  });
});

// CA-9 y TP-106 (línea base de R-12): el replay sintético solo convierte pending en valores iguales al esperado

describe("CA-9 R-12 y R-13 no aumentan los valores distintos sin pending (replay sintético)", () => {
  // Los campos informativos que ya difieren sin pending (header.project, texto de las marcas) están fijados en
  // tests/pdf.ocrReplay.test.ts (UNMARKED): acá importan los valores (código, letra, medidas, cantidad).
  it.each(["S1", "S3"] as const)("%s: ningún código, letra, medida ni cantidad distinto del esperado sin pending; los códigos que se leen son los esperados", (id) => {
    const document = ok(parseOcrWords(loadReplay(id)));
    const want = expectedSynthetic(id);
    expect(unmarkedAgainst(document, want).filter((field) => /\.(code|letter|finalL|finalA|quantity)$/.test(field))).toEqual([]);
    document.boards.forEach((board, b) =>
      board.pieces.forEach((piece, p) => {
        if (document.pending.some((entry) => entry.path === `boards[${b}].pieces[${p}].code`)) return;
        expect(piece.code, `boards[${b}].pieces[${p}]`).toBe(want.boards[b].pieces[p].code);
      }),
    );
  });
  it("línea base de TP-106 (O-R12-2): S1 pasa de 31 a 28 pending (3 códigos) y S3 de 5 a 4 (1 código)", () => {
    const pendingCodes = (document: CutListPdf) => document.pending.filter((p) => p.path.endsWith(".code")).length;
    const s1 = ok(parseOcrWords(loadReplay("S1")));
    const s3 = ok(parseOcrWords(loadReplay("S3")));
    expect([s1.pending.length, pendingCodes(s1)]).toEqual([28, 3]);
    expect([s3.pending.length, pendingCodes(s3)]).toEqual([4, 2]);
  });
});
