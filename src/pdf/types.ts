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
}

export type PdfReadingFailure = "sin-capa-de-texto" | "estructura-no-reconocida" | "unidad-no-soportada" | "hoja-incompleta";

export type PdfReading = { ok: true; document: CutListPdf } | { ok: false; reason: PdfReadingFailure; detail: string };
