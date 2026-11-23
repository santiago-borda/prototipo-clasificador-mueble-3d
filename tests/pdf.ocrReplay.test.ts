// Lectura de la respuesta REAL de Cloud Vision a los PDF sintéticos, sin red (replay del 10/11).
// Spec: docs/spec-esquema-pdf.md §8.2 ("Granularidad con OCR", valores PROVISORIOS) y docs/spec-fixture-sintetico.md §12.
// Criterio de aceptación (lo que importa más que "que lea"): ninguna lectura devuelve un campo mal leído en una fila
// sin marcar; lo que no se puede leer con certeza se rechaza o queda en `pending`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import { parseCutListText } from "@/pdf/parseText";
import type { CutListPdf, PdfReading, PdfTextElement, PdfTextInput } from "@/pdf/types";
import { validateCutListPdf } from "@/pdf/validate";
import { PAGE } from "./fixtures/pdf-sintetico/fuente";
import { buildAll, idealWords, type SyntheticDocument } from "./helpers/pdfSintetico/outputs";
import { loadReplay, type ReplayId } from "./helpers/pdfSintetico/replay";
import { withoutSource } from "./helpers/pdfTextLayout";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures", "pdf-sintetico");
const expected = (id: string) => JSON.parse(readFileSync(path.join(FIXTURE_DIR, "esperado", `${id}.json`), "utf8")) as CutListPdf;
const s1 = buildAll().find((s) => s.doc.id === "S1") as SyntheticDocument;

function readOk(reading: PdfReading): CutListPdf {
  if (!reading.ok) throw new Error(`${reading.reason}: ${reading.detail}`);
  return reading.document;
}

/** Entrada con las palabras ideales de un documento sintético (lo que un OCR perfecto devolvería), ya perturbadas. */
function wordsInput(s: SyntheticDocument, elements: readonly PdfTextElement[]): PdfTextInput {
  return {
    fileName: s.doc.fileName,
    pdfId: s.pdfId,
    producer: null,
    readerVersion: "palabras/ideal",
    pageWidths: Array.from({ length: s.layout.pageCount }, (_, i) => ({ page: i + 1, width: PAGE.width })),
    elements,
  };
}

const clone = (elements: readonly PdfTextElement[]): PdfTextElement[] => elements.map((e) => ({ ...e }));

/** Rutas de los campos distintos entre dos documentos (sin `source` ni `pending`, que no son contenido leído). */
function differingPaths(a: unknown, b: unknown, at = ""): string[] {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return Object.is(a, b) ? [] : [at];
  if (Array.isArray(a) !== Array.isArray(b)) return [at];
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].flatMap((key) => differingPaths(left[key], right[key], Array.isArray(a) ? `${at}[${key}]` : at === "" ? key : `${at}.${key}`));
}

const content = (document: CutListPdf) => ({ ...withoutSource(document), pending: [] });
const differences = (document: CutListPdf, truth: CutListPdf) => differingPaths(content(document), content(truth));

/** Un campo está cubierto si el documento tiene un `pending` en su ruta o en una ruta que lo contiene. */
const covered = (document: CutListPdf, field: string) => document.pending.some(({ path: p }) => field === p || field.startsWith(`${p}.`) || field.startsWith(`${p}[`));

function rowOf(field: string): { board: number; piece: number } | null {
  const match = /^boards\[(\d+)\]\.pieces\[(\d+)\]/.exec(field);
  return match ? { board: Number(match[1]), piece: Number(match[2]) } : null;
}

// --- Replay de la respuesta real ---

describe("replay de la respuesta real de Vision (10/11)", () => {
  it.each(["S1", "S2", "S3"] as const)("%s: con los parámetros de TextoPdf (sin layout) la respuesta real no se lee", (id) => {
    // Es el diagnóstico del 10/11: el parser, tal cual, no reconoce la salida de un OCR. TextoPdf no cambia.
    const reading = parseCutListText(loadReplay(id));
    expect(reading).toMatchObject({ ok: false, reason: "estructura-no-reconocida" });
  });

  it.each(["S1", "S3"] as const)("%s: la lectura por OCR devuelve un documento de ocr-llm", (id) => {
    const document = readOk(parseOcrWords(loadReplay(id)));
    expect(document.source).toMatchObject({ reader: "ocr-llm", hasTextLayer: false });
    expect(document.boards.map((board) => board.pieces.length)).toEqual(expected(id).boards.map((board) => board.pieces.length));
  });

  it("S2 sigue rechazándose de forma conservadora: la página 3 no repite el material y el espesor (hoja-incompleta)", () => {
    const reading = parseOcrWords(loadReplay("S2"));
    expect(reading.ok).toBe(false);
    if (reading.ok) return;
    expect(reading.reason).toBe("hoja-incompleta");
    expect(reading.detail).toContain("página 3");
  });

  it.each(["S1", "S3"] as const)("%s: ninguna fila sale segura y toda fila con un campo distinto del esperado lleva otra razón además de origen-ocr", (id) => {
    const document = readOk(parseOcrWords(loadReplay(id)));
    const validation = validateCutListPdf(document);
    expect(validation.status).toBe("validado");
    if (validation.status !== "validado") return;
    expect(validation.rows.every((row) => row.level === "dudosa" && row.reasons.includes("origen-ocr"))).toBe(true);

    const marked = (board: number, piece: number) => (validation.rows.find((row) => row.board === board && row.piece === piece)?.reasons ?? []).some((reason) => reason !== "origen-ocr");
    const wrongRows = differences(document, expected(id)).flatMap((field) => {
      const row = rowOf(field);
      return row === null ? [] : [row];
    });
    expect(wrongRows.length).toBeGreaterThan(0);
    for (const row of wrongRows) expect(marked(row.board, row.piece), `fila ${row.board}/${row.piece} con un campo distinto y sin otra razón`).toBe(true);
  });

  // Los campos que difieren del esperado SIN un `pending` en su ruta. Se fijan a propósito: un campo nuevo en esta lista
  // es un error de lectura sin marcar y tiene que revisarse, no agregarse. Ninguno es un valor (medida, cantidad, código).
  //  - header.generatedAt: "9:00" + "am" quedan separados por un espacio (cosmético; informativo).
  //  - header.project: el OCR lee "Escenal" por "Escena1" y el guion largo como "-" (informativo; no lo usa ninguna fila).
  //  - edges.sK.label: el OCR pierde el "~" o lo separa ("~ 0 mm"); material, ancho y espesor quedan en `pending`.
  //  - pieces[1].name (S1): el código "M01-C02" se leyó "MO1 CO2", no se pudo separar del nombre; la fila lleva `pending` en `.code`.
  const UNMARKED: Record<"S1" | "S3", string[]> = {
    S1: [
      "header.generatedAt",
      "header.project",
      "boards[0].pieces[0].edges.s2.label",
      "boards[0].pieces[1].name",
      "boards[0].pieces[1].edges.s1.label",
      "boards[0].pieces[1].edges.s3.label",
      "boards[0].pieces[4].edges.s1.label",
      "boards[0].pieces[4].edges.s2.label",
      "boards[0].pieces[4].edges.s3.label",
    ],
    S3: ["header.generatedAt", "header.project"],
  };

  it.each(["S1", "S3"] as const)("%s: los campos distintos del esperado sin pending son exactamente los conocidos", (id) => {
    const document = readOk(parseOcrWords(loadReplay(id)));
    const unmarked = differences(document, expected(id)).filter((field) => !covered(document, field));
    expect(unmarked).toEqual(UNMARKED[id]);
  });

  it.each(["S1", "S3"] as const)("%s: ninguna medida, cantidad ni código leída distinta del esperado queda sin pending", (id) => {
    const document = readOk(parseOcrWords(loadReplay(id)));
    const values = differences(document, expected(id)).filter((field) => /\.(finalL|finalA|quantity|code|letter)$/.test(field));
    expect(values.length).toBeGreaterThan(0);
    for (const field of values) expect(covered(document, field), field).toBe(true);
  });
});

// --- Casos de granularidad: perturbaciones de las palabras ideales de S1 ---

const baseline = (id: ReplayId = "S1") => content(expected(id));

describe("granularidad con OCR: casos sobre las palabras ideales de S1", () => {
  it("las palabras ideales se leen igual con los parámetros de OCR (sin perturbar)", () => {
    expect(content(readOk(parseOcrWords(wordsInput(s1, idealWords(s1)))))).toEqual(baseline());
  });

  it("título partido: '<material> /' y '18 mm' con un hueco de 1,3 × el alto se unen en un solo título", () => {
    const elements = clone(idealWords(s1));
    let moved = 0;
    for (const e of elements) {
      if (e.text !== "18") continue;
      const slash = elements.find((o) => o.page === e.page && o.text === "/" && Math.abs(o.y - e.y) < 1 && o.x < e.x && e.x - (o.x + o.width) < 20);
      if (!slash) continue;
      const x0 = e.x;
      const dx = 1.3 * Math.min(slash.height, e.height) - (e.x - (slash.x + slash.width));
      for (const f of elements) if (f.page === e.page && Math.abs(f.y - e.y) < 1 && f.x >= x0 && f.x < x0 + 30) f.x += dx;
      moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    expect(content(readOk(parseOcrWords(wordsInput(s1, elements))))).toEqual(baseline());
    // TextoPdf (hueco máximo 1) no los une: el título no se reconoce.
    expect(parseCutListText(wordsInput(s1, elements)).ok).toBe(false);
  });

  it("'Cant' + '.': el punto, pegado y más bajo, se une sin espacio y el rótulo 'Cant.' se reconoce", () => {
    const elements: PdfTextElement[] = idealWords(s1).flatMap((e) => {
      if (e.text !== "Cant.") return [e];
      const dotWidth = 2;
      const stem = { ...e, text: "Cant", width: e.width - dotWidth - 1 };
      const dot = { ...e, text: ".", x: stem.x + stem.width + 1, y: e.y + 1, width: dotWidth, height: e.height - 1 };
      return [stem, dot];
    });
    expect(elements.length).toBeGreaterThan(idealWords(s1).length);
    expect(content(readOk(parseOcrWords(wordsInput(s1, elements))))).toEqual(baseline());
    // Sin la unión sin espacio queda "Cant ." y la tabla del resumen no se reconoce.
    expect(parseCutListText(wordsInput(s1, elements)).ok).toBe(false);
  });

  it("'Ta' + 'pa' (dos trozos con letras y hueco casi nulo) NO se pegan: la unión sin espacio exige un signo suelto", () => {
    const elements = idealWords(s1).flatMap((e) => (e.text === "Tapa" ? [{ ...e, text: "Ta", width: e.width / 2 }, { ...e, text: "pa", x: e.x + e.width / 2 + 0.2, width: e.width / 2 - 0.2 }] : [e]));
    const joined = parseOcrWords(wordsInput(s1, elements));
    // Si alguna vez se pegaran, el nombre sería "Tapa ..." y diferiría del esperado sin aviso; acá debe quedar "Ta pa ...".
    const names = joined.ok ? joined.document.boards.flatMap((board) => board.pieces.map((piece) => piece.name)) : [];
    expect(names.some((name) => name.startsWith("Ta pa"))).toBe(true);
  });

  it("jitter de ±1,5 pt en una fila: las celdas que quedan por encima de su letra no son 'texto antes de la primera fila'", () => {
    const base = idealWords(s1);
    const letters = base.filter((e) => e.page === 2 && /^[A-Z]$/.test(e.text) && e.x < 60 && e.y > 480).sort((a, b) => a.y - b.y);
    expect(letters.length).toBeGreaterThan(1);
    const [first, second] = letters;
    const elements = base.map((e) => {
      if (e.page !== 2 || e === first || e === second) return e;
      if (e.y >= first.y - 0.5 && e.y < second.y - 0.5) return { ...e, y: e.y - 1.5 };
      if (e.y >= second.y - 0.5 && e.y < (letters[2]?.y ?? Infinity) - 0.5) return { ...e, y: e.y + 1.5 };
      return e;
    });
    expect(content(readOk(parseOcrWords(wordsInput(s1, elements))))).toEqual(baseline());
    const strict = parseCutListText(wordsInput(s1, elements));
    expect(strict).toMatchObject({ ok: false, reason: "estructura-no-reconocida" });
    if (!strict.ok) expect(strict.detail).toContain("antes de la primera fila");
  });

  it("'mr' + 'mm' duplicado en el título de la hoja: se sigue rechazando (hoja-incompleta)", () => {
    const base = idealWords(s1);
    const index = base.findIndex((e) => e.page === 2 && e.text === "mm" && e.y < 60 && base.some((o) => o.page === 2 && o.text === "18" && Math.abs(o.y - e.y) < 1 && o.x < e.x));
    expect(index).toBeGreaterThanOrEqual(0);
    const title = base[index];
    const elements = base.flatMap((e, i) => (i === index ? [{ ...title, text: "mr" }, { ...title, y: title.y + 2, height: 3 }] : [e]));
    const reading = parseOcrWords(wordsInput(s1, elements));
    expect(reading).toMatchObject({ ok: false, reason: "hoja-incompleta" });
  });

  it("'mr' + 'mm' duplicado en una medida: la medida queda null y en pending, nunca un valor", () => {
    const base = idealWords(s1);
    const cell = base.find((e) => e.page === 2 && e.text === "487" && e.x > 370);
    expect(cell).toBeDefined();
    if (!cell) return;
    const unit = base.find((e) => e.page === 2 && e.text === "mm" && Math.abs(e.y - cell.y) < 2 && e.x > cell.x && e.x < cell.x + 30);
    expect(unit).toBeDefined();
    if (!unit) return;
    const elements = base.flatMap((e) => (e === unit ? [{ ...unit, text: "mr" }, { ...unit, y: unit.y + 2, height: 3 }] : [e]));
    const document = readOk(parseOcrWords(wordsInput(s1, elements)));
    expect(document.boards[0].pieces[0].finalA).toBeNull();
    expect(document.pending.map((p) => p.path)).toContain("boards[0].pieces[0].finalA");
    const validation = validateCutListPdf(document);
    expect(validation.status).toBe("validado");
    if (validation.status === "validado") expect(validation.rows[0].reasons).toContain("campo-pendiente");
  });
});

// --- Parámetros de layout ---

describe("PdfTextInput.layout", () => {
  const OCR = { joinGapRatio: 1.5, glueGapRatio: 0.4, rowToleranceRatio: 0.3 };

  it("parseCutListText respeta layout: con los valores de OCR lee la respuesta real igual que parseOcrWords", () => {
    const viaLayout = readOk(parseCutListText({ ...loadReplay("S1"), layout: OCR }));
    const viaOcr = readOk(parseOcrWords(loadReplay("S1")));
    expect(content(viaLayout)).toEqual(content(viaOcr));
    expect(viaLayout.source.reader).toBe("texto-pdf");
  });

  it("parseOcrWords deja que el llamador reemplace un valor: con joinGapRatio 1 la respuesta real vuelve a no leerse", () => {
    expect(parseOcrWords({ ...loadReplay("S1"), layout: { joinGapRatio: 1 } })).toMatchObject({ ok: false, reason: "estructura-no-reconocida" });
  });

  it("un campo omitido toma el valor de TextoPdf, no el de OCR", () => {
    expect(parseCutListText({ ...loadReplay("S1"), layout: { glueGapRatio: 0.4 } })).toMatchObject({ ok: false, reason: "estructura-no-reconocida" });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("un valor inválido (%s) es un error de programación: RangeError, no una lectura", (value) => {
    expect(() => parseCutListText({ ...loadReplay("S1"), layout: { joinGapRatio: value } })).toThrow(RangeError);
    expect(() => parseCutListText({ ...loadReplay("S1"), layout: { glueGapRatio: value } })).toThrow(RangeError);
    expect(() => parseCutListText({ ...loadReplay("S1"), layout: { rowToleranceRatio: value } })).toThrow(RangeError);
  });
});
