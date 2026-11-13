// R-14: palabra suelta (pictograma) antes de la medida de la banda (TP-128 a TP-133, CA-10).
// Spec: docs/spec-revision-ocr-real.md v0.8 (aprobada el 11/11/2026), §4.7. Entradas en memoria con la ESTRUCTURA observada
// en las corridas reales (tests/helpers/ocrRealLike.ts), con datos ficticios (TS-12b). Sin red y sin nada de .ocr-data/.

import { describe, expect, it } from "vitest";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import type { CutListPdf } from "@/pdf/types";
import { validateCutListPdf } from "@/pdf/validate";
import { unmarkedAgainst } from "./helpers/ocrDiff";
import { ocrRealLike, ocrRealLikeExpected, type OcrRealLikeOptions } from "./helpers/ocrRealLike";
import { ok, rejection } from "./helpers/ocrAssert";

const EXPECTED = ocrRealLikeExpected();
const WANT_ROW = EXPECTED.summary.boards[0];


// R-14: palabra suelta (pictograma) antes de la medida de la banda (TP-128 a TP-133, CA-10)

const read = (options: OcrRealLikeOptions = {}, doc: CutListPdf = EXPECTED) => parseOcrWords(ocrRealLike(options, doc));
const PICTOGRAM: OcrRealLikeOptions = { strayLetterPages: [2, 3, 4, 5], strayWords: ["w"] };
const MEASURE = EXPECTED.boards.map((b) => [b.lengthMm, b.widthMm]);

describe("TP-128 palabra suelta y medida igual a la del Resumen (R-14 a, c)", () => {
  it("la medida y el tipo se leen; la letra no está en ningún campo; toda fila dudosa", () => {
    const document = ok(read(PICTOGRAM));
    expect(document.boards.map((b) => [b.lengthMm, b.widthMm])).toEqual(MEASURE);
    expect(document.boards.map((b) => b.kind)).toEqual(EXPECTED.boards.map((b) => b.kind));
    expect(JSON.stringify(document.boards)).not.toMatch(/"w"/);
    expect(unmarkedAgainst(document, EXPECTED)).toEqual([]);
    const validation = validateCutListPdf(document);
    expect(validation.status).toBe("validado");
    if (validation.status !== "validado") return;
    expect(validation.rows.every((row) => row.level === "dudosa" && row.reasons.includes("origen-ocr"))).toBe(true);
  });
  it("también con la letra en mayúscula (TP-99 actualizada) y solo en la última hoja (caso p. 4)", () => {
    expect(ok(read({ strayLetterPages: [4] })).boards.map((b) => [b.lengthMm, b.widthMm])).toEqual(MEASURE);
    expect(ok(read({ strayLetterPages: [5] })).boards[1].lengthMm).toBe(EXPECTED.boards[1].lengthMm);
  });
});

describe("TP-129 medida distinta de la del Resumen (R-14 c)", () => {
  it.each([
    ["el largo", { length: 2611, width: 1840 }],
    ["el ancho", { length: 2610, width: 1841 }],
  ])("%s distinto: rechazo hoja-medida-sin-respaldo en la página; ningún valor de medida", (_name, size) => {
    expect(rejection(read({ strayLetterPages: [2], bandSize: { pages: [2], ...size } }))).toEqual({
      reason: "estructura-no-reconocida",
      rule: "hoja-medida-sin-respaldo",
      page: 2,
    });
  });
  it("la medida distinta en la p. 4 (hoja 2): rechazo en la p. 4", () => {
    const reading = read({ strayLetterPages: [4], bandSize: { pages: [4], length: 2611, width: 1840 } });
    expect(rejection(reading)).toMatchObject({ rule: "hoja-medida-sin-respaldo", page: 4 });
  });
});

describe("TP-130 y TP-131 sin tolerancia (R-14 a)", () => {
  it("TP-130: un dígito suelto en lugar de la letra: rechazo de R-8, ningún valor", () => {
    expect(rejection(read({ strayLetterPages: [2], strayWords: ["7"] }))).toEqual({ reason: "estructura-no-reconocida", rule: "hoja-sin-encabezado-completo", page: 2 });
  });
  it("TP-131: dos palabras sueltas de un carácter: rechazo de R-8", () => {
    expect(rejection(read({ strayLetterPages: [2], strayWords: ["w", "z"] }))).toEqual({ reason: "estructura-no-reconocida", rule: "hoja-sin-encabezado-completo", page: 2 });
  });
});

describe("TP-132 sin fila única del Resumen (R-14 c)", () => {
  it("(a) dos filas del Resumen con el mismo material y espesor: rechazo hoja-medida-sin-respaldo", () => {
    const doc = ocrRealLikeExpected();
    doc.summary.boards = [doc.summary.boards[0], { ...doc.summary.boards[0] }];
    expect(rejection(read({ strayLetterPages: [2] }, doc))).toMatchObject({ rule: "hoja-medida-sin-respaldo", page: 2 });
  });
  it("(b) ninguna fila de ese material: rechazo hoja-medida-sin-respaldo", () => {
    const reading = read({ strayLetterPages: [2], bandSlash: true, bandMaterial: "Azul Sintético" });
    expect(rejection(reading)).toMatchObject({ rule: "hoja-medida-sin-respaldo", page: 2 });
  });
});

describe("TP-133 R-14 no actúa si R-8 ya lee la medida (R-14 d)", () => {
  it("(a) sin palabra suelta y con una medida distinta de la del Resumen: se lee como hoy, sin comparar", () => {
    const document = ok(read({ bandSize: { pages: [2], length: 2611, width: 1840 } }));
    expect([document.boards[0].lengthMm, document.boards[0].widthMm]).toEqual([2611, 1840]);
  });
  it("(b) un signo en lugar de la letra: se lee como hoy", () => {
    const document = ok(read({ strayLetterPages: [2], strayWords: ["*"], bandSize: { pages: [2], length: 2611, width: 1840 } }));
    expect([document.boards[0].lengthMm, document.boards[0].widthMm]).toEqual([2611, 1840]);
  });
});

describe("CA-10 R-14 nunca escribe una medida que el Resumen no respalde", () => {
  type Case = [name: string, options: OcrRealLikeOptions, doc: () => CutListPdf, wants: "medida-del-resumen" | "rechazo"];
  const cases: Case[] = [
    ["letra y medida igual", { strayLetterPages: [2] }, ocrRealLikeExpected, "medida-del-resumen"],
    ["letra y otro largo", { strayLetterPages: [2], bandSize: { pages: [2], length: 2609, width: 1840 } }, ocrRealLikeExpected, "rechazo"],
    ["letra y otro ancho", { strayLetterPages: [2], bandSize: { pages: [2], length: 2610, width: 1839 } }, ocrRealLikeExpected, "rechazo"],
    ["dígito suelto", { strayLetterPages: [2], strayWords: ["3"] }, ocrRealLikeExpected, "rechazo"],
    ["dos palabras sueltas", { strayLetterPages: [2], strayWords: ["w", "z"] }, ocrRealLikeExpected, "rechazo"],
    [
      "dos filas con el mismo material y espesor",
      { strayLetterPages: [2] },
      () => {
        const doc = ocrRealLikeExpected();
        doc.summary.boards = [doc.summary.boards[0], { ...doc.summary.boards[0] }];
        return doc;
      },
      "rechazo",
    ],
  ];
  it.each(cases)("%s", (_name, options, doc, wants) => {
    const reading = read(options, doc());
    if (wants === "rechazo") {
      expect(reading.ok).toBe(false);
      return;
    }
    const document = ok(reading);
    expect([document.boards[0].lengthMm, document.boards[0].widthMm]).toEqual([WANT_ROW.lengthMm, WANT_ROW.widthMm]);
  });
});
