// Conversión del resultado de validateFurniture al listado (docs/spec-sesion-2b-listado-cruce.md §2.2 y §3;
// docs/spec-esquema-pdf.md §6, INV-12 e INV-14). Función pura, sin red ni dependencias.
//
// Sin módulo y sin qrId: no salen del PDF y no se deducen (tampoco del .dae; consulta 44 sin tocar).
// La columna de cantos ausente da "sin-definir", que no es "sin canto" ([]) ni "sin dato" (null): PDF-2 abierto (D3).
// Nada se pierde en silencio: un código que no entra va a `excluded` y una fila sin código válido a `unkeyedRows`,
// cada uno con sus razones (v0.4, I11).

import type { EdgeId, PieceType } from "@/data/types";
import { normalizeCode } from "./code";
import { edgeStripsToEdgeIds } from "./edges";
import { PDF_REASONS, REJECTING_REASONS, type PdfReason } from "./reasons";
import type { BoardPiece, EdgeStrips } from "./types";
import type { FurnitureValidation } from "./validate";

export type ListedEdgeBanding = readonly EdgeId[] | "sin-definir";

/** Fila del PDF de la que sale una pieza: índice de documento, de hoja y de fila (los de validateFurniture). */
export interface ListedRow {
  document: number;
  board: number;
  piece: number;
}

export type ListedPiece = Omit<PieceType, "qrId" | "moduleId" | "edgeBanding"> & {
  edgeBanding: ListedEdgeBanding;
  /** Filas del PDF de las que sale, para la revisión. */
  rows: ListedRow[];
};

/** Código con filas que no entra al listado porque sus datos no se pueden tomar sin elegir (I1). */
export interface ExcludedCode {
  code: string;
  /** Sin duplicados, en el orden del catálogo (`PDF_REASONS`). Nunca vacía. */
  reasons: PdfReason[];
  rows: ListedRow[];
}

/** Fila sin código válido (`codigo-ausente`, `formato-invalido`): no tiene código con el que agruparse. */
export interface UnkeyedRow {
  row: ListedRow;
  /** Las de la fila en validateFurniture, sin duplicados y en el orden del catálogo. Nunca vacía. */
  reasons: PdfReason[];
}

export type Listing =
  | { status: "bloqueado"; furnitureId: string; reason: PdfReason }
  | { status: "borrador"; furnitureId: string; pieces: ListedPiece[]; excluded: ExcludedCode[]; unkeyedRows: UnkeyedRow[] }
  | { status: "publicable"; furnitureId: string; pieces: ListedPiece[]; excluded: []; unkeyedRows: [] };

/** El resultado de validateFurniture no cumple sus propias invariantes (p. ej. un rechazo sin razón de rechazo). */
export class ListingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListingInputError";
  }
}

interface Occurrence extends ListedRow {
  data: BoardPiece;
  thicknessMm: number;
  material: string;
}

const nfc = (text: string) => text.normalize("NFC");
const byCatalog = (a: PdfReason, b: PdfReason) => PDF_REASONS.indexOf(a) - PDF_REASONS.indexOf(b);
const orderedReasons = (reasons: Iterable<PdfReason>): PdfReason[] => [...new Set(reasons)].sort(byCatalog);
const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function edgeBandingOf(edges: EdgeStrips | "columna-ausente"): ListedEdgeBanding {
  return edges === "columna-ausente" ? "sin-definir" : edgeStripsToEdgeIds(edges);
}

/** Un solo valor para todas las filas, o undefined si difieren (comparación por clave textual). */
function single<T>(occurrences: readonly Occurrence[], value: (o: Occurrence) => T): T | undefined {
  const keys = new Set(occurrences.map((o) => JSON.stringify(value(o))));
  return keys.size === 1 ? value(occurrences[0]) : undefined;
}

/**
 * Primera razón de rechazo entre los documentos rechazados, en el orden de los documentos y de sus hallazgos.
 * Sin documentos, `esquema-invalido`: no hay nada con la forma esperada (§2.2).
 */
function blockingReason(furniture: FurnitureValidation): PdfReason {
  if (furniture.documents.length === 0) return "esquema-invalido";
  for (const document of furniture.documents) {
    if (document.status !== "rechazado") continue;
    const finding = document.findings.find((f) => REJECTING_REASONS.includes(f.reason));
    if (finding) return finding.reason;
  }
  throw new ListingInputError("El mueble está bloqueado pero ningún documento rechazado trae una razón de rechazo.");
}

type Built = { piece: ListedPiece; reasons?: undefined } | { piece?: undefined; reasons: PdfReason[] };

/** La pieza del código, o las razones por las que no se puede armar sin elegir un valor (I1). */
function buildPiece(code: string, total: number | null, occurrences: readonly Occurrence[]): Built {
  const name = single(occurrences, (o) => nfc(o.data.name));
  const lengthMm = single(occurrences, (o) => o.data.finalL);
  const widthMm = single(occurrences, (o) => o.data.finalA);
  const thicknessMm = single(occurrences, (o) => o.thicknessMm);
  const material = single(occurrences, (o) => nfc(o.material));
  const edgeBanding = single(occurrences, (o) => edgeBandingOf(o.data.edges));

  const reasons: PdfReason[] = [];
  if (total === null || occurrences.some((o) => o.data.finalL === null || o.data.finalA === null)) reasons.push("campo-pendiente");
  if (material === undefined || thicknessMm === undefined) reasons.push("codigo-con-distinto-material");
  if (lengthMm === undefined || widthMm === undefined) reasons.push("codigo-con-distintas-medidas");
  if (edgeBanding === undefined) reasons.push("codigo-con-distinto-canteado");
  if (name === undefined) reasons.push("codigo-con-distinto-nombre");

  if (
    reasons.length > 0 ||
    total === null ||
    name === undefined ||
    lengthMm === undefined ||
    lengthMm === null ||
    widthMm === undefined ||
    widthMm === null ||
    thicknessMm === undefined ||
    material === undefined ||
    edgeBanding === undefined
  ) {
    if (reasons.length === 0) throw new ListingInputError(`El código ${code} no se pudo armar y no hay razón que lo explique.`);
    return { reasons: orderedReasons(reasons) };
  }

  return {
    piece: {
      code,
      name,
      lengthMm, // finalL, sin reordenar (INV-7)
      widthMm, // finalA
      thicknessMm,
      material,
      quantity: total, // INV-12
      edgeBanding,
      notes: null,
      rows: occurrences.map(({ document, board, piece }) => ({ document, board, piece })),
    },
  };
}

/**
 * Un `ListedPiece` por código, en el orden de `totals`. Un código entra solo si todos sus datos se pueden tomar
 * del PDF sin elegir: total legible, L y A legibles e iguales en todas sus filas, y el mismo nombre, canteado,
 * material y espesor (INV-10, INV-11). Si no, va a `excluded` con sus razones, y el listado es `borrador`.
 * Las filas sin código válido van a `unkeyedRows` con las razones de su fila.
 */
export function toListing(furnitureId: string, furniture: FurnitureValidation): Listing {
  if (furniture.status === "bloqueado") return { status: "bloqueado", furnitureId, reason: blockingReason(furniture) };

  const byCode = new Map<string, Occurrence[]>();
  const unkeyedRows: UnkeyedRow[] = [];
  furniture.documents.forEach((result, document) => {
    if (result.status !== "validado") return;
    const { header } = result.document;
    result.document.boards.forEach((board, b) =>
      board.pieces.forEach((data, p) => {
        const row = { document, board: b, piece: p };
        const { code } = normalizeCode(data.code);
        if (code === null) {
          const rowResult = result.rows.find((r) => r.board === b && r.piece === p);
          const reasons = orderedReasons(rowResult?.reasons ?? []);
          if (reasons.length === 0) throw new ListingInputError(`La fila ${document}/${b}/${p} no tiene código válido y tampoco razones.`);
          unkeyedRows.push({ row, reasons });
          return;
        }
        const occurrence: Occurrence = { ...row, data, thicknessMm: board.thicknessMm, material: header.material };
        const list = byCode.get(code);
        if (list) list.push(occurrence);
        else byCode.set(code, [occurrence]);
      }),
    );
  });

  const pieces: ListedPiece[] = [];
  const excluded: ExcludedCode[] = [];
  for (const { code, total } of furniture.totals) {
    const occurrences = byCode.get(code);
    if (!occurrences || occurrences.length === 0) throw new ListingInputError(`El total del código ${code} no tiene filas.`);
    const built = buildPiece(code, total, occurrences);
    if (built.piece) pieces.push(built.piece);
    else excluded.push({ code, reasons: built.reasons, rows: occurrences.map(({ document, board, piece }) => ({ document, board, piece })) });
  }
  excluded.sort((a, b) => binary(a.code, b.code));

  if (furniture.status === "publicable" && excluded.length === 0 && unkeyedRows.length === 0) {
    return { status: "publicable", furnitureId, pieces, excluded: [], unkeyedRows: [] };
  }
  return { status: "borrador", furnitureId, pieces, excluded, unkeyedRows };
}
