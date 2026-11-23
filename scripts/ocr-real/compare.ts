// Comparación de la lectura con la transcripción manual (docs/spec-ocr-prueba-real.md §9, O-5 y OR-16). Pura.
// NO reemplaza al Eval Harness. Empareja tableros por `index` y piezas por posición, y solo si las filas coinciden:
// si las cantidades difieren, el resultado es "comparacion-desalineada" y no se empareja nada (aprobado el 10/11).
// El detalle lleva valores: va solo a `.ocr-data/real/` y nunca a la consola.

import type { Board, BoardPiece, CutListPdf, PdfReading } from "@/pdf/types";

export interface ComparisonCounts {
  iguales: number;
  pending: number;
  distintosSinPending: number;
}

export type FieldStatus = "igual" | "pending" | "distinto-sin-pending";

export interface FieldComparison {
  path: string;
  status: FieldStatus;
  reading: unknown;
  transcription: unknown;
}

export type Comparison =
  | { result: "comparado"; counts: ComparisonCounts; detail: FieldComparison[] }
  | { result: "comparacion-desalineada"; readingRows: number; transcriptionRows: number; readingBoards: number[]; transcriptionBoards: number[] }
  | { result: "lectura-rechazada" };

const rows = (document: CutListPdf): number => document.boards.reduce((sum, board) => sum + board.pieces.length, 0);
const byIndex = (document: CutListPdf): Map<number, Board> => new Map(document.boards.map((board) => [board.index, board]));

/** Un pending cubre un campo si su ruta es la del campo o una que lo contiene. */
const covered = (pending: readonly { path: string }[], field: string): boolean => pending.some(({ path }) => field === path || field.startsWith(`${path}.`) || field.startsWith(`${path}[`));

type Strips = Exclude<BoardPiece["edges"], "columna-ausente">;
const STRIPS = ["s1", "s2", "s3", "s4"] as const;
/** Presencia de marca y material en un solo valor: null = sin marca. */
const stripValue = (strips: Strips, key: (typeof STRIPS)[number]): string | null => {
  const strip = strips[key];
  return strip === null ? null : (strip.material ?? "<sin material>");
};

export function compareReading(reading: PdfReading, transcription: CutListPdf): Comparison {
  if (!reading.ok) return { result: "lectura-rechazada" };
  const document = reading.document;
  const readingBoards = byIndex(document);
  const truthBoards = byIndex(transcription);
  const aligned =
    document.boards.length === transcription.boards.length &&
    readingBoards.size === truthBoards.size &&
    [...truthBoards].every(([index, board]) => readingBoards.get(index)?.pieces.length === board.pieces.length);
  if (!aligned) {
    return {
      result: "comparacion-desalineada",
      readingRows: rows(document),
      transcriptionRows: rows(transcription),
      readingBoards: document.boards.map((board) => board.pieces.length),
      transcriptionBoards: transcription.boards.map((board) => board.pieces.length),
    };
  }

  const detail: FieldComparison[] = [];
  const add = (path: string, readValue: unknown, truthValue: unknown) => {
    const status: FieldStatus = covered(document.pending, path) ? "pending" : Object.is(readValue, truthValue) ? "igual" : "distinto-sin-pending";
    detail.push({ path, status, reading: readValue, transcription: truthValue });
  };

  document.boards.forEach((board, boardPosition) => {
    const truthBoard = truthBoards.get(board.index) as Board;
    board.pieces.forEach((piece, i) => {
      const truth = truthBoard.pieces[i];
      const base = `boards[${boardPosition}].pieces[${i}]`;
      add(`${base}.code`, piece.code, truth.code);
      add(`${base}.name`, piece.name, truth.name);
      add(`${base}.quantity`, piece.quantity, truth.quantity);
      add(`${base}.finalL`, piece.finalL, truth.finalL);
      add(`${base}.finalA`, piece.finalA, truth.finalA);
      if (piece.edges === "columna-ausente" || truth.edges === "columna-ausente") {
        add(`${base}.edges`, piece.edges === "columna-ausente" ? piece.edges : "columna-presente", truth.edges === "columna-ausente" ? truth.edges : "columna-presente");
      } else {
        for (const key of STRIPS) add(`${base}.edges.${key}`, stripValue(piece.edges, key), stripValue(truth.edges, key));
      }
    });
  });
  const count = (status: FieldStatus) => detail.filter((field) => field.status === status).length;
  return { result: "comparado", counts: { iguales: count("igual"), pending: count("pending"), distintosSinPending: count("distinto-sin-pending") }, detail };
}

/** Control mínimo (§9): esquema reconocible y `reader = "transcripcion-manual"`. No corre las invariantes. */
export function isTranscription(value: unknown): value is CutListPdf {
  if (typeof value !== "object" || value === null) return false;
  const { schema, source, boards, pending } = value as Partial<CutListPdf>;
  if (schema !== "cutlist-pdf/1" || typeof source !== "object" || source === null || source.reader !== "transcripcion-manual") return false;
  if (!Array.isArray(pending) || !Array.isArray(boards)) return false;
  return boards.every((board) => typeof board === "object" && board !== null && typeof board.index === "number" && Array.isArray(board.pieces));
}
