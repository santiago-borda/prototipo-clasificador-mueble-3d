// Fuente del fixture sintético → textos y formas posicionados por página (docs/spec-fixture-sintetico.md §3).
// Una sola disposición alimenta las tres salidas: el PDF, los elementos de texto ideales y la respuesta de Vision.
// Coordenadas en pt, origen arriba a la izquierda, y hacia abajo (la convención de PdfTextElement).
// Letra monoespaciada: cada carácter avanza 0,6 del tamaño, así la caja de un texto se calcula sin medir glifos.

import { EDGE_TEXT, FUENTE, GENERATED_AT, GEOMETRIA as G, LEYENDA, PAGE, PROJECT, SETTINGS } from "../../fixtures/pdf-sintetico/fuente";
import type { EdgeSlot, FuenteDocumento } from "../../fixtures/pdf-sintetico/fuente";

export const ADVANCE = 0.6;
const SLOTS: EdgeSlot[] = ["s1", "s2", "s3", "s4"];

export interface TextItem {
  page: number;
  x: number;
  y: number;
  size: number;
  text: string;
}

export type Shape =
  | { page: number; kind: "dot"; cx: number; cy: number; r: number; color: [number, number, number] }
  | { page: number; kind: "rect"; x: number; y: number; w: number; h: number }
  | { page: number; kind: "icon"; cx: number; cy: number; r: number }
  | { page: number; kind: "line"; x0: number; y0: number; x1: number; y1: number };

export interface Layout {
  doc: FuenteDocumento;
  pageCount: number;
  texts: TextItem[];
  shapes: Shape[];
  /** Íconos de la designación, como los entregaría una capa de texto: un carácter de uso privado (spec-esquema §8.2). */
  icons: TextItem[];
}

export const ICON_CHAR = "";
export const textWidth = (text: string, size: number) => text.length * ADVANCE * size;
const decimal = (value: number) => String(value).replace(".", ",");

/** Centros de s1 a s4 de una hoja: separaciones distintas, centrados en el rótulo "Tiras de cantos" (§5). */
export function edgeCenters(gaps: readonly [number, number, number]): number[] {
  const [a, b, c] = gaps.map((g) => g * PAGE.width);
  const span = a + b + c;
  const s1 = G.tiras - span / 2;
  return [s1, s1 + a, s1 + a + b, s1 + a + b + c];
}

/** Texto de una marca de canto en 4 renglones: "Canto <1ª palabra>", resto del material, "~0 mm x", "19 mm". */
export function edgeLines(material: string): string[] {
  const [first, ...rest] = material.split(" ");
  return [`Canto ${first}`, rest.join(" "), `${EDGE_TEXT.thickness} x`, `${EDGE_TEXT.widthMm} mm`].filter((line) => line !== "");
}

export function layoutDocument(doc: FuenteDocumento): Layout {
  const texts: TextItem[] = [];
  const shapes: Shape[] = [];
  const icons: TextItem[] = [];
  const left = (page: number, x: number, y: number, text: string, size: number = G.size) => texts.push({ page, x, y, size, text });
  const centered = (page: number, cx: number, y: number, text: string, size: number = G.size) => left(page, cx - textWidth(text, size) / 2, y, text, size);
  const pageCount = Math.max(...doc.boards.flatMap((board) => board.pages));

  for (let page = 1; page <= pageCount; page += 1) left(page, 40, 18, LEYENDA, 6);

  // Resumen.
  left(1, 40, 40, `${doc.material} / ${doc.thicknessMm} mm`);
  left(1, 300, 40, GENERATED_AT);
  left(1, 40, 55, PROJECT, 6);
  left(1, 450, 55, "Milimetro");
  left(1, 40, 90, "Configuraciones");
  let y = 105;
  for (const [key, value] of SETTINGS) {
    left(1, 40, y, key);
    left(1, 200, y, value);
    y += 12;
  }
  y += 10;
  left(1, 40, y, "Estadísticas");
  y += 15;
  for (const [label, value] of [
    ["Tasa de llenado", `${decimal(doc.summary.fillRatePct)} %`],
    ["Número de cortes", String(doc.summary.cutCount)],
    ["Longitud de cortes", `${decimal(doc.summary.cutLengthM)} m`],
  ]) {
    left(1, 40, y, label);
    left(1, 200, y, value);
    y += 12;
  }
  y += 20;
  const SUMMARY = { count: 220, length: 280, width: 340, area: 400, parts: 460 };
  left(1, 40, y, "Tablero");
  centered(1, SUMMARY.count, y, "Cant.");
  centered(1, SUMMARY.length, y, "Longitud");
  centered(1, SUMMARY.width, y, "Anchura");
  centered(1, SUMMARY.area, y, "Σ Areas");
  centered(1, SUMMARY.parts, y, "Σ Partes");
  y += 14;
  const first = doc.boards[0];
  const parts = doc.boards.reduce((sum, board) => sum + board.pieces.reduce((s, p) => s + p.quantity, 0), 0);
  left(1, 40, y, `${doc.material} / ${doc.thicknessMm} mm`);
  centered(1, SUMMARY.count, y, String(doc.boards.length));
  centered(1, SUMMARY.length, y, `${first.lengthMm} mm`);
  centered(1, SUMMARY.width, y, `${first.widthMm} mm`);
  centered(1, SUMMARY.area, y, `${decimal(doc.summary.areaM2)} m²`);
  centered(1, SUMMARY.parts, y, String(parts));

  // Hojas.
  doc.boards.forEach((board, b) => {
    const centers = edgeCenters(board.edgeGaps);
    const pieceCount = board.pieces.reduce((sum, piece) => sum + piece.quantity, 0);
    let next = 0;
    board.pages.forEach((page, pageIndex) => {
      left(page, 40, 40, `${b + 1} / ${doc.boards.length}`);
      left(page, 120, 40, `${doc.material} / ${doc.thicknessMm} mm`);
      left(page, 280, 40, `${board.lengthMm} mm x ${board.widthMm} mm`);
      left(page, 440, 40, "Tablero estándar");

      let rowY: number = G.continuationRowY;
      if (pageIndex === 0) {
        // Diagrama simple: el tablero y una celda por pieza con su letra y una cota (no es una optimización real).
        shapes.push({ page, kind: "rect", x: 40, y: 62, w: 515, h: 370 });
        let cell = 0;
        for (const piece of board.pieces) {
          for (let i = 0; i < piece.quantity; i += 1) {
            const cx = 50 + (cell % 8) * 62;
            const cy = 72 + Math.floor(cell / 8) * 40;
            shapes.push({ page, kind: "rect", x: cx, y: cy, w: 56, h: 32 });
            centered(page, cx + 28, cy + 6, piece.letter);
            centered(page, cx + 28, cy + 19, String(piece.finalL), 5);
            cell += 1;
          }
        }
        if (doc.columns.adjusted) centered(page, G.adjusted, 452, "Ajustadas");
        centered(page, G.finales, 452, "Finales");
        if (doc.columns.edgeStrips) centered(page, G.tiras, 452, "Tiras de cantos");
        centered(page, G.no, 465, "No.");
        centered(page, 93, 465, "Designación");
        centered(page, G.cant, 465, "Cant.");
        if (doc.columns.adjusted) {
          centered(page, G.adjL, 478, "L");
          centered(page, G.adjA, 478, "A");
        }
        centered(page, G.finL, 478, "L");
        centered(page, G.finA, 478, "A");
        // Íconos del encabezado de cada subcolumna: dibujados, el parser no los lee (RP4).
        if (doc.columns.edgeStrips) for (const cx of centers) shapes.push({ page, kind: "icon", cx, cy: 481, r: 3 });
        shapes.push({ page, kind: "line", x0: 30, y0: 490, x1: 565, y1: 490 });
        rowY = G.firstRowY;
      }

      for (const piece of board.pieces.slice(next, next + board.rowsPerPage[pageIndex])) {
        centered(page, G.no, rowY, piece.letter);
        const codeLines = piece.codeSplit === undefined ? [piece.code] : [piece.code.slice(0, piece.codeSplit), piece.code.slice(piece.codeSplit)];
        codeLines.forEach((line, i) => left(page, G.code, rowY + i * 12, line));
        if (piece.icon) {
          const x = G.code + textWidth(codeLines[0], G.size) + 10;
          shapes.push({ page, kind: "icon", cx: x + 3, cy: rowY + 3.5, r: 3 });
          icons.push({ page, x, y: rowY, size: G.size, text: ICON_CHAR });
        }
        piece.nameLines.forEach((line, i) => left(page, G.code, rowY + codeLines.length * 12 + i * 10, line, G.nameSize));
        centered(page, G.cant, rowY, String(piece.quantity));
        if (doc.columns.adjusted) {
          // "Ajustadas" = "Finales" − 1 mm por lado con canto: s1 y s2 son lados L (achican A), s3 y s4 lados A.
          const onL = piece.edges.filter((e) => e === "s1" || e === "s2").length;
          const onA = piece.edges.filter((e) => e === "s3" || e === "s4").length;
          centered(page, G.adjL, rowY, `~${piece.finalL - onA} mm`);
          centered(page, G.adjA, rowY, `~${piece.finalA - onL} mm`);
        }
        centered(page, G.finL, rowY, `${piece.finalL} mm`);
        centered(page, G.finA, rowY, `${piece.finalA} mm`);
        if (doc.columns.edgeStrips && doc.edgeMaterial && doc.edgeColor) {
          for (const slot of piece.edges) {
            const cx = centers[SLOTS.indexOf(slot)];
            shapes.push({ page, kind: "dot", cx, cy: rowY + 5, r: 2.5, color: doc.edgeColor });
            edgeLines(doc.edgeMaterial).forEach((line, l) => centered(page, cx, rowY + 11 + l * 7, line, G.edgeSize));
          }
        }
        rowY += G.rowStep;
      }
      next += board.rowsPerPage[pageIndex];

      if (pageIndex === board.pages.length - 1) {
        left(page, 60, rowY, "La fibra sigue la longitud");
        left(page, 220, rowY, `${pieceCount} ${pieceCount === 1 ? "pieza" : "piezas"}`);
        left(page, 300, rowY, "Longitud de cortes");
        left(page, 400, rowY, `${decimal(board.cutLengthM)} m`);
        left(page, 455, rowY, "Eficiencia");
        left(page, 510, rowY, `${decimal(board.efficiencyPct)} %`);
      }
    });
  });

  return { doc, pageCount, texts, shapes, icons };
}

export const layouts = (): Layout[] => FUENTE.map(layoutDocument);
