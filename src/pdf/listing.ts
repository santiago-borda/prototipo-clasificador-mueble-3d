// Conversión del resultado de validateFurniture al listado (docs/spec-sesion-2b-listado-cruce.md §2.2 y §3;
// docs/spec-esquema-pdf.md §6, INV-12 e INV-14). Función pura, sin red ni dependencias.
//
// Sin módulo y sin qrId: no salen del PDF y no se deducen (tampoco del .dae; consulta 44 sin tocar).
// La columna de cantos ausente da "sin-definir", que no es "sin canto" ([]) ni "sin dato" (null): PDF-2 abierto (D3).

import type { EdgeId, PieceType } from "@/data/types";
import { normalizeCode } from "./code";
import { edgeStripsToEdgeIds } from "./edges";
import { REJECTING_REASONS, type PdfReason } from "./reasons";
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

export type Listing =
  | { status: "bloqueado"; furnitureId: string; reason: PdfReason }
  | { status: "borrador" | "publicable"; furnitureId: string; pieces: ListedPiece[] };

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

/**
 * Un `ListedPiece` por código, en el orden de `totals`. Un código entra solo si todos sus datos se pueden tomar
 * del PDF sin elegir: total legible, L y A legibles e iguales en todas sus filas, y el mismo nombre, canteado,
 * material y espesor (INV-10, INV-11). Si no, queda fuera y el listado es `borrador` (sus filas ya son `dudosa`):
 * no se inventa ni se elige un valor.
 */
export function toListing(furnitureId: string, furniture: FurnitureValidation): Listing {
  if (furniture.status === "bloqueado") return { status: "bloqueado", furnitureId, reason: blockingReason(furniture) };

  const byCode = new Map<string, Occurrence[]>();
  furniture.documents.forEach((result, document) => {
    if (result.status !== "validado") return;
    const { header } = result.document;
    result.document.boards.forEach((board, b) =>
      board.pieces.forEach((data, p) => {
        const { code } = normalizeCode(data.code);
        if (code === null) return;
        const occurrence: Occurrence = { document, board: b, piece: p, data, thicknessMm: board.thicknessMm, material: header.material };
        const list = byCode.get(code);
        if (list) list.push(occurrence);
        else byCode.set(code, [occurrence]);
      }),
    );
  });

  let complete = true;
  const pieces: ListedPiece[] = [];
  for (const { code, total } of furniture.totals) {
    const occurrences = byCode.get(code);
    if (!occurrences || occurrences.length === 0) throw new ListingInputError(`El total del código ${code} no tiene filas.`);

    const name = single(occurrences, (o) => nfc(o.data.name));
    const lengthMm = single(occurrences, (o) => o.data.finalL);
    const widthMm = single(occurrences, (o) => o.data.finalA);
    const thicknessMm = single(occurrences, (o) => o.thicknessMm);
    const material = single(occurrences, (o) => nfc(o.material));
    const edgeBanding = single(occurrences, (o) => edgeBandingOf(o.data.edges));

    if (
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
      complete = false;
      continue;
    }

    pieces.push({
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
    });
  }

  const status = furniture.status === "publicable" && complete ? "publicable" : "borrador";
  return { status, furnitureId, pieces };
}
