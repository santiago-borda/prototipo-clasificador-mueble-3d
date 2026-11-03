// Arma elementos de texto sintéticos a partir de un CutListPdf, para probar el parser de TextoPdf (TP-50).
// La geometría imita la medida en los trazados de los PDF (docs/spec-esquema-pdf.md §8.2): hoja A4, encabezado
// de tabla en tres renglones, continuación sin encabezado de tabla, código en 2 renglones con un ícono, texto
// de canto en 3 renglones. Los textos son un supuesto: no hay ningún PDF de OpenCutList con capa de texto.

import type { Board, BoardPiece, CutListPdf, EdgeStrips, PdfTextElement, PdfTextInput } from "@/pdf/types";

export const PAGE_WIDTH = 595.32;
export const ICON = "";
const X = { no: 43, code: 63, cant: 151, adjL: 210, adjusted: 247, adjA: 284, finL: 340, finales: 365, finA: 390, tiras: 498 };
/** Centros de s1 a s4 con paso uniforme de 39 pt. */
export const UNIFORM_EDGES = [439.5, 478.5, 517.5, 556.5] as const;

export interface LayoutOptions {
  /** Parte los textos en palabras, como un OCR. */
  words?: boolean;
  /** Centros de s1 a s4, por hoja. Las columnas reales no son iguales (§8.2). */
  edgeCenters?: (boardIndex: number) => readonly number[];
  /** Centro del rótulo "Tiras de cantos", por hoja. */
  edgeLabelCenter?: (boardIndex: number) => number;
}

/** Cuántas filas de una hoja van en cada una de sus páginas. */
function chunks(board: Board): BoardPiece[][] {
  const perPage = Math.ceil(board.pieces.length / board.pages.length);
  return board.pages.map((_, i) => board.pieces.slice(i * perPage, (i + 1) * perPage));
}

function wrap(text: string, limit: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && line.length + 1 + word.length > limit) {
      lines.push(line);
      line = word;
    } else line = line === "" ? word : `${line} ${word}`;
  }
  if (line !== "") lines.push(line);
  return lines;
}

const decimal = (value: number) => String(value).replace(".", ",");

export function renderCutList(document: CutListPdf, options: LayoutOptions = {}): PdfTextInput {
  const elements: PdfTextElement[] = [];
  const left = (page: number, x: number, y: number, text: string, charWidth = 4, height = 7) =>
    elements.push({ page, x, y, width: text.length * charWidth, height, text });
  const centered = (page: number, x: number, y: number, text: string, charWidth = 4, height = 7) =>
    left(page, x - (text.length * charWidth) / 2, y, text, charWidth, height);

  // Resumen.
  const title = `${document.header.material} / ${document.header.thicknessMm} mm`;
  left(1, 40, 40, title);
  left(1, 300, 40, document.header.generatedAt);
  left(1, 40, 55, document.header.project, 3);
  left(1, 450, 55, "Milimetro");
  left(1, 40, 90, "Configuraciones");
  let y = 105;
  for (const [key, value] of Object.entries(document.summary.settings)) {
    left(1, 40, y, key);
    left(1, 200, y, value);
    y += 12;
  }
  y += 10;
  left(1, 40, y, "Estadísticas");
  y += 15;
  const stat = (label: string, value: string | null) => {
    if (value === null) return;
    left(1, 40, y, label);
    left(1, 200, y, value);
    y += 12;
  };
  const { fillRatePct, cutCount, cutLengthM } = document.summary;
  stat("Tasa de llenado", fillRatePct === null ? null : `${decimal(fillRatePct)} %`);
  stat("Número de cortes", cutCount === null ? null : String(cutCount));
  stat("Longitud de cortes", cutLengthM === null ? null : `${decimal(cutLengthM)} m`);
  y += 20;
  left(1, 40, y, "Tablero");
  const SUMMARY = { count: 220, length: 280, width: 340, area: 400, parts: 460 };
  centered(1, SUMMARY.count, y, "Cant.");
  centered(1, SUMMARY.length, y, "Longitud");
  centered(1, SUMMARY.width, y, "Anchura");
  centered(1, SUMMARY.area, y, "Σ Areas");
  centered(1, SUMMARY.parts, y, "Σ Partes");
  for (const row of document.summary.boards) {
    y += 14;
    left(1, 40, y, `${row.material} / ${row.thicknessMm} mm`);
    centered(1, SUMMARY.count, y, String(row.count));
    centered(1, SUMMARY.length, y, `${row.lengthMm} mm`);
    centered(1, SUMMARY.width, y, `${row.widthMm} mm`);
    if (row.areaM2 !== null) centered(1, SUMMARY.area, y, `${decimal(row.areaM2)} m²`);
    centered(1, SUMMARY.parts, y, String(row.parts));
  }

  // Hojas.
  document.boards.forEach((board, b) => {
    const edgeCenters = options.edgeCenters?.(b) ?? UNIFORM_EDGES;
    const pages = chunks(board);
    board.pages.forEach((page, pageIndex) => {
      left(page, 40, 40, `${board.index} / ${board.total}`);
      left(page, 120, 40, `${board.material} / ${board.thicknessMm} mm`);
      left(page, 280, 40, `${board.lengthMm} mm x ${board.widthMm} mm`);
      left(page, 440, 40, board.kind);

      let rowY = 70;
      if (pageIndex === 0) {
        if (board.diagram !== "pendiente") {
          let gridX = 60;
          let gridY = 80;
          for (const { letter, count } of board.diagram) {
            for (let i = 0; i < count; i += 1) {
              left(page, gridX, gridY, letter);
              // Una cota del diagrama: no es una letra y no se cuenta.
              left(page, gridX + 15, gridY, "123");
              gridX += 60;
              if (gridX > 520) {
                gridX = 60;
                gridY += 30;
              }
            }
          }
        }
        if (document.columns.adjusted) centered(page, X.adjusted, 452, "Ajustadas");
        centered(page, X.finales, 452, "Finales");
        if (document.columns.edgeStrips) centered(page, options.edgeLabelCenter?.(b) ?? X.tiras, 452, "Tiras de cantos");
        centered(page, X.no, 465, "No.");
        centered(page, 93, 465, "Designación");
        centered(page, X.cant, 465, "Cant.");
        if (document.columns.adjusted) {
          centered(page, X.adjL, 478, "L");
          centered(page, X.adjA, 478, "A");
        }
        centered(page, X.finL, 478, "L");
        centered(page, X.finA, 478, "A");
        if (document.columns.edgeStrips) for (const center of edgeCenters) centered(page, center, 478, ICON);
        rowY = 500;
      }

      for (const piece of pages[pageIndex]) {
        centered(page, X.no, rowY, piece.letter);
        const code = piece.code ?? "";
        left(page, X.code, rowY, code.slice(0, 8), 2.6);
        left(page, X.code + 45, rowY, ICON, 8);
        if (code.length > 8) left(page, X.code, rowY + 12, code.slice(8), 2.6);
        wrap(piece.name, 22).forEach((line, i) => left(page, X.code, rowY + 24 + i * 10, line, 2.6, 6));
        if (piece.quantity !== null) centered(page, X.cant, rowY, String(piece.quantity));
        if (document.columns.adjusted && piece.finalL !== null && piece.finalA !== null) {
          // "Ajustadas" está en el PDF y el parser la ignora (RP1).
          centered(page, X.adjL, rowY, `~${piece.finalL - 1} mm`);
          centered(page, X.adjA, rowY, `~${piece.finalA - 1} mm`);
        }
        if (piece.finalL !== null) centered(page, X.finL, rowY, `${piece.finalL} mm`);
        if (piece.finalA !== null) centered(page, X.finA, rowY, `${piece.finalA} mm`);
        if (piece.edges !== "columna-ausente") {
          (["s1", "s2", "s3", "s4"] as const satisfies readonly (keyof EdgeStrips)[]).forEach((key, i) => {
            const strip = piece.edges !== "columna-ausente" ? piece.edges[key] : null;
            if (strip === null) return;
            wrap(strip.label, 12).forEach((line, l) => centered(page, edgeCenters[i], rowY + 11 + l * 9, line, 2.2, 5.5));
          });
        }
        rowY += 60;
      }

      if (pageIndex === board.pages.length - 1) {
        left(page, 60, rowY, "La fibra sigue la longitud");
        left(page, 220, rowY, `${board.pieceCount} ${board.pieceCount === 1 ? "pieza" : "piezas"}`);
        if (board.cutLengthM !== null) {
          left(page, 300, rowY, "Longitud de cortes");
          left(page, 400, rowY, `${decimal(board.cutLengthM)} m`);
        }
        if (board.efficiencyPct !== null) {
          left(page, 460, rowY, "Eficiencia");
          left(page, 510, rowY, `${decimal(board.efficiencyPct)} %`);
        }
      }
    });
  });

  const pageNumbers = [...new Set(elements.map((e) => e.page))];
  return {
    fileName: document.source.fileName,
    pdfId: "sha256:prueba",
    producer: document.source.producer,
    readerVersion: "prueba/1",
    pageWidths: pageNumbers.map((page) => ({ page, width: PAGE_WIDTH })),
    elements: options.words ? elements.flatMap(splitWords) : elements,
  };
}

/** Un elemento por palabra, en la misma posición que tenían dentro de la frase. */
function splitWords(element: PdfTextElement): PdfTextElement[] {
  const words = element.text.split(" ");
  if (words.length === 1) return [element];
  const charWidth = element.width / element.text.length;
  let offset = 0;
  return words.map((word) => {
    const piece = { ...element, x: element.x + offset * charWidth, width: word.length * charWidth, text: word };
    offset += word.length + 1;
    return piece;
  });
}

/** Mismo contenido, sin `source`: el del fixture dice transcripción manual (TP-50). */
export function withoutSource(document: CutListPdf): Omit<CutListPdf, "source"> {
  const { source, ...rest } = document;
  void source;
  return rest;
}
