// Esquema de la salida del PDF de OpenCutList (docs/spec-esquema-pdf.md §4 y §8).
// Solo tipos: los usan el validador y el parser, y más adelante los adaptadores de extracción.

export type PdfReader = "texto-pdf" | "ocr-llm" | "transcripcion-manual";

/** Documento leído de UN archivo PDF de OpenCutList (un material + espesor). */
export interface CutListPdf {
  schema: "cutlist-pdf/1";
  source: PdfSource;
  header: {
    /** Tal cual el título ("Blanco nature", "GAUDI"); NFC, sin normalizar mayúsculas. */
    material: string;
    thicknessMm: number;
    /** Texto tal cual ("09/10/2026 5:47pm"); no se interpreta la zona horaria. */
    generatedAt: string;
    /** El PDF dice "Milimetro"; otra unidad es el error `unidad-no-soportada`. */
    unit: "mm";
    project: string;
  };
  summary: {
    /** "Configuraciones" tal cual; informativo. */
    settings: Record<string, string>;
    fillRatePct: number | null;
    cutCount: number | null;
    cutLengthM: number | null;
    boards: SummaryBoardRow[];
  };
  columns: { adjusted: boolean; edgeStrips: boolean };
  /** Uno por hoja de tablero ("1 / 2", "2 / 2"); una hoja puede ocupar varias páginas (§2, INV-15). */
  boards: Board[];
  /** Todo lo no leído con certeza. */
  pending: PendingField[];
}

export interface PdfSource {
  fileName: string;
  /** "sha256:" + hash de los bytes del PDF; null solo en una transcripción sin archivo. */
  pdfId: string | null;
  reader: PdfReader;
  readerVersion: string;
  /** Metadato /Producer; null si el PDF no lo tiene. */
  producer: string | null;
  hasTextLayer: boolean;
}

export interface SummaryBoardRow {
  material: string;
  thicknessMm: number;
  count: number;
  lengthMm: number;
  widthMm: number;
  areaM2: number | null;
  parts: number;
}

export interface Board {
  /** 1..total, de "i / N" del encabezado de la hoja. */
  index: number;
  total: number;
  /** Páginas del PDF que ocupa la hoja (1-based; la 1 es el resumen), consecutivas; el pie está solo en la última. */
  pages: number[];
  material: string;
  thicknessMm: number;
  lengthMm: number;
  widthMm: number;
  kind: string;
  pieceCount: number;
  cutLengthM: number | null;
  /** "Eficiencia" del pie: no es la "Tasa de llenado" del resumen (INV-13). */
  efficiencyPct: number | null;
  /** Filas del listado de esa hoja, en el orden del PDF. */
  pieces: BoardPiece[];
  diagram: DiagramLetter[] | "pendiente";
}

export interface BoardPiece {
  letter: string;
  /** Designación: renglones del código unidos, tal cual (se normaliza en la validación). null = no legible. */
  code: string | null;
  name: string;
  /** "Cant." de ESTE tablero. null = no legible. */
  quantity: number | null;
  /** "Finales" L y A, en mm y en el orden del PDF: L no es "largo" (RP2, INV-7). null = no legible. */
  finalL: number | null;
  finalA: number | null;
  edges: EdgeStrips | "columna-ausente";
}

/** Las 4 subcolumnas de "Tiras de cantos", por posición (RP3). null = celda sin marca. */
export interface EdgeStrips {
  /** Inferior, lado L. */
  s1: EdgeStrip | null;
  /** Superior, lado L. */
  s2: EdgeStrip | null;
  /** Izquierdo, lado A. */
  s3: EdgeStrip | null;
  /** Derecho, lado A. */
  s4: EdgeStrip | null;
}

export interface EdgeStrip {
  /** Texto de la celda tal cual ("Canto <material> ~ 0 mm x 22 mm"). */
  label: string;
  material: string | null;
  widthMm: number | null;
  /** "~ 0 mm": el PDF redondea; NO se convierte a número (§11). */
  thicknessText: string | null;
}

export interface DiagramLetter {
  letter: string;
  count: number;
}

export interface PendingField {
  /** Ruta JSON del campo ("boards[0].pieces[3].finalA"). */
  path: string;
  reason: string;
}

// --- Entrada del parser de TextoPdf (§8.2) ---

/** Un trozo de texto de una página, con su caja. Lo produce la extracción; el parser no lee bytes. */
export interface PdfTextElement {
  /** 1-based; la 1 es el resumen. */
  page: number;
  /** Borde izquierdo. */
  x: number;
  /** Borde superior; y crece hacia abajo, con origen arriba a la izquierda de la página. */
  y: number;
  width: number;
  height: number;
  text: string;
}

/**
 * Cómo agrupar elementos en segmentos y filas (spec-esquema §8.2, "Granularidad con OCR"). Cada campo omitido toma el
 * valor de TextoPdf, así que sin `layout` el parser lee exactamente igual que antes. Las razones son proporciones del
 * alto de la caja, no puntos: no dependen de la unidad de la extracción.
 */
export interface PdfTextLayout {
  /** Hueco máximo, × el alto del más bajo de los dos elementos, para unirlos en un segmento con un espacio. Por defecto 1. */
  joinGapRatio?: number;
  /**
   * Hueco máximo (también negativo: cajas solapadas), × el alto del más bajo, para unirlos SIN espacio, siempre que
   * al menos uno de los dos no tenga letras ni dígitos (un signo suelto: ".", "~", "-"). Por defecto no se pega nada.
   */
  glueGapRatio?: number;
  /** Cuánto antes del borde superior de su letra "No." empieza una fila, × el alto de esa letra. Por defecto 0. */
  rowToleranceRatio?: number;
}

/** Lo que no sale de los elementos de texto va directo a `CutListPdf.source`. */
export interface PdfTextInput {
  fileName: string;
  pdfId: string | null;
  producer: string | null;
  readerVersion: string;
  /** Ancho de cada página, en las mismas unidades (solo para la constante de canto). */
  pageWidths: readonly { page: number; width: number }[];
  /** De todas las páginas, en cualquier orden. */
  elements: readonly PdfTextElement[];
  /** Parámetros de agrupación. Solo los pasa la lectura por OCR (`parseOcrWords`); TextoPdf usa los valores por defecto. */
  layout?: PdfTextLayout;
}

// --- Evidencia de OcrLlm (docs/spec-extraccion-pdf.md §4) ---

/** Lecturas crudas de cada fuente para un campo; la pantalla de revisión las muestra. No las lee el validador. */
export interface FieldEvidence {
  candidates: { ocr?: string; llm?: string; pixels?: string };
  agreement: "acuerdo" | "discrepancia" | "fuente-unica" | "ilegible";
  bbox?: { page: number; x: number; y: number; w: number; h: number };
}

/** Clave = ruta JSON del campo, igual que `PendingField.path`. */
export type Evidence = Record<string, FieldEvidence>;

/** `lectura-fallida`: fallaron todas las pasadas de un adaptador; no hay resultado parcial (spec-extraccion §7). */
export type PdfReadingFailure = "sin-capa-de-texto" | "estructura-no-reconocida" | "unidad-no-soportada" | "hoja-incompleta" | "lectura-fallida";

/** `evidence`: solo la devuelve OcrLlm (spec-esquema §8). */
export type PdfReading = { ok: true; document: CutListPdf; evidence?: Evidence } | { ok: false; reason: PdfReadingFailure; detail: string };
