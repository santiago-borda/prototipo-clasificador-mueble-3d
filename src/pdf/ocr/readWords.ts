// Palabras de un OCR → CutListPdf con el mismo parser que TextoPdf (docs/spec-extraccion-pdf.md §5, paso 3a).
// Pura. Solo cambia el origen: `reader = "ocr-llm"` y `hasTextLayer = false`, así el validador marca toda fila
// `dudosa` con `origen-ocr` (spec-esquema §7.3). No hay reconciliación ni LLM todavía (sesión 3).

import { parseCutListText } from "../parseText";
import type { PdfReading, PdfTextInput } from "../types";

export function parseOcrWords(input: PdfTextInput): PdfReading {
  const reading = parseCutListText(input);
  if (!reading.ok) return reading;
  return { ok: true, document: { ...reading.document, source: { ...reading.document.source, reader: "ocr-llm", hasTextLayer: false } } };
}
