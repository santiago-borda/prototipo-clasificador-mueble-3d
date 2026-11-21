// Parser del CSV "Listado de piezas" de OpenCutList 7.1.0 en español (docs/spec-importador-csv-envio.md §2; viene del spike, docs/spec-proto-csv-ocl.md §2).
// Función pura y determinista: misma entrada, mismo JSON. Sin React, three, DOM ni red.
//
// Produce piezas con la forma de `ListedPiece` (asignables a `ListadoRow`): `listadoId` no cambia de definición.
// Medidas FINALES (Longitud, Anchura, Grosor) sin reordenar: L no es "largo" (RP2). Las crudas ("Ajustadas" del PDF)
// quedan en `rawLA`, informativas y fuera del hash. El espesor del canto viene redondeado a un decimal: se guarda
// solo como texto. Conservador: un código con cualquier razón va a `excluded` y el listado queda `borrador`.
// Las filas se numeran como en una planilla: la 1 es el encabezado.

import { parseRecords } from "@/importer/listing";
import { normalizeCode } from "@/pdf/code";
import { edgeStripsToEdgeIds } from "@/pdf/edges";
import type { ListedPiece } from "@/pdf/listing";
import type { EdgeStrip, EdgeStrips } from "@/pdf/types";
import { FIELDS, STRIPS, normalizeHeader, resolveHeader, type FieldId, type Strip } from "./header";
import { orderedRowReasons, type CsvRejection, type CsvRowReason, type CsvWarning } from "./reasons";

export type CsvPiece = Omit<ListedPiece, "rows"> & {
  /** No hay hojas de PDF: `crossCheck` no las lee. */
  rows: [];
  /** Fila del CSV de la pieza (1 = encabezado). */
  csvRows: number[];
  /** "No.": local de cada material; solo para el SVG. "" si el CSV no trae la columna. */
  letter: string;
  /** Crudas (L, A) = "Ajustadas" del PDF; null si faltan o no se leen. Informativas. */
  rawLA: [number, number] | null;
  /** Celdas de canto por lado (s1 inferior, s2 superior, s3 izquierdo, s4 derecho); null = sin canto. */
  strips: EdgeStrips;
};

/** Fila `Tipo de material = Canto`: un tramo de canto. No es una pieza. */
export interface EdgeRow {
  csvRow: number;
  code: string;
  strip: Strip;
  quantity: number;
  /** Longitud final del tramo (mm). */
  lengthMm: number;
}

export interface CsvExcluded {
  code: string;
  /** Sin duplicados, en el orden del catálogo. Nunca vacía. */
  reasons: CsvRowReason[];
  csvRows: number[];
}

export interface CsvUnkeyedRow {
  csvRow: number;
  reasons: CsvRowReason[];
}

export interface CsvIssue {
  csvRow: number;
  column: string;
  reason: CsvRowReason | CsvWarning;
  message: string;
}

export type CsvListing =
  | { status: "publicable"; pieces: CsvPiece[]; excluded: []; unkeyedRows: [] }
  | { status: "borrador"; pieces: CsvPiece[]; excluded: CsvExcluded[]; unkeyedRows: CsvUnkeyedRow[] };

export type CsvParse =
  | { ok: false; reason: CsvRejection; column?: string; message: string }
  | {
      ok: true;
      listing: CsvListing;
      edgeRows: EdgeRow[];
      /** Σ cantidad × longitud de las filas de canto (mm), sin desperdicio. */
      edgeTotalMm: number;
      /** Ordenados por fila y columna. */
      issues: CsvIssue[];
    };

const MM = /^(\d+(?:,\d+)?) mm$/;
/** Número con otra unidad: cm, m, pulgadas (in, ", fracciones), pies. */
const OTHER_UNIT = /^[\d\s.,/~]+\s*(cm|m|in|pulg(adas)?|ft|"|')$/i;
const EDGE_CELL = /^(.+?) \((\d+(?:,\d+)?) mm x (\d+(?:,\d+)?) mm\)$/;
/** Tolerancia al comparar el largo de una fila de canto con el lado de la pieza (el CSV redondea a 0,1). */
const EDGE_LENGTH_TOLERANCE_MM = 0.1;

const toNumber = (text: string) => Number(text.replace(",", "."));
const nfc = (text: string) => text.normalize("NFC");
const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const labelOf = (id: FieldId) => FIELDS.find((f) => f.id === id)?.label ?? id;

class UnitRejection {
  constructor(
    readonly csvRow: number,
    readonly column: string,
    readonly value: string,
  ) {}
}

/** "799,6 mm" → 799.6; otra unidad lanza `UnitRejection` (rechaza el archivo); otra cosa → null. */
function readMm(value: string, csvRow: number, column: string): number | null {
  const match = MM.exec(value);
  if (match) return toNumber(match[1]);
  if (OTHER_UNIT.test(value)) throw new UnitRejection(csvRow, column, value);
  return null;
}

/** Celda de canto: `""` = sin canto; `<material> (<espesor> mm x <ancho> mm)`; otra cosa = ilegible. */
function readEdgeCell(value: string): EdgeStrip | null | "ilegible" {
  if (value === "") return null;
  const match = EDGE_CELL.exec(value);
  if (!match) return "ilegible";
  return { label: value, material: nfc(match[1]), widthMm: toNumber(match[3]), thicknessText: `${match[2]} mm` };
}

interface PieceDraft {
  piece: CsvPiece;
  reasons: CsvRowReason[];
}

export function parseOclCsv(text: string): CsvParse {
  const clean = text.replace(/^﻿/, "");
  const records = parseRecords(clean, ";");
  const header = resolveHeader(records[0] ?? []);
  if (!header.ok) return header;
  const { columns } = header;

  const issues: CsvIssue[] = [];
  const drafts = new Map<string, PieceDraft[]>();
  const edgeRows: EdgeRow[] = [];
  const unkeyedRows: CsvUnkeyedRow[] = [];
  /** Códigos que solo aparecen en filas de canto ilegibles o sin pieza: razones por código. */
  const edgeOnly = new Map<string, { reasons: CsvRowReason[]; csvRows: number[] }>();

  try {
    for (let r = 1; r < records.length; r += 1) {
      const record = records[r];
      if (record.every((cell) => cell.trim() === "")) continue;
      const csvRow = r + 1;
      const cell = (id: FieldId) => {
        const index = columns[id];
        return index === undefined ? "" : (record[index] ?? "").trim();
      };
      const issue = (column: FieldId, reason: CsvRowReason | CsvWarning, message: string) =>
        issues.push({ csvRow, column: labelOf(column), reason, message });

      const type = normalizeHeader(cell("materialType"));
      const designation = cell("code");

      if (type === "canto") {
        readEdgeRow(designation, csvRow, cell, edgeRows, edgeOnly, unkeyedRows, issue);
        continue;
      }

      const reasons: CsvRowReason[] = [];
      const normalized = normalizeCode(designation);
      if (normalized.state === "ausente") {
        issue("code", "codigo-ausente", "La fila no tiene Designación.");
        unkeyedRows.push({ csvRow, reasons: ["codigo-ausente"] });
        continue;
      }
      if (normalized.state === "invalido") {
        issue("code", "formato-invalido", `«${designation}» no tiene el formato de código (0001-01-M01-C01).`);
        unkeyedRows.push({ csvRow, reasons: ["formato-invalido"] });
        continue;
      }
      const code = normalized.code;
      if (code === null) continue; // ya cubierto arriba: estrecha el tipo
      if (normalized.state === "anomalo") {
        reasons.push("nombre-anomalo");
        issue("code", "nombre-anomalo", `«${designation}» tiene guiones bajos de más; se lee como ${code} y queda para revisión.`);
      }
      if (type !== "tablero") {
        reasons.push("tipo-material-no-soportado");
        issue("materialType", "tipo-material-no-soportado", `Tipo de material «${cell("materialType")}»: el importador solo lee Tablero y Canto.`);
      }

      const measure = (id: FieldId): number => {
        const value = readMm(cell(id), csvRow, labelOf(id));
        if (value === null || !(value > 0)) {
          reasons.push("valor-invalido");
          issue(id, "valor-invalido", `«${cell(id)}» no es una medida en mm mayor que cero.`);
          return Number.NaN;
        }
        return value;
      };
      const lengthMm = measure("lengthMm");
      const widthMm = measure("widthMm");
      const thicknessMm = measure("thicknessMm");

      const quantityText = cell("quantity");
      const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : Number.NaN;
      if (!(quantity >= 1)) {
        reasons.push("valor-invalido");
        issue("quantity", "valor-invalido", `«${quantityText}» no es una cantidad entera mayor o igual que 1.`);
      }

      const optionalMm = (id: FieldId) => (cell(id) === "" ? null : readMm(cell(id), csvRow, labelOf(id)));
      const rawL = optionalMm("rawL");
      const rawA = optionalMm("rawA");

      const strips: EdgeStrips = { s1: null, s2: null, s3: null, s4: null };
      for (const strip of STRIPS) {
        const read = readEdgeCell(cell(strip));
        if (read === "ilegible") {
          reasons.push("canto-ilegible");
          issue(strip, "canto-ilegible", `«${cell(strip)}» no tiene la forma «<material> (<espesor> mm x <ancho> mm)».`);
        } else strips[strip] = read;
      }

      const description = nfc(cell("description"));
      if (description === "") issue("description", "nombre-ausente", "El CSV no trae nombre de pieza: queda vacío (no se inventa).");

      const piece: CsvPiece = {
        code,
        name: description,
        lengthMm, // final, sin reordenar (RP2)
        widthMm,
        thicknessMm,
        material: nfc(cell("materialName")),
        quantity,
        edgeBanding: edgeStripsToEdgeIds(strips),
        notes: null,
        rows: [],
        csvRows: [csvRow],
        letter: cell("letter"),
        rawLA: rawL !== null && rawA !== null ? [rawL, rawA] : null,
        strips,
      };
      const list = drafts.get(code);
      if (list) list.push({ piece, reasons });
      else drafts.set(code, [{ piece, reasons }]);
    }
  } catch (error) {
    if (!(error instanceof UnitRejection)) throw error;
    return {
      ok: false,
      reason: "unidad-no-soportada",
      column: error.column,
      message: `La celda «${error.value}» (fila ${error.csvRow}, columna «${error.column}») no está en milímetros. En SketchUp, Información del modelo, Unidades, elegí milímetros y volvé a exportar el «Listado de piezas».`,
    };
  }

  const pieces: CsvPiece[] = [];
  const excluded: CsvExcluded[] = [];
  const edgesByCode = new Map<string, EdgeRow[]>();
  for (const row of edgeRows) {
    const list = edgesByCode.get(row.code);
    if (list) list.push(row);
    else edgesByCode.set(row.code, [row]);
  }

  for (const [code, list] of drafts) {
    const reasons = list.flatMap((d) => d.reasons);
    const csvRows = list.map((d) => d.piece.csvRows[0]);
    if (list.length > 1) {
      reasons.push("codigo-repetido");
      for (const row of csvRows) issues.push({ csvRow: row, column: labelOf("code"), reason: "codigo-repetido", message: `El código ${code} aparece en ${list.length} filas.` });
    } else if (reasons.length === 0 && !edgeRowsMatch(list[0].piece, edgesByCode.get(code) ?? [])) {
      // Solo con la pieza sana: con una medida o cantidad inválida la comparación daría un falso desacuerdo.
      reasons.push("fila-canto-no-coincide");
      issues.push({ csvRow: csvRows[0], column: labelOf("code"), reason: "fila-canto-no-coincide", message: `Las filas de canto de ${code} no coinciden con los lados marcados de la pieza.` });
    }
    const rowsWithEdges = [...csvRows, ...(edgesByCode.get(code) ?? []).map((e) => e.csvRow)];
    const extra = edgeOnly.get(code);
    if (extra) reasons.push(...extra.reasons);
    if (reasons.length > 0) excluded.push({ code, reasons: orderedRowReasons(reasons), csvRows: [...new Set([...rowsWithEdges, ...(extra?.csvRows ?? [])])].sort((a, b) => a - b) });
    else pieces.push(list[0].piece);
  }

  // Filas de canto de un código sin pieza (o ilegibles con código): ese código no se puede publicar.
  const pieceCodes = new Set(drafts.keys());
  const orphanCodes = new Set([...edgesByCode.keys(), ...edgeOnly.keys()].filter((c) => !pieceCodes.has(c)));
  for (const code of orphanCodes) {
    const rows = [...(edgesByCode.get(code) ?? []).map((e) => e.csvRow), ...(edgeOnly.get(code)?.csvRows ?? [])];
    excluded.push({ code, reasons: orderedRowReasons(["fila-canto-no-coincide", ...(edgeOnly.get(code)?.reasons ?? [])]), csvRows: [...new Set(rows)].sort((a, b) => a - b) });
    issues.push({ csvRow: Math.min(...rows), column: labelOf("code"), reason: "fila-canto-no-coincide", message: `Hay filas de canto de ${code} pero ninguna pieza con ese código.` });
  }

  pieces.sort((a, b) => binary(a.code, b.code));
  excluded.sort((a, b) => binary(a.code, b.code));
  unkeyedRows.sort((a, b) => a.csvRow - b.csvRow);
  edgeRows.sort((a, b) => a.csvRow - b.csvRow);
  issues.sort((a, b) => a.csvRow - b.csvRow || binary(a.column, b.column) || binary(a.reason, b.reason));
  const edgeTotalMm = Math.round(edgeRows.reduce((sum, e) => sum + e.quantity * e.lengthMm, 0) * 10) / 10;

  const listing: CsvListing =
    excluded.length === 0 && unkeyedRows.length === 0
      ? { status: "publicable", pieces, excluded: [], unkeyedRows: [] }
      : { status: "borrador", pieces, excluded, unkeyedRows };
  return { ok: true, listing, edgeRows, edgeTotalMm, issues };
}

/** Designación `<código> - <columna de borde>` → tramo de canto; si no se puede leer, razón para su código o sin clave. */
function readEdgeRow(
  designation: string,
  csvRow: number,
  cell: (id: FieldId) => string,
  edgeRows: EdgeRow[],
  edgeOnly: Map<string, { reasons: CsvRowReason[]; csvRows: number[] }>,
  unkeyedRows: CsvUnkeyedRow[],
  issue: (column: FieldId, reason: CsvRowReason, message: string) => void,
): void {
  const split = designation.indexOf(" - ");
  const normalized = normalizeCode(split < 0 ? designation : designation.slice(0, split));
  const side = split < 0 ? "" : normalizeHeader(designation.slice(split + 3));
  const strip = STRIPS.find((s) => FIELDS.find((f) => f.id === s)?.pattern.test(side));
  const quantityText = cell("quantity");
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : Number.NaN;
  const lengthMm = readMm(cell("lengthMm"), csvRow, labelOf("lengthMm"));

  const code = normalized.code;
  if (code !== null && strip && quantity >= 1 && lengthMm !== null && lengthMm > 0) {
    edgeRows.push({ csvRow, code, strip, quantity, lengthMm });
    return;
  }
  issue("code", "fila-canto-no-coincide", `Fila de canto ilegible: «${designation}».`);
  if (code === null) {
    unkeyedRows.push({ csvRow, reasons: ["fila-canto-no-coincide"] }); // sin código: no hay pieza a quién marcar
    return;
  }
  const entry = edgeOnly.get(code) ?? { reasons: [], csvRows: [] };
  entry.reasons.push("fila-canto-no-coincide");
  entry.csvRows.push(csvRow);
  edgeOnly.set(code, entry);
}

/**
 * Cada lado marcado de la pieza tiene exactamente una fila de canto, con la cantidad de la pieza y el largo del lado
 * (s1, s2: L; s3, s4: A) dentro de 0,1 mm; y no hay filas de canto para lados sin marca.
 */
function edgeRowsMatch(piece: CsvPiece, rows: readonly EdgeRow[]): boolean {
  for (const strip of STRIPS) {
    const forStrip = rows.filter((r) => r.strip === strip);
    if (piece.strips[strip] === null) {
      if (forStrip.length > 0) return false;
      continue;
    }
    if (forStrip.length !== 1) return false;
    const [row] = forStrip;
    const side = strip === "s1" || strip === "s2" ? piece.lengthMm : piece.widthMm;
    if (row.quantity !== piece.quantity || Math.abs(row.lengthMm - side) > EDGE_LENGTH_TOLERANCE_MM) return false;
  }
  return true;
}
