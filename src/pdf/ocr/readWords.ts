// Palabras de un OCR → CutListPdf con el mismo parser que TextoPdf (docs/spec-extraccion-pdf.md §5, paso 3a).
// Pura. Solo cambia el origen: `reader = "ocr-llm"` y `hasTextLayer = false`, así el validador marca toda fila
// `dudosa` con `origen-ocr` (spec-esquema §7.3). No hay reconciliación ni LLM todavía (sesión 3).

import { parseCutListText } from "../parseText";
import type { PdfReading, PdfTextInput, PdfTextLayout } from "../types";

/**
 * Valores de agrupación para las palabras de un OCR (docs/spec-esquema-pdf.md §8.2, "Granularidad con OCR").
 * PROVISORIOS: se calibraron con la fuente de trazos del fixture sintético y la respuesta real de Cloud Vision (10/11);
 * hay que revalidarlos con una página real (P-04). En una fuente real el espacio entre palabras es más angosto: por eso
 * `glueGapRatio` solo pega signos sueltos.
 */
export const OCR_LAYOUT = { joinGapRatio: 1.5, glueGapRatio: 0.4, rowToleranceRatio: 0.3 } as const satisfies Required<PdfTextLayout>;

/** Palabras de un OCR → documento. El llamador puede reemplazar cualquier valor de `OCR_LAYOUT` con `input.layout`. */
export function parseOcrWords(input: PdfTextInput): PdfReading {
  const reading = parseCutListText({ ...input, layout: { ...OCR_LAYOUT, ...input.layout } });
  if (!reading.ok) return reading;
  return { ok: true, document: { ...reading.document, source: { ...reading.document.source, reader: "ocr-llm", hasTextLayer: false } } };
}
