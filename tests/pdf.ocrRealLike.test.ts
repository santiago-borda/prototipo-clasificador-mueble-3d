// Lectura con OCR de datos que comparten renglón (docs/spec-revision-ocr-real.md §4 y §5; spec-esquema §8.2,
// "Datos que comparten renglón"): TP-95 a TP-107 y CA-1 a CA-5. Entradas en memoria con la ESTRUCTURA de la corrida 1
// (tests/helpers/ocrRealLike.ts), con datos ficticios. Sin red y sin nada de .ocr-data/.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import { parseCutListText } from "@/pdf/parseText";
import { PDF_REJECT_RULES } from "@/pdf/rejectRules";
import type { CutListPdf, PdfReading, PdfTextElement, PdfTextInput } from "@/pdf/types";
import { validateCutListPdf } from "@/pdf/validate";
import { olmoDocuments } from "./helpers/pdfFixtures";
import { buildAll, idealInput, idealWords } from "./helpers/pdfSintetico/outputs";
import { loadReplay } from "./helpers/pdfSintetico/replay";
import { renderCutList, withoutSource } from "./helpers/pdfTextLayout";
import { ocrRealLike, ocrRealLikeExpected, wordsRow, type OcrRealLikeOptions } from "./helpers/ocrRealLike";

const EXPECTED = ocrRealLikeExpected();

function ok(reading: PdfReading): CutListPdf {
  if (!reading.ok) throw new Error(`${reading.reason} (${reading.rule}, p. ${reading.page})`);
  return reading.document;
}
const read = (options: OcrRealLikeOptions = {}) => parseOcrWords(ocrRealLike(options));
const withElements = (input: PdfTextInput, add: readonly PdfTextElement[], drop: (e: PdfTextElement) => boolean = () => false): PdfTextInput => ({
  ...input,
  elements: [...input.elements.filter((e) => !drop(e)), ...add],
});

/** Rechazo con su `rule` y `page`; la página es un número si y solo si la regla es de una página (OR-18). */
function rejection(reading: PdfReading) {
  expect(reading.ok).toBe(false);
  if (reading.ok) throw new Error("se esperaba un rechazo");
  expect(Object.keys(PDF_REJECT_RULES)).toContain(reading.rule);
  expect(PDF_REJECT_RULES[reading.rule].reason).toBe(reading.reason);
  expect(reading.page === null).toBe(PDF_REJECT_RULES[reading.rule].scope === "documento");
  return { reason: reading.reason, rule: reading.rule, page: reading.page };
}

/** N-1: `generatedAt` se compara ignorando espacios. */
const sameDate = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/** Rutas de los campos (hojas del árbol) con un valor distinto del esperado. */
function differences(got: unknown, want: unknown, at = ""): string[] {
  if (at === "header.generatedAt" && typeof got === "string" && typeof want === "string") return sameDate(got, want) ? [] : [at];
  if (Array.isArray(got) && Array.isArray(want)) {
    const length = Math.max(got.length, want.length);
    return Array.from({ length }, (_, i) => differences(got[i], want[i], `${at}[${i}]`)).flat();
  }
  if (got && want && typeof got === "object" && typeof want === "object") {
    const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
    return [...keys].flatMap((key) => differences((got as Record<string, unknown>)[key], (want as Record<string, unknown>)[key], at === "" ? key : `${at}.${key}`));
  }
  return Object.is(got, want) ? [] : [at];
}
/** Un campo distinto está cubierto si su ruta (o un prefijo de ella) tiene `pending`. */
const covered = (document: CutListPdf, field: string) => document.pending.some((p) => field === p.path || field.startsWith(`${p.path}.`) || field.startsWith(`${p.path}[`));
const unmarked = (document: CutListPdf) =>
  differences(withoutSource({ ...document, pending: [] }), withoutSource({ ...EXPECTED, pending: [] })).filter((field) => !covered(document, field));

describe("CA-1 y CA-3: geometría observada en la corrida 1", () => {
  it("se leen la unidad, la fecha, el título, la banda de cada hoja y el pie; ningún valor distinto sin pending, header incluido", () => {
    const document = ok(read());
    expect(unmarked(document)).toEqual([]);
    expect(document.pending).toEqual([]);
    expect(document.boards.map((b) => [b.material, b.thicknessMm, b.lengthMm, b.widthMm, b.kind, b.pieceCount])).toEqual(
      EXPECTED.boards.map((b) => [b.material, b.thicknessMm, b.lengthMm, b.widthMm, b.kind, b.pieceCount]),
    );
  });

  it("CA-5 (TP-53): toda fila sale dudosa con origen-ocr", () => {
    const validation = validateCutListPdf(ok(read()));
    expect(validation.status).toBe("validado");
    if (validation.status !== "validado") return;
    expect(validation.rows.length).toBe(EXPECTED.boards.reduce((sum, b) => sum + b.pieces.length, 0));
    expect(validation.rows.every((row) => row.level === "dudosa" && row.reasons.includes("origen-ocr"))).toBe(true);
  });
});

describe("TP-95 unidad y fecha en un renglón (R-4, R-5, N-1)", () => {
  it("hora y 'am' como dos palabras: unidad leída; generatedAt = fecha + hora con 'am', sin la unidad (ignorando espacios)", () => {
    const document = ok(read({ time: "separadas" }));
    expect(document.header.unit).toBe("mm");
    expect(sameDate(document.header.generatedAt, EXPECTED.header.generatedAt)).toBe(true);
    expect(document.header.generatedAt).not.toMatch(/Milimetro|\|/);
    expect(document.pending.map((p) => p.path)).not.toContain("header.generatedAt");
  });
  it("hora y 'am' pegadas: el mismo valor", () => {
    const document = ok(read({ time: "pegadas" }));
    expect(document.header.generatedAt).toBe(EXPECTED.header.generatedAt);
  });
  it("algo que no es límite después de la hora: generatedAt queda en pending, sin valor", () => {
    const document = ok(read({ afterTime: "Zeta" }));
    expect(document.header.generatedAt).toBe("");
    expect(document.pending.map((p) => p.path)).toContain("header.generatedAt");
  });
});

describe("TP-96 y TP-97 unidad (R-4)", () => {
  it("TP-96 otra unidad: unidad-no-soportada", () => {
    expect(rejection(read({ unit: "Centimetro" }))).toEqual({ reason: "unidad-no-soportada", rule: "resumen-unidad-no-soportada", page: 1 });
  });
  it("TP-97 sin unidad: estructura-no-reconocida con la regla de 'resumen sin unidad'", () => {
    expect(rejection(read({ unit: null }))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-sin-unidad", page: 1 });
  });
  it("R-2: la unidad debajo de la tabla del resumen no cuenta", () => {
    const input = withElements(ocrRealLike({ unit: null }), wordsRow(1, 790, 40, [["Milimetro", 0]]));
    expect(rejection(parseOcrWords(input)).rule).toBe("resumen-sin-unidad");
  });
});

describe("TP-98 banda de hoja en un renglón (R-6, R-8)", () => {
  it.each([
    ["sin /", false],
    ["con /", true],
  ])("%s: medida, tipo, material y espesor leídos", (_name, bandSlash) => {
    const document = ok(read({ bandSlash }));
    for (const [i, board] of document.boards.entries()) {
      const want = EXPECTED.boards[i];
      expect([board.material, board.thicknessMm, board.lengthMm, board.widthMm, board.kind]).toEqual([want.material, want.thicknessMm, want.lengthMm, want.widthMm, want.kind]);
    }
  });
});

describe("TP-99 a TP-101, TP-103 (R-8, R-6, R-3): sin límite o ambiguo → rechazo, nunca un valor", () => {
  it("TP-99 letra suelta entre el '-' y la medida en la p. 4: rechazo en la primera página de esa hoja", () => {
    expect(rejection(read({ strayLetterPages: [4] }))).toEqual({ reason: "estructura-no-reconocida", rule: "hoja-sin-encabezado-completo", page: 4 });
  });
  it("TP-99 en una página de continuación la medida no se usa: se lee", () => {
    const document = ok(read({ strayLetterPages: [5] }));
    expect(document.boards[1].lengthMm).toBe(EXPECTED.boards[1].lengthMm);
  });
  it("TP-100 número de la medida partido en dos palabras: no se toma el número parcial", () => {
    expect(rejection(read({ splitLengthPages: [2] }))).toEqual({ reason: "estructura-no-reconocida", rule: "hoja-sin-encabezado-completo", page: 2 });
  });
  it("TP-101 sin '/' e igual al resumen: leído; con '/': leído", () => {
    expect(ok(read({ bandSlash: false })).boards[0].material).toBe(EXPECTED.header.material);
    expect(ok(read({ bandSlash: true })).boards[0].material).toBe(EXPECTED.header.material);
  });
  it("TP-101 sin '/' y distinto del resumen (material o espesor): hoja-incompleta", () => {
    expect(rejection(read({ bandMaterial: "Azul Sintético" }))).toEqual({ reason: "hoja-incompleta", rule: "hoja-sin-material", page: 2 });
    expect(rejection(read({ bandThickness: 15 }))).toEqual({ reason: "hoja-incompleta", rule: "hoja-sin-material", page: 2 });
  });
  it("TP-101 con '/' y otro material: se lee el de la banda (como hoy) y el de la hoja no se toma del resumen", () => {
    const document = ok(read({ bandSlash: true, bandMaterial: "Azul Sintético" }));
    expect(document.boards.map((b) => b.material)).toEqual(["Azul Sintético", "Azul Sintético"]);
  });
  it("TP-103 dos medidas distintas en el renglón de i / N: no se elige, rechazo", () => {
    expect(rejection(read({ extraSizePages: [2] }))).toEqual({ reason: "estructura-no-reconocida", rule: "hoja-medida-ambigua", page: 2 });
  });
});

describe("TP-102 pie en un renglón (R-9)", () => {
  it("pieceCount, longitud de cortes y eficiencia leídos", () => {
    const document = ok(read());
    expect(document.boards.map((b) => [b.pieceCount, b.cutLengthM, b.efficiencyPct])).toEqual(EXPECTED.boards.map((b) => [b.pieceCount, b.cutLengthM, b.efficiencyPct]));
  });
  it("longitud de cortes que no es un número: pending, nunca otro valor", () => {
    const document = ok(read({ footerCutLength: "ilegible" }));
    expect(document.boards.map((b) => b.cutLengthM)).toEqual([null, null]);
    expect(document.pending.map((p) => p.path)).toEqual(["boards[0].cutLengthM", "boards[1].cutLengthM"]);
    expect(document.boards.map((b) => b.efficiencyPct)).toEqual(EXPECTED.boards.map((b) => b.efficiencyPct));
  });
  it("sin el signo entre la fibra y '<n> piezas' la cantidad no está delimitada: hoja sin pie", () => {
    expect(rejection(read({ footerSign: null }))).toEqual({ reason: "hoja-incompleta", rule: "hoja-sin-pie", page: 3 });
  });
});

describe("TP-104 título del resumen (R-7, P-R4)", () => {
  it("(a) separado del material por '|': solo el material, sin el título ni la barra", () => {
    expect(ok(read({ titleSeparator: true })).header.material).toBe(EXPECTED.header.material);
  });
  it("(b) sin separador y el final coincide con una fila de la tabla: el material de la fila", () => {
    expect(ok(read({ titleSeparator: false })).header.material).toBe(EXPECTED.header.material);
  });
  it("(c) sin separador y sin coincidencia: rechazo", () => {
    expect(rejection(read({ titleSeparator: false, titleMaterial: "Plomo Sintético" }))).toEqual({
      reason: "estructura-no-reconocida",
      rule: "resumen-titulo-sin-limite",
      page: 1,
    });
  });
  it("R-3: dos títulos con materiales distintos arriba de la tabla: rechazo", () => {
    const input = withElements(ocrRealLike(), wordsRow(1, 70, 40, [["|", 0], ["Azul", 0.3], ["/", 0.3], ["18", 0.3], ["mm", 0.3]]));
    expect(rejection(parseOcrWords(input))).toEqual({ reason: "estructura-no-reconocida", rule: "resumen-titulo-ambiguo", page: 1 });
  });
});

describe("TP-105 zonas (R-2): una medida fuera del renglón de i / N no es la del tablero", () => {
  const otherSize: [string, number][] = [["1999", 0], ["mm", 0.3], ["x", 0.4], ["1888", 0.4], ["mm", 0.3]];
  it("en el diagrama o en una celda de la tabla, con la banda completa: la medida es la de la banda", () => {
    const input = withElements(ocrRealLike(), [...wordsRow(2, 200, 300, otherSize), ...wordsRow(2, 524, 63, otherSize)]);
    const document = ok(parseOcrWords(input));
    expect([document.boards[0].lengthMm, document.boards[0].widthMm]).toEqual([EXPECTED.boards[0].lengthMm, EXPECTED.boards[0].widthMm]);
  });
  it("sin medida en la banda: la del diagrama no se toma, rechazo", () => {
    const input = withElements(ocrRealLike({ noSizePages: [2] }), wordsRow(2, 200, 300, otherSize));
    expect(rejection(parseOcrWords(input)).rule).toBe("hoja-sin-encabezado-completo");
  });
});

// TP-106 (CA-2): salidas de antes del cambio, como sha256 del JSON (calculadas el 10/11 con el parser de la v0.2).
const BEFORE: Record<string, string> = {
  "tp50-frases-0": "29324c55572e56a6b0d7d41a36c75b4d0fe799fc5b84b6097bc7bc999b91f6ad",
  "tp50-words-0": "29324c55572e56a6b0d7d41a36c75b4d0fe799fc5b84b6097bc7bc999b91f6ad",
  "tp50-ocr-0": "437a03a0beb9f61b90379d98574b9a014d22c338a24951abd45c128093a69ec8",
  "tp50-frases-1": "3624ed8b305a85e1a4873e14770078db48954797273a83f830594bdc6b79c107",
  "tp50-words-1": "3624ed8b305a85e1a4873e14770078db48954797273a83f830594bdc6b79c107",
  "tp50-ocr-1": "a18f7f4ec6dedebb32796741c886f323b352e24f979bcdac5f40887fc389aed0",
  "tp50-frases-2": "bca2813827635dda5a344332b32b25b6fa8ab3411bbeb16eb607f0b883b0aeac",
  "tp50-words-2": "bca2813827635dda5a344332b32b25b6fa8ab3411bbeb16eb607f0b883b0aeac",
  "tp50-ocr-2": "b6a66a2b58392418a0949e31436d315f57f71c3a1022497daa0763c24292a71e",
  "ts04-S1": "81dbb302716d29a2b89a1e61d2b04777116228954428cc498ac1067d056f726f",
  "ideal-ocr-S1": "f49b000a6f0022bee73127b0c6ea2205100da9a239d7aa4bb3c099c3defbdf03",
  "ts04-S2": "44a23e7fefbc5835592acae726630192d879e95b1e7c53f4518d27d9e1cbd008",
  "ideal-ocr-S2": "02c09492854ad8e30aa98859e40923751b8c80693a80bcd9cf74295817d0d35a",
  "ts04-S3": "fe4f2e06eba6ade6e307eefa4c19a24033fe5067bb38629581f9ab355c808a48",
  "ideal-ocr-S3": "43297597650fd68936a869743030ee5c89f1d533e70ad7a1af21800db405e791",
  // Línea base nueva (O-R12-2, aprobada el 11/11/2026): el replay sintético S1 y S3 cambian por R-12, y solo ellos.
  // S1: 3 códigos pasan de pending a leídos e iguales al esperado (31 → 28 pending), 2 piezas siguen en pending con otro
  // texto crudo de código y cambia el nombre de 1 pieza. S3: 1 código (5 → 4 pending). Los otros 16 valores no se tocan.
  "replay-S1": "ba7ee3c28c0a887626df4a0acbe542522a8bb58d6071c91e0cf341ca447e15d5",
  "replay-S2": "f486d7e8291995f7be8d7ed2abb422e600dead480687b344cb23285571190160",
  "replay-S3": "34730ad7a1f1ebf720fb074aa2095b3c9cfdeeca120adedc6c0ee8f54b7c5971",
};
/** Un rechazo se compara sin `rule` ni `page`, que agrega C2: el resto (razón y detail) tiene que ser idéntico. */
const sha = (reading: PdfReading) => {
  const before = reading.ok ? reading : { ok: reading.ok, reason: reading.reason, detail: reading.detail };
  return createHash("sha256").update(JSON.stringify(before)).digest("hex");
};

describe("TP-106 sin regresión (CA-2): mismas salidas byte a byte", () => {
  it("TP-50 (frases, palabras y OCR), TS-04 y el replay sintético de Vision", () => {
    const now: Record<string, string> = {};
    olmoDocuments().forEach((doc, i) => {
      now[`tp50-frases-${i}`] = sha(parseCutListText(renderCutList(doc)));
      now[`tp50-words-${i}`] = sha(parseCutListText(renderCutList(doc, { words: true })));
      now[`tp50-ocr-${i}`] = sha(parseOcrWords(renderCutList(doc, { words: true })));
    });
    for (const s of buildAll()) {
      now[`ts04-${s.doc.id}`] = sha(parseCutListText(idealInput(s)));
      now[`ideal-ocr-${s.doc.id}`] = sha(parseOcrWords({ ...idealInput(s), elements: idealWords(s) }));
    }
    for (const id of ["S1", "S2", "S3"] as const) now[`replay-${id}`] = sha(parseOcrWords(loadReplay(id)));
    expect(now).toEqual(BEFORE);
  });
  it("el único rechazo de esas entradas (replay S2, página 3) lleva ahora su regla y su página", () => {
    expect(rejection(parseOcrWords(loadReplay("S2")))).toEqual({ reason: "hoja-incompleta", rule: "hoja-sin-material", page: 3 });
  });
});

describe("TP-107 código partido con una palabra suelta en el medio (RL-1)", () => {
  // S1 con palabras de OCR: el código va en dos renglones ("9999-01-" y "M01-C01"); la palabra suelta cae donde
  // está el ícono, en el primer renglón de la primera fila.
  const s1 = (): CutListPdf => {
    const doc = structuredClone(EXPECTED);
    doc.boards = [{ ...doc.boards[0], index: 1, total: 1 }];
    doc.summary.boards = doc.summary.boards.map((row) => ({ ...row, count: 1, parts: row.parts / 2 }));
    return doc;
  };
  const withStray = (text: string) => {
    const input = renderCutList(s1(), { words: true });
    return parseOcrWords(withElements(input, [{ page: 2, x: 108, y: 500, width: 4, height: 7, text }]));
  };
  const code = s1().boards[0].pieces[0].code;

  it("(a) un signo: se descarta y el código se lee", () => {
    expect(ok(withStray("*")).boards[0].pieces[0].code).toBe(code);
  });
  it.each([
    ["(b) una letra", "X"],
    ["(c) un dígito", "7"],
  ])("%s: nunca otro código válido sin razón", (_name, text) => {
    const document = ok(withStray(text));
    const piece = document.boards[0].pieces[0];
    expect(piece.code).not.toBe(code);
    const validation = validateCutListPdf(document);
    expect(validation.status).toBe("validado");
    if (validation.status !== "validado") return;
    const row = validation.rows.find((r) => r.board === 0 && r.piece === 0);
    expect(row?.reasons.some((reason) => reason === "formato-invalido" || reason === "campo-pendiente")).toBe(true);
  });
});
