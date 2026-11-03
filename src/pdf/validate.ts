// Validador del esquema del PDF de OpenCutList (docs/spec-esquema-pdf.md §5 y §7).
// Función pura, escrito a mano y sin dependencias, como src/importer/listing.ts.
//
// La validación es la misma para cualquier lector (§8.1). No corrige nada: produce razones del catálogo
// y el nivel de cada fila, o rechaza el documento si el problema es estructural.
// El cruce con el .dae (§7.2) y la conversión al listado (§6) no están acá: sesión 2b.

import { normalizeCode, type NormalizedCode } from "./code";
import type { PdfReason } from "./reasons";
import type { Board, BoardPiece, CutListPdf, EdgeStrips } from "./types";

export type RowLevel = "segura" | "dudosa";

/** A qué filas alcanza una razón (§5). */
export type FindingScope = { kind: "fila"; board: number; piece: number } | { kind: "tablero"; board: number } | { kind: "documento" };

export interface Finding {
  reason: PdfReason;
  /** Ruta JSON del dato, con la forma de `PendingField.path`. */
  path: string;
  detail: string;
  scope: FindingScope;
}

export interface RowResult {
  board: number;
  piece: number;
  letter: string;
  /** Código normalizado; null si es ausente o de formato inválido (no entra al listado). */
  code: string | null;
  level: RowLevel;
  reasons: PdfReason[];
}

export interface RejectedDocument {
  status: "rechazado";
  findings: Finding[];
}

export interface ValidatedDocument {
  status: "validado";
  document: CutListPdf;
  findings: Finding[];
  rows: RowResult[];
}

export type DocumentValidation = RejectedDocument | ValidatedDocument;

// --- INV-0: forma ---

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

interface ShapeIssue {
  reason: "esquema-invalido" | "unidad-no-soportada";
  path: string;
  detail: string;
}

/** Comprueba la forma completa y junta todos los problemas. Nunca lanza. */
function shapeIssues(input: unknown): ShapeIssue[] {
  const issues: ShapeIssue[] = [];
  const fail = (path: string, detail: string) => issues.push({ reason: "esquema-invalido", path, detail });

  if (!isRecord(input)) {
    fail("", "El documento no es un objeto.");
    return issues;
  }

  const pendingPaths: string[] = [];
  if (Array.isArray(input.pending)) {
    input.pending.forEach((entry: unknown, i) => {
      if (isRecord(entry) && typeof entry.path === "string" && typeof entry.reason === "string") pendingPaths.push(entry.path);
      else fail(`pending[${i}]`, "Se esperaba { path, reason }.");
    });
  } else fail("pending", "Falta la lista de campos pendientes.");
  const isPending = (path: string) => pendingPaths.some((p) => p === path || path.startsWith(`${p}.`));

  const string = (owner: Record<string, unknown>, key: string, path: string, { nonEmpty = false } = {}) => {
    const value = owner[key];
    if (typeof value !== "string") fail(`${path}${key}`, "Se esperaba un texto.");
    else if (nonEmpty && value.trim() === "") fail(`${path}${key}`, "El texto está vacío.");
  };
  const boolean = (owner: Record<string, unknown>, key: string, path: string) => {
    if (typeof owner[key] !== "boolean") fail(`${path}${key}`, "Se esperaba verdadero o falso.");
  };
  const number = (owner: Record<string, unknown>, key: string, path: string, kind: "positivo" | "entero" | "finito") => {
    const value = owner[key];
    const valid =
      typeof value === "number" && Number.isFinite(value) && (kind === "finito" || value > 0) && (kind !== "entero" || Number.isInteger(value));
    if (!valid) fail(`${path}${key}`, `Se esperaba un número ${kind}${kind === "finito" ? "" : " mayor que cero"}.`);
  };
  /** Un `null` solo vale con su entrada en `pending` (§4). */
  const nullable = (owner: Record<string, unknown>, key: string, path: string, check: () => void) => {
    if (owner[key] !== null) check();
    else if (!isPending(`${path}${key}`)) fail(`${path}${key}`, "Hay un null sin su entrada en pending.");
  };
  const section = (owner: Record<string, unknown>, key: string, path: string): Record<string, unknown> | null => {
    const value = owner[key];
    if (isRecord(value)) return value;
    fail(`${path}${key}`, "Falta la sección.");
    return null;
  };
  const list = (owner: Record<string, unknown>, key: string, path: string): unknown[] => {
    const value = owner[key];
    if (Array.isArray(value)) return value;
    fail(`${path}${key}`, "Se esperaba una lista.");
    return [];
  };

  if (input.schema !== "cutlist-pdf/1") fail("schema", 'Se esperaba "cutlist-pdf/1".');

  const source = section(input, "source", "");
  if (source) {
    string(source, "fileName", "source.");
    string(source, "readerVersion", "source.", { nonEmpty: true });
    boolean(source, "hasTextLayer", "source.");
    if (!["texto-pdf", "ocr-llm", "transcripcion-manual"].includes(String(source.reader))) fail("source.reader", "Lector desconocido.");
    if (source.producer !== null) string(source, "producer", "source.");
    // Excepción de §4: pdfId null solo en una transcripción sin archivo.
    if (source.pdfId === null) {
      if (source.reader !== "transcripcion-manual") fail("source.pdfId", "pdfId null solo vale con transcripcion-manual.");
    } else if (typeof source.pdfId !== "string" || !source.pdfId.startsWith("sha256:")) fail("source.pdfId", 'Se esperaba "sha256:..." o null.');
  }

  const header = section(input, "header", "");
  if (header) {
    string(header, "material", "header.", { nonEmpty: true });
    number(header, "thicknessMm", "header.", "positivo");
    string(header, "generatedAt", "header.");
    string(header, "project", "header.");
    if (typeof header.unit !== "string") fail("header.unit", "Falta la unidad.");
    else if (header.unit !== "mm") issues.push({ reason: "unidad-no-soportada", path: "header.unit", detail: `Unidad "${header.unit}": solo se admite mm.` });
  }

  const summary = section(input, "summary", "");
  if (summary) {
    const settings = section(summary, "settings", "summary.");
    if (settings) for (const key of Object.keys(settings)) string(settings, key, "summary.settings.");
    nullable(summary, "fillRatePct", "summary.", () => number(summary, "fillRatePct", "summary.", "finito"));
    nullable(summary, "cutCount", "summary.", () => number(summary, "cutCount", "summary.", "entero"));
    nullable(summary, "cutLengthM", "summary.", () => number(summary, "cutLengthM", "summary.", "positivo"));
    list(summary, "boards", "summary.").forEach((row: unknown, i) => {
      const path = `summary.boards[${i}].`;
      if (!isRecord(row)) return fail(path, "Se esperaba un objeto.");
      string(row, "material", path, { nonEmpty: true });
      number(row, "thicknessMm", path, "positivo");
      number(row, "count", path, "entero");
      number(row, "lengthMm", path, "positivo");
      number(row, "widthMm", path, "positivo");
      number(row, "parts", path, "entero");
      nullable(row, "areaM2", path, () => number(row, "areaM2", path, "positivo"));
    });
  }

  const columns = section(input, "columns", "");
  if (columns) {
    boolean(columns, "adjusted", "columns.");
    boolean(columns, "edgeStrips", "columns.");
  }

  const stripShape = (strip: Record<string, unknown>, path: string) => {
    string(strip, "label", path);
    nullable(strip, "material", path, () => string(strip, "material", path));
    nullable(strip, "widthMm", path, () => number(strip, "widthMm", path, "positivo"));
    nullable(strip, "thicknessText", path, () => string(strip, "thicknessText", path));
  };

  list(input, "boards", "").forEach((board: unknown, b) => {
    const path = `boards[${b}].`;
    if (!isRecord(board)) return fail(path, "Se esperaba un objeto.");
    number(board, "index", path, "entero");
    number(board, "total", path, "entero");
    if (typeof board.index === "number" && typeof board.total === "number" && board.index > board.total) fail(`${path}index`, "La hoja i / N tiene i mayor que N.");
    const pages = list(board, "pages", path);
    if (pages.length === 0 || !pages.every((p) => typeof p === "number" && Number.isInteger(p) && p > 0)) fail(`${path}pages`, "Se esperaban páginas enteras.");
    string(board, "material", path, { nonEmpty: true });
    number(board, "thicknessMm", path, "positivo");
    number(board, "lengthMm", path, "positivo");
    number(board, "widthMm", path, "positivo");
    string(board, "kind", path);
    number(board, "pieceCount", path, "entero");
    nullable(board, "cutLengthM", path, () => number(board, "cutLengthM", path, "positivo"));
    nullable(board, "efficiencyPct", path, () => number(board, "efficiencyPct", path, "finito"));

    if (board.diagram === "pendiente") {
      if (!isPending(`${path}diagram`)) fail(`${path}diagram`, 'diagram "pendiente" sin su entrada en pending.');
    } else {
      list(board, "diagram", path).forEach((entry: unknown, i) => {
        const entryPath = `${path}diagram[${i}].`;
        if (!isRecord(entry)) return fail(entryPath, "Se esperaba un objeto.");
        string(entry, "letter", entryPath, { nonEmpty: true });
        number(entry, "count", entryPath, "entero");
      });
    }

    list(board, "pieces", path).forEach((piece: unknown, p) => {
      const piecePath = `${path}pieces[${p}].`;
      if (!isRecord(piece)) return fail(piecePath, "Se esperaba un objeto.");
      string(piece, "letter", piecePath, { nonEmpty: true });
      string(piece, "name", piecePath);
      nullable(piece, "code", piecePath, () => string(piece, "code", piecePath));
      nullable(piece, "quantity", piecePath, () => number(piece, "quantity", piecePath, "entero"));
      nullable(piece, "finalL", piecePath, () => number(piece, "finalL", piecePath, "positivo"));
      nullable(piece, "finalA", piecePath, () => number(piece, "finalA", piecePath, "positivo"));
      if (piece.edges === "columna-ausente") return;
      const edges = section(piece, "edges", piecePath);
      if (!edges) return;
      for (const key of ["s1", "s2", "s3", "s4"]) {
        const strip = edges[key];
        // Excepción de §4: null en una subcolumna es "celda sin marca", no "no leído".
        if (strip === null) continue;
        if (isRecord(strip)) stripShape(strip, `${piecePath}edges.${key}.`);
        else fail(`${piecePath}edges.${key}`, "Se esperaba una marca o null.");
      }
    });
  });

  return issues;
}

/** INV-0: el valor cumple la forma de `CutListPdf`. */
export function isCutListPdf(input: unknown): input is CutListPdf {
  return shapeIssues(input).length === 0;
}

// --- INV-15 (a): páginas ---

function pageIssues(document: CutListPdf): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<number>();
  document.boards.forEach((board, b) => {
    const path = `boards[${b}].pages`;
    const fail = (detail: string) => findings.push({ reason: "hoja-incompleta", path, detail, scope: { kind: "documento" } });
    if (board.pages.includes(1)) fail("La página 1 es el resumen: no puede ser parte de una hoja.");
    if (board.pages.some((page, i) => i > 0 && page !== board.pages[i - 1] + 1)) fail(`Páginas no consecutivas: ${board.pages.join(", ")}.`);
    for (const page of board.pages) {
      if (seen.has(page)) fail(`La página ${page} aparece en más de una hoja.`);
      seen.add(page);
    }
  });
  return findings;
}

// --- Invariantes de un documento ---

const PIECE_PATH = /^boards\[(\d+)\]\.pieces\[(\d+)\]/;
const sameText = (a: string, b: string) => a.normalize("NFC") === b.normalize("NFC");
/** Clave de comparación: el código normalizado o, si el formato es inválido, el texto tal cual. */
const codeKey = (piece: BoardPiece, normalized: NormalizedCode) => normalized.code ?? (normalized.state === "invalido" ? piece.code : null);

function documentFindings(document: CutListPdf): Finding[] {
  const findings: Finding[] = [];
  const add = (reason: PdfReason, path: string, detail: string, scope: FindingScope) => findings.push({ reason, path, detail, scope });
  const addRow = (reason: PdfReason, board: number, piece: number, field: string, detail: string) =>
    add(reason, `boards[${board}].pieces[${piece}]${field}`, detail, { kind: "fila", board, piece });

  // Filas con un campo pendiente (§4). Un pendiente fuera de una fila no cambia ningún nivel.
  for (const entry of document.pending) {
    const match = PIECE_PATH.exec(entry.path);
    if (match) add("campo-pendiente", entry.path, entry.reason, { kind: "fila", board: Number(match[1]), piece: Number(match[2]) });
  }

  // INV-2: suma entre tableros, por fila del resumen.
  for (const row of document.summary.boards) {
    const sheets = document.boards.filter((b) => sameText(b.material, row.material) && b.thicknessMm === row.thicknessMm);
    const parts = sheets.reduce((sum, b) => sum + b.pieceCount, 0);
    const where = `${row.material} / ${row.thicknessMm} mm`;
    if (parts !== row.parts) add("suma-resumen-no-coincide", "summary.boards", `${where}: las hojas suman ${parts} piezas y el resumen dice ${row.parts}.`, { kind: "documento" });
    if (sheets.length !== row.count) add("suma-resumen-no-coincide", "summary.boards", `${where}: hay ${sheets.length} hojas y el resumen dice ${row.count}.`, { kind: "documento" });
  }

  // INV-13: la tasa de llenado y la eficiencia son cifras distintas y no se relacionan entre sí.
  const validPct = (value: number) => value >= 0 && value <= 100;
  if (document.summary.fillRatePct !== null && !validPct(document.summary.fillRatePct)) {
    add("porcentaje-invalido", "summary.fillRatePct", `${document.summary.fillRatePct} está fuera de 0 a 100.`, { kind: "documento" });
  }

  document.boards.forEach((board, b) => boardFindings(board, b, document, add, addRow));

  // INV-6: dentro del PDF, una letra es siempre el mismo código y viceversa. No confirmado por Casa Mueble.
  const rows = document.boards.flatMap((board, b) => board.pieces.map((piece, p) => ({ b, p, letter: piece.letter, key: codeKey(piece, normalizeCode(piece.code)) })));
  const known = rows.filter((row) => row.key !== null);
  for (const row of known) {
    const conflict = known.some((other) => (other.letter === row.letter) !== (other.key === row.key));
    if (conflict) addRow("letra-inconsistente", row.b, row.p, ".letter", `La letra ${row.letter} y el código ${row.key} no se corresponden en todo el documento.`);
  }

  // Origen: una fila de OCR es dudosa siempre (§7.3, RP8).
  if (document.source.reader === "ocr-llm") add("origen-ocr", "source.reader", "Leída por OCR/LLM: requiere confirmación humana.", { kind: "documento" });

  return findings;
}

function boardFindings(
  board: Board,
  b: number,
  document: CutListPdf,
  add: (reason: PdfReason, path: string, detail: string, scope: FindingScope) => void,
  addRow: (reason: PdfReason, board: number, piece: number, field: string, detail: string) => void,
): void {
  const path = `boards[${b}]`;
  const scope: FindingScope = { kind: "tablero", board: b };

  if (board.efficiencyPct !== null && (board.efficiencyPct < 0 || board.efficiencyPct > 100)) {
    add("porcentaje-invalido", `${path}.efficiencyPct`, `${board.efficiencyPct} está fuera de 0 a 100.`, scope);
  }

  // INV-1. Con una cantidad ilegible no se puede sumar: esa fila ya es dudosa por campo-pendiente.
  if (board.pieces.every((piece) => piece.quantity !== null)) {
    const sum = board.pieces.reduce((total, piece) => total + (piece.quantity ?? 0), 0);
    if (sum !== board.pieceCount) add("suma-tablero-no-coincide", `${path}.pieceCount`, `Las filas suman ${sum} y el pie dice ${board.pieceCount}.`, scope);
  }

  // INV-3.
  if (board.diagram !== "pendiente") {
    const counts = new Map<string, number>();
    for (const entry of board.diagram) counts.set(entry.letter, (counts.get(entry.letter) ?? 0) + entry.count);
    const lettersInRows = new Set(board.pieces.map((piece) => piece.letter));
    for (const letter of counts.keys()) {
      if (!lettersInRows.has(letter)) add("diagrama-no-coincide", `${path}.diagram`, `La letra ${letter} está en el diagrama y no tiene fila.`, scope);
    }
    board.pieces.forEach((piece, p) => {
      const count = counts.get(piece.letter);
      if (count === undefined) addRow("diagrama-no-coincide", b, p, ".letter", `La fila ${piece.letter} no aparece en el diagrama.`);
      else if (piece.quantity !== null && count !== piece.quantity) {
        addRow("diagrama-no-coincide", b, p, ".quantity", `La letra ${piece.letter} aparece ${count} veces en el diagrama y la fila dice ${piece.quantity}.`);
      }
    });
  }

  // INV-4 e INV-5: se marcan todas las filas repetidas.
  const repeated = (keys: (string | null)[]) => keys.map((key, i) => key !== null && keys.some((other, j) => j !== i && other === key));
  const normalized = board.pieces.map((piece) => normalizeCode(piece.code));
  const duplicateCodes = repeated(board.pieces.map((piece, p) => codeKey(piece, normalized[p])));
  const duplicateLetters = repeated(board.pieces.map((piece) => piece.letter));

  board.pieces.forEach((piece, p) => {
    if (duplicateCodes[p]) addRow("codigo-duplicado-en-tablero", b, p, ".code", `El código ${piece.code} se repite en esta hoja.`);
    if (duplicateLetters[p]) addRow("letra-duplicada-en-tablero", b, p, ".letter", `La letra ${piece.letter} se repite en esta hoja.`);

    // §7.1.
    const state = normalized[p].state;
    if (state === "ausente") addRow("codigo-ausente", b, p, ".code", "La fila no tiene código legible.");
    if (state === "anomalo") addRow("nombre-anomalo", b, p, ".code", `"${piece.code}" tiene guiones bajos de más.`);
    if (state === "invalido") addRow("formato-invalido", b, p, ".code", `"${piece.code}" no tiene el formato de un código.`);

    // INV-8: se compara sin nombrar largo ni corto (INV-7).
    if (piece.finalL !== null && piece.finalA !== null) {
      const fits =
        Math.max(piece.finalL, piece.finalA) <= Math.max(board.lengthMm, board.widthMm) &&
        Math.min(piece.finalL, piece.finalA) <= Math.min(board.lengthMm, board.widthMm);
      if (!fits) addRow("pieza-mayor-que-tablero", b, p, "", `${piece.finalL} x ${piece.finalA} no entra en ${board.lengthMm} x ${board.widthMm}.`);
    }

    // INV-9.
    const absent = piece.edges === "columna-ausente";
    if (absent === document.columns.edgeStrips) {
      addRow("cantos-inconsistentes", b, p, ".edges", document.columns.edgeStrips ? "La columna existe y la fila dice que no." : "La columna no existe y la fila trae subcolumnas.");
    }
  });
}

/** Une las razones con las filas: cada razón alcanza a su fila, a su tablero o a todo el documento (§5). */
function buildRows(document: CutListPdf, findings: readonly Finding[]): RowResult[] {
  return document.boards.flatMap((board, b) =>
    board.pieces.map((piece, p) => {
      const reasons = findings
        .filter(({ scope }) => {
          if (scope.kind === "documento") return true;
          if (scope.kind === "tablero") return scope.board === b;
          return scope.board === b && scope.piece === p;
        })
        .map((finding) => finding.reason);
      const unique = [...new Set(reasons)];
      return {
        board: b,
        piece: p,
        letter: piece.letter,
        code: normalizeCode(piece.code).code,
        level: unique.length === 0 ? ("segura" as const) : ("dudosa" as const),
        reasons: unique,
      };
    }),
  );
}

/** Valida un documento (INV-0 a INV-9, INV-13, INV-15 (a) y §7.1). Lo que venga, de cualquier lector. */
export function validateCutListPdf(input: unknown): DocumentValidation {
  const issues = shapeIssues(input);
  if (issues.length > 0 || !isCutListPdf(input)) {
    return { status: "rechazado", findings: issues.map((issue) => ({ ...issue, scope: { kind: "documento" } })) };
  }
  const pages = pageIssues(input);
  if (pages.length > 0) return { status: "rechazado", findings: pages };
  const findings = documentFindings(input);
  return { status: "validado", document: input, findings, rows: buildRows(input, findings) };
}

// --- Invariantes entre los PDF de un mueble: INV-10, INV-11, INV-12 e INV-14 ---

export interface FurnitureFinding {
  reason: PdfReason;
  code: string;
  detail: string;
  /** Filas afectadas: índice de documento, de hoja y de fila. */
  rows: { document: number; board: number; piece: number }[];
}

export interface CodeTotal {
  code: string;
  /** Σ cantidades en todas las hojas de todos los PDF (INV-12). null si alguna cantidad es ilegible. */
  total: number | null;
}

/** INV-14. `borrador`: hay filas dudosas, requiere revisión. `bloqueado`: hay un rechazo y no hay conversión. */
export type ListingStatus = "bloqueado" | "borrador" | "publicable";

export interface FurnitureValidation {
  documents: DocumentValidation[];
  findings: FurnitureFinding[];
  /** Por código normalizado, en orden binario. Las filas sin código válido no entran. */
  totals: CodeTotal[];
  status: ListingStatus;
}

const edgesKey = (edges: EdgeStrips | "columna-ausente") => {
  if (edges === "columna-ausente") return edges;
  return JSON.stringify(
    (["s1", "s2", "s3", "s4"] as const).map((key) => {
      const strip = edges[key];
      return strip && [strip.label.normalize("NFC"), strip.material?.normalize("NFC") ?? null, strip.widthMm, strip.thicknessText];
    }),
  );
};

/** Valida los PDF de un mismo mueble. Un código solo se compara dentro del mueble (motor §1). */
export function validateFurniture(inputs: readonly unknown[]): FurnitureValidation {
  const validated = inputs.map(validateCutListPdf);

  interface Occurrence {
    document: number;
    board: number;
    piece: number;
    data: BoardPiece;
  }
  const byCode = new Map<string, Occurrence[]>();
  validated.forEach((result, d) => {
    if (result.status !== "validado") return;
    result.document.boards.forEach((board, b) =>
      board.pieces.forEach((data, p) => {
        const { code } = normalizeCode(data.code);
        if (code === null) return;
        const list = byCode.get(code);
        const occurrence = { document: d, board: b, piece: p, data };
        if (list) list.push(occurrence);
        else byCode.set(code, [occurrence]);
      }),
    );
  });

  const codes = [...byCode.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const findings: FurnitureFinding[] = [];
  const totals: CodeTotal[] = [];

  for (const code of codes) {
    const occurrences = byCode.get(code) ?? [];
    const rows = occurrences.map(({ document, board, piece }) => ({ document, board, piece }));
    const add = (reason: PdfReason, detail: string) => findings.push({ reason, code, detail, rows });
    const differs = <T>(value: (occurrence: Occurrence) => T) => new Set(occurrences.map(value)).size > 1;

    if (differs((o) => o.document)) add("codigo-con-distinto-material", `El código ${code} aparece en más de un PDF del mueble.`);
    if (differs((o) => o.data.finalL) || differs((o) => o.data.finalA)) add("codigo-con-distintas-medidas", `El código ${code} tiene medidas distintas entre sus filas.`);
    if (differs((o) => edgesKey(o.data.edges))) add("codigo-con-distinto-canteado", `El código ${code} tiene canteado distinto entre sus filas.`);
    if (differs((o) => o.data.name.normalize("NFC"))) add("codigo-con-distinto-nombre", `El código ${code} tiene nombres distintos entre sus filas.`);

    const quantities = occurrences.map((o) => o.data.quantity);
    totals.push({ code, total: quantities.includes(null) ? null : quantities.reduce<number>((sum, q) => sum + (q ?? 0), 0) });
  }

  const documents = validated.map((result, d): DocumentValidation => {
    if (result.status !== "validado") return result;
    const rows = result.rows.map((row) => {
      const extra = findings.filter((f) => f.rows.some((r) => r.document === d && r.board === row.board && r.piece === row.piece)).map((f) => f.reason);
      const reasons = [...new Set([...row.reasons, ...extra])];
      return { ...row, reasons, level: reasons.length === 0 ? ("segura" as const) : ("dudosa" as const) };
    });
    return { ...result, rows };
  });

  let status: ListingStatus = "publicable";
  if (documents.length === 0 || documents.some((d) => d.status === "rechazado")) status = "bloqueado";
  else if (documents.some((d) => d.status === "validado" && d.rows.some((row) => row.level === "dudosa"))) status = "borrador";

  return { documents, findings, totals, status };
}
