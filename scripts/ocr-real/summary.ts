// Salida de consola de `ocr:real` (docs/spec-ocr-prueba-real.md §7): SOLO texto fijo y números.
// Nunca el nombre del archivo, el hash, el texto reconocido, el `detail` del parser ni mensajes del proveedor.

import type { PdfReading } from "@/pdf/types";
import type { Comparison } from "./compare";
import { classifyPending } from "./pending";

export type Rejection =
  | "sin-credenciales"
  | "lista-blanca-ausente"
  | "lista-blanca-vacia"
  | "lista-blanca-invalida"
  | "lista-blanca-multiple"
  | "entrada-invalida"
  | "compuerta"
  | "proveedor-error"
  | "paginas-excedidas"
  | "paginas-no-confirmadas"
  | "conversion-fallida"
  | "transcripcion-invalida"
  | "error-interno";

export const rejectionLine = (reason: Rejection): string => `rechazado: ${reason}`;

export interface SummaryInput {
  pages: number;
  words: number;
  reading: PdfReading;
  comparison: Comparison | null;
}

export function formatSummary({ pages, words, reading, comparison }: SummaryInput): string[] {
  const pending = classifyPending(reading.ok ? reading.document.pending.map((field) => field.path) : []);
  const rows = reading.ok ? reading.document.boards.reduce((sum, board) => sum + board.pieces.length, 0) : 0;
  const lines = [
    `páginas leídas: ${pages}`,
    `palabras: ${words}`,
    `lectura: ${reading.ok ? "leído" : `rechazado (${reading.reason})`}`,
    `filas: ${rows}`,
    `pending: code=${pending.code} name=${pending.name} finalL=${pending.finalL} finalA=${pending.finalA} quantity=${pending.quantity} cantos=${pending.cantos} otros=${pending.otros}`,
    `hoja-incompleta: ${!reading.ok && reading.reason === "hoja-incompleta" ? "sí" : "no"}`,
  ];
  if (comparison) {
    if (comparison.result === "comparado") {
      const { iguales, pending: p, distintosSinPending } = comparison.counts;
      lines.push(`comparación: iguales=${iguales} pending=${p} distintos-sin-pending=${distintosSinPending}`);
    } else if (comparison.result === "comparacion-desalineada") {
      lines.push(`comparación: comparacion-desalineada (filas ocr=${comparison.readingRows}, transcripción=${comparison.transcriptionRows})`);
    } else {
      lines.push("comparación: lectura-rechazada");
    }
  }
  lines.push("salidas: .ocr-data/real/");
  return lines;
}
