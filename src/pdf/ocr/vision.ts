// Respuesta de Cloud Vision `files:annotate` → PdfTextInput (docs/spec-extraccion-pdf.md §5, paso 3a).
// Función pura: no llama a la red ni lee archivos. El cliente que hace el pedido vive fuera de `src/` (TS-13).
//
// Forma de la respuesta tomada de la documentación de Vision (AnnotateFileResponse) y verificada el 10/11 con la
// salida real de TS-13 (docs/spec-fixture-sintetico.md §12). Con un PDF, cada página trae `width` y `height`
// en puntos (enteros: Vision los redondea) y las cajas en `normalizedVertices` (0 a 1, origen arriba a la izquierda).
// En JSON, un 0 puede venir omitido: se lee como 0.

import type { PdfTextElement, PdfTextInput } from "../types";

interface VisionVertex {
  x?: number;
  y?: number;
}

export interface VisionWord {
  boundingBox?: { normalizedVertices?: VisionVertex[] };
  symbols?: { text?: string }[];
}

export interface VisionPage {
  width?: number;
  height?: number;
  blocks?: { paragraphs?: { words?: VisionWord[] }[] }[];
}

export interface VisionPageResponse {
  fullTextAnnotation?: { pages?: VisionPage[]; text?: string };
  context?: { pageNumber?: number };
  error?: { code?: number; message?: string };
}

/** Una respuesta por pedido (un lote de páginas). */
export interface VisionFileResponse {
  responses?: VisionPageResponse[];
  totalPages?: number;
}

export interface VisionMeta {
  fileName: string;
  pdfId: string | null;
  producer: string | null;
  readerVersion: string;
  /** Páginas del PDF: tienen que venir todas, una sola vez. */
  pageCount: number;
}

export type VisionConversion =
  | { ok: true; input: PdfTextInput }
  | { ok: false; reason: "estructura-no-reconocida" | "lectura-fallida"; detail: string };

/**
 * Une las respuestas de todos los lotes, ordena por número de página y devuelve una palabra por elemento.
 * Nunca mezcla páginas: una página repetida, faltante o sin número es `estructura-no-reconocida`; una página con
 * error del proveedor es `lectura-fallida` (no hay resultado parcial).
 */
export function visionToTextInput(files: readonly VisionFileResponse[], meta: VisionMeta): VisionConversion {
  const byPage = new Map<number, VisionPageResponse>();
  for (const file of files) {
    for (const response of file.responses ?? []) {
      const page = response.context?.pageNumber;
      if (response.error && (response.error.code ?? 0) !== 0) {
        return { ok: false, reason: "lectura-fallida", detail: `Vision devolvió un error en la página ${page ?? "?"} (código ${response.error.code}).` };
      }
      if (page === undefined || !Number.isInteger(page) || page < 1) return { ok: false, reason: "estructura-no-reconocida", detail: "Una respuesta no dice su número de página." };
      if (byPage.has(page)) return { ok: false, reason: "estructura-no-reconocida", detail: `La página ${page} vino más de una vez.` };
      byPage.set(page, response);
    }
  }
  const missing = Array.from({ length: meta.pageCount }, (_, i) => i + 1).filter((page) => !byPage.has(page));
  if (missing.length > 0) return { ok: false, reason: "estructura-no-reconocida", detail: `Faltan páginas: ${missing.join(", ")}.` };
  const extra = [...byPage.keys()].filter((page) => page > meta.pageCount);
  if (extra.length > 0) return { ok: false, reason: "estructura-no-reconocida", detail: `Páginas de más: ${extra.join(", ")}.` };

  const elements: PdfTextElement[] = [];
  const pageWidths: { page: number; width: number }[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pages = byPage.get(page)?.fullTextAnnotation?.pages ?? [];
    if (pages.length === 0) {
      // Página sin texto reconocido: válida (por ejemplo, en blanco); no aporta elementos ni ancho.
      continue;
    }
    if (pages.length > 1) return { ok: false, reason: "estructura-no-reconocida", detail: `La página ${page} trae ${pages.length} páginas de texto.` };
    const { width, height, blocks } = pages[0];
    if (!width || !height || width <= 0 || height <= 0) return { ok: false, reason: "estructura-no-reconocida", detail: `La página ${page} no trae su tamaño.` };
    pageWidths.push({ page, width });
    for (const block of blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const element = wordElement(word, page, width, height);
          if (element) elements.push(element);
        }
      }
    }
  }
  return { ok: true, input: { fileName: meta.fileName, pdfId: meta.pdfId, producer: meta.producer, readerVersion: meta.readerVersion, pageWidths, elements } };
}

function wordElement(word: VisionWord, page: number, width: number, height: number): PdfTextElement | null {
  const text = (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("");
  const vertices = word.boundingBox?.normalizedVertices ?? [];
  if (text.trim() === "" || vertices.length === 0) return null;
  const xs = vertices.map((v) => (v.x ?? 0) * width);
  const ys = vertices.map((v) => (v.y ?? 0) * height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  if (w <= 0 || h <= 0) return null;
  return { page, x, y, width: w, height: h, text };
}
