// Palabras de OCR con la ESTRUCTURA medida en la primera corrida real (docs/spec-revision-ocr-real.md §2.1 y §5.3),
// armadas en memoria sobre el documento sintético S1 (datos ficticios: código 9999-, "Gris Sintético"). No copia
// nada de .ocr-data/: solo reproduce la forma (renglón corrido, separadores, huecos relativos al alto de la caja).
//
// Lo que cambia respecto de `renderCutList(..., { words: true })`:
//  - página 1: título del documento, `|`, material, `/`, espesor; hueco grande; fecha, hora, "am", `|`, unidad, todo
//    en UN renglón (separaciones de 0,09 a 0,64);
//  - banda de cada hoja en UN renglón: `<material> <e> mm - <L> mm x <A> mm - Tablero estándar`, hueco, `i / N`
//    (el `/` del material se pierde, como en el OCR real);
//  - pie en UN renglón: fibra, signo, `<n> piezas`, hueco, longitud de cortes, signo, eficiencia.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { CutListPdf, PdfTextElement, PdfTextInput } from "@/pdf/types";
import { renderCutList } from "./pdfTextLayout";

const S1_FILE = path.resolve(__dirname, "..", "fixtures", "pdf-sintetico", "esperado", "S1.json");

/** Alto de la caja de una palabra (el mismo que usa `renderCutList`). */
export const WORD_HEIGHT = 7;
const CHAR_WIDTH = 4;

/** Una palabra y el hueco que la separa de la anterior, × el alto de la caja. */
export type Part = readonly [text: string, gapBefore: number];

/** Un renglón de palabras desde `x`, con los huecos pedidos. */
export function wordsRow(page: number, y: number, x: number, parts: readonly Part[]): PdfTextElement[] {
  const out: PdfTextElement[] = [];
  let cursor = x;
  parts.forEach(([text, gap], i) => {
    if (i > 0) cursor += gap * WORD_HEIGHT;
    const width = Math.max(text.length, 1) * CHAR_WIDTH;
    out.push({ page, x: cursor, y, width, height: WORD_HEIGHT, text });
    cursor += width;
  });
  return out;
}

/** Documento esperado: S1 con dos hojas de dos páginas (2-3 y 4-5), como el PDF real de la corrida 1. */
export function ocrRealLikeExpected(): CutListPdf {
  const base = JSON.parse(readFileSync(S1_FILE, "utf8")) as CutListPdf;
  const first = { ...structuredClone(base.boards[0]), index: 1, total: 2, pages: [2, 3] };
  const second = { ...structuredClone(base.boards[0]), index: 2, total: 2, pages: [4, 5] };
  base.boards = [first, second];
  base.summary.boards = base.summary.boards.map((row) => ({ ...row, count: 2, parts: row.parts * 2 }));
  base.summary.cutCount = base.summary.cutCount === null ? null : base.summary.cutCount * 2;
  base.summary.cutLengthM = base.summary.cutLengthM === null ? null : Math.round(base.summary.cutLengthM * 200) / 100;
  base.pending = [];
  return base;
}

export interface OcrRealLikeOptions {
  /** Unidad del renglón de cabecera; null = no está (TP-97). */
  unit?: string | null;
  /** Hora y "am" como dos palabras (como el OCR real) o pegadas. */
  time?: "separadas" | "pegadas";
  /** Una palabra que no es límite justo después de la hora (R-5). */
  afterTime?: string | null;
  /** La barra `|` entre el título del documento y el material (TP-104). */
  titleSeparator?: boolean;
  /** Material del título del resumen (por defecto, el del documento). */
  titleMaterial?: string;
  /** `/` entre material y espesor en la banda de hoja (el OCR real lo pierde). */
  bandSlash?: boolean;
  /** Material y espesor de la banda (por defecto, los del documento). */
  bandMaterial?: string;
  bandThickness?: number;
  /** Páginas con una letra suelta entre el " - " y la medida (caso p. 4, TP-99). */
  strayLetterPages?: readonly number[];
  /** Páginas con el largo partido en dos palabras, separación 0,5 (TP-100). */
  splitLengthPages?: readonly number[];
  /** Páginas con una segunda medida distinta en el renglón de `i / N` (TP-103). */
  extraSizePages?: readonly number[];
  /** Páginas sin la medida en la banda (TP-105). */
  noSizePages?: readonly number[];
  /** Signo entre "la longitud" y "<n> piezas"; null = sin signo (TP-102). */
  footerSign?: string | null;
  /** Texto en lugar del valor de "Longitud de cortes" del pie (TP-102). */
  footerCutLength?: string;
}

const decimal = (value: number) => String(value).replace(".", ",");
const pages = (list: readonly number[] | undefined, page: number) => (list ?? []).includes(page);

function headerRow(doc: CutListPdf, o: OcrRealLikeOptions): PdfTextElement[] {
  const [date, time] = doc.header.generatedAt.split(" ");
  const hour = time.replace(/[ap]m$/i, "");
  const meridiem = time.slice(hour.length);
  const material = (o.titleMaterial ?? doc.header.material).split(" ");
  const parts: Part[] = [
    ["Hoja", 0],
    ["de", 0.3],
    ["prueba", 0.25],
    ...((o.titleSeparator ?? true) ? [["|", 0.2] as const] : []),
    ...material.map((word, i): Part => [word, i === 0 ? 0.44 : 0.3]),
    ["/", 0.3],
    [String(doc.header.thicknessMm), 0.3],
    ["mm", 0.25],
    [date, 12.9],
    ...(o.time === "pegadas" ? [[time, 0.4] as const] : [[hour, 0.4] as const, [meridiem, 0.09] as const]),
    ...(o.afterTime ? [[o.afterTime, 0.3] as const] : []),
  ];
  const unit = o.unit === undefined ? "Milimetro" : o.unit;
  if (unit !== null) parts.push(["|", 0.3], [unit, 0.64]);
  return wordsRow(1, 40, 40, parts);
}

function bandRow(board: CutListPdf["boards"][number], page: number, o: OcrRealLikeOptions): PdfTextElement[] {
  const material = (o.bandMaterial ?? board.material).split(" ");
  const thickness = String(o.bandThickness ?? board.thicknessMm);
  const length = String(board.lengthMm);
  const parts: Part[] = material.map((word, i): Part => [word, i === 0 ? 0 : 0.3]);
  if (o.bandSlash) parts.push(["/", 0.3], [thickness, 0.3]);
  else parts.push([thickness, 1.3]);
  parts.push(["mm", 0.3], ["-", 0.4]);
  if (!pages(o.noSizePages, page)) {
    const stray = pages(o.strayLetterPages, page);
    if (stray) parts.push(["Q", 1.37]);
    const firstGap = stray ? 0.5 : 2.3;
    if (pages(o.splitLengthPages, page)) parts.push([length.slice(0, 2), firstGap], [length.slice(2), 0.5]);
    else parts.push([length, firstGap]);
    parts.push(["mm", 0.3], ["x", 0.4], [String(board.widthMm), 0.4], ["mm", 0.3], ["-", 0.5]);
  }
  parts.push(["Tablero", 0.9], ["estándar", 0.3]);
  if (pages(o.extraSizePages, page)) parts.push(["-", 0.5], ["1999", 2.3], ["mm", 0.3], ["x", 0.4], ["1888", 0.4], ["mm", 0.3]);
  parts.push([String(board.index), 19], ["/", 0.3], [String(board.total), 0.3]);
  return wordsRow(page, 40, 40, parts);
}

function footerRow(board: CutListPdf["boards"][number], page: number, y: number, o: OcrRealLikeOptions): PdfTextElement[] {
  const sign = o.footerSign === undefined ? "→" : o.footerSign;
  const parts: Part[] = [
    ["La", 0],
    ["fibra", 0.3],
    ["sigue", 0.3],
    ["la", 0.3],
    ["longitud", 0.3],
    ...(sign === null ? [] : [[sign, 0.5] as const]),
    [String(board.pieceCount), 0.6],
    [board.pieceCount === 1 ? "pieza" : "piezas", 0.3],
    ["Longitud", 13],
    ["de", 0.3],
    ["cortes", 0.3],
    [":", 0.1],
    [o.footerCutLength ?? decimal(board.cutLengthM ?? 0), 0.5],
    ["m", 0.3],
    ["→", 0.6],
    ["Eficiencia", 0.7],
    [":", 0.1],
    [decimal(board.efficiencyPct ?? 0), 0.5],
    ["%", 0.2],
  ];
  return wordsRow(page, y, 40, parts);
}

/** Entrada de OCR con la estructura de la corrida 1 (y las variantes de las pruebas TP-95 a TP-105). */
export function ocrRealLike(options: OcrRealLikeOptions = {}, doc: CutListPdf = ocrRealLikeExpected()): PdfTextInput {
  const input = renderCutList(doc, { words: true });
  const sheetPages = new Set(doc.boards.flatMap((board) => board.pages));
  const footerY = new Map<number, number>();
  for (const board of doc.boards) {
    const last = board.pages[board.pages.length - 1];
    const fibra = input.elements.find((e) => e.page === last && e.text === "fibra");
    if (fibra) footerY.set(last, fibra.y);
  }
  const kept = input.elements.filter((e) => {
    if (e.page === 1) return e.y !== 40 && !(e.y === 55 && e.text === "Milimetro");
    if (sheetPages.has(e.page) && e.y === 40) return false;
    return footerY.get(e.page) !== e.y;
  });
  const added: PdfTextElement[] = [...headerRow(doc, options)];
  for (const board of doc.boards) {
    for (const page of board.pages) added.push(...bandRow(board, page, options));
    const last = board.pages[board.pages.length - 1];
    const y = footerY.get(last);
    if (y !== undefined) added.push(...footerRow(board, last, y, options));
  }
  return { ...input, elements: [...kept, ...added] };
}
