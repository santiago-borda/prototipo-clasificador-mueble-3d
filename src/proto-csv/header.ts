// Encabezado del "Listado de piezas" de OpenCutList (spike, docs/spec-proto-csv-ocl.md §2). Función pura.
// Los encabezados no son confiables ("Etiquetas" dos veces, "Ancho del borde 1" junto a "Ancho de borde 2"): cada
// campo se busca por regex sobre el nombre normalizado, sin suponer orden. Las columnas no usadas se ignoran.

import type { EdgeStrips } from "@/pdf/types";
import type { CsvRejection } from "./reasons";

export type Strip = keyof EdgeStrips;

export type FieldId =
  | "letter"
  | "code"
  | "quantity"
  | "lengthMm"
  | "widthMm"
  | "thicknessMm"
  | "rawL"
  | "rawA"
  | "materialType"
  | "materialName"
  | "description"
  | Strip;

interface FieldDef {
  id: FieldId;
  /** Rótulo para los mensajes (el de OpenCutList 7.1.0 en español). */
  label: string;
  pattern: RegExp;
  required: boolean;
}

/**
 * Cantos: Long. borde 1 = inferior = s1, Long. borde 2 = superior = s2, Ancho borde 1 = izquierdo = s3,
 * Ancho borde 2 = derecho = s4. Verificado contra los íconos del PDF (README del fixture del gabinete).
 * NO es el orden de la ventana "Tiras de cantos" de OpenCutList.
 */
export const FIELDS: readonly FieldDef[] = [
  { id: "letter", label: "No.", pattern: /^no\.?$/, required: false },
  { id: "code", label: "Designación", pattern: /^designacion$/, required: true },
  { id: "quantity", label: "Cantidad", pattern: /^cantidad$/, required: true },
  { id: "lengthMm", label: "Longitud", pattern: /^longitud$/, required: true },
  { id: "widthMm", label: "Anchura", pattern: /^anchura$/, required: true },
  { id: "thicknessMm", label: "Grosor", pattern: /^grosor$/, required: true },
  { id: "rawL", label: "Longitud - cruda", pattern: /^longitud - cruda$/, required: false },
  { id: "rawA", label: "Ancho - crudo", pattern: /^ancho - crudo$/, required: false },
  { id: "materialType", label: "Tipo de material", pattern: /^tipo de material$/, required: true },
  { id: "materialName", label: "Nombre del material", pattern: /^nombre del material$/, required: true },
  { id: "description", label: "Descripción", pattern: /^descripcion$/, required: false },
  { id: "s1", label: "Longitud del borde 1", pattern: /^longitud del? borde 1$/, required: true },
  { id: "s2", label: "Longitud del borde 2", pattern: /^longitud del? borde 2$/, required: true },
  { id: "s3", label: "Ancho del borde 1", pattern: /^ancho del? borde 1$/, required: true },
  { id: "s4", label: "Ancho de borde 2", pattern: /^ancho del? borde 2$/, required: true },
];

export const STRIPS: readonly Strip[] = ["s1", "s2", "s3", "s4"];

/** NFC, sin tildes, minúsculas, espacios colapsados, sin BOM. */
export function normalizeHeader(name: string): string {
  return name
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type HeaderResult =
  | { ok: true; columns: Partial<Record<FieldId, number>> }
  | { ok: false; reason: Exclude<CsvRejection, "unidad-no-soportada">; column?: string; message: string };

const OPTIONS_HINT = "En OpenCutList, Opciones, desmarcá «ocultar la columna de cantos» y volvé a exportar el «Listado de piezas».";

/** Resuelve cada campo a su índice de columna, o el rechazo con un mensaje accionable. */
export function resolveHeader(header: readonly string[]): HeaderResult {
  const names = header.map(normalizeHeader);
  if (names.every((n) => n === "")) {
    return { ok: false, reason: "csv-vacio", message: "El archivo está vacío: falta la fila de encabezados del «Listado de piezas»." };
  }

  const matches = new Map<FieldId, number[]>();
  for (const field of FIELDS) {
    matches.set(
      field.id,
      names.flatMap((n, i) => (field.pattern.test(n) ? [i] : [])),
    );
  }

  // La "Lista de instancias" no tiene Cantidad y repite una fila por pieza física.
  if ((matches.get("quantity") ?? []).length === 0 && names.some((n) => n === "camino" || n === "instancia")) {
    return {
      ok: false,
      reason: "lista-de-instancias",
      message:
        "Este CSV es la «Lista de instancias» (una fila por pieza física, sin columna Cantidad). En OpenCutList, pestaña Piezas, exportá con la fuente «Listado de piezas».",
    };
  }

  for (const field of FIELDS) {
    const found = matches.get(field.id) ?? [];
    if (found.length > 1) {
      return {
        ok: false,
        reason: "columna-ambigua",
        column: field.label,
        message: `Hay ${found.length} columnas que se leen como «${field.label}» (columnas ${found.map((i) => i + 1).join(", ")}). Exportá de nuevo el «Listado de piezas» sin columnas agregadas a mano.`,
      };
    }
  }

  for (const field of FIELDS) {
    if (!field.required || (matches.get(field.id) ?? []).length === 1) continue;
    const isEdge = (STRIPS as readonly string[]).includes(field.id);
    return {
      ok: false,
      reason: "columna-faltante",
      column: field.label,
      message: isEdge
        ? `Falta la columna «${field.label}». ${OPTIONS_HINT}`
        : `Falta la columna «${field.label}». Exportá el «Listado de piezas» de OpenCutList (CSV, separador punto y coma, UTF-8) sin quitar columnas.`,
    };
  }

  const columns: Partial<Record<FieldId, number>> = {};
  for (const field of FIELDS) {
    const [index] = matches.get(field.id) ?? [];
    if (index !== undefined) columns[field.id] = index;
  }
  return { ok: true, columns };
}
