// Las otras dos salidas del layout (docs/spec-fixture-sintetico.md §3): los elementos de texto ideales, como los
// daría una capa de texto, y la respuesta simulada de Vision `files:annotate`, con la forma de su documentación.

import { createHash } from "node:crypto";
import type { PdfTextElement, PdfTextInput } from "@/pdf/types";
import type { VisionFileResponse, VisionPageResponse, VisionWord } from "@/pdf/ocr/vision";
import { ADVANCE, layoutDocument, textWidth, type Layout, type TextItem } from "./layout";
import { writePdf } from "./pdf";
import { FUENTE, PAGE, PRODUCER, type FuenteDocumento } from "../../fixtures/pdf-sintetico/fuente";

const toElement = (item: TextItem): PdfTextElement => ({ page: item.page, x: item.x, y: item.y, width: textWidth(item.text, item.size), height: item.size, text: item.text });

/** Una palabra por elemento, en la posición que ocupa dentro de su texto (letra monoespaciada). */
export function words(item: TextItem): PdfTextElement[] {
  const out: PdfTextElement[] = [];
  let offset = 0;
  for (const word of item.text.split(" ")) {
    if (word !== "") out.push({ page: item.page, x: item.x + offset * ADVANCE * item.size, y: item.y, width: textWidth(word, item.size), height: item.size, text: word });
    offset += word.length + 1;
  }
  return out;
}

export interface SyntheticDocument {
  doc: FuenteDocumento;
  layout: Layout;
  pdf: Uint8Array;
  pdfId: string;
}

export function buildSynthetic(doc: FuenteDocumento): SyntheticDocument {
  const layout = layoutDocument(doc);
  const pdf = writePdf(layout);
  return { doc, layout, pdf, pdfId: `sha256:${createHash("sha256").update(pdf).digest("hex")}` };
}

export const buildAll = (): SyntheticDocument[] => FUENTE.map(buildSynthetic);

const pageWidths = (layout: Layout) => Array.from({ length: layout.pageCount }, (_, i) => ({ page: i + 1, width: PAGE.width }));

/** Elementos ideales: un elemento por texto, más los íconos de la designación como carácter de uso privado. */
export function idealInput(synthetic: SyntheticDocument): PdfTextInput {
  return {
    fileName: synthetic.doc.fileName,
    pdfId: synthetic.pdfId,
    producer: PRODUCER,
    readerVersion: "ideal/1",
    pageWidths: pageWidths(synthetic.layout),
    elements: [...synthetic.layout.texts, ...synthetic.layout.icons].map(toElement),
  };
}

/** Lo que un OCR perfecto devolvería: palabras sueltas y sin íconos (son dibujos, no texto). */
export function idealWords(synthetic: SyntheticDocument): PdfTextElement[] {
  return synthetic.layout.texts.flatMap(words);
}

function visionWord(element: PdfTextElement): VisionWord {
  const x0 = element.x / PAGE.width;
  const x1 = (element.x + element.width) / PAGE.width;
  const y0 = element.y / PAGE.height;
  const y1 = (element.y + element.height) / PAGE.height;
  return {
    boundingBox: { normalizedVertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] },
    symbols: [...element.text].map((text) => ({ text })),
  };
}

export function visionPage(elements: readonly PdfTextElement[], page: number): VisionPageResponse {
  const own = elements.filter((element) => element.page === page);
  return {
    fullTextAnnotation: {
      pages: [{ width: PAGE.width, height: PAGE.height, blocks: own.map((element) => ({ paragraphs: [{ words: [visionWord(element)] }] })) }],
      text: own.map((element) => element.text).join(" "),
    },
    context: { pageNumber: page },
  };
}

/** Respuesta simulada de Vision para unos lotes de páginas: una AnnotateFileResponse por lote. */
export function visionResponses(synthetic: SyntheticDocument, batches: readonly (readonly number[])[], elements = idealWords(synthetic)): VisionFileResponse[] {
  return batches.map((batch) => ({ responses: batch.map((page) => visionPage(elements, page)), totalPages: synthetic.layout.pageCount }));
}
