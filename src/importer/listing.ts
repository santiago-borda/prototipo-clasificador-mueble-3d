// Lector del CSV con el listado de piezas del importador de prueba (docs/spec-importador-prueba.md, R1–R2).
// Función pura: sin React, sin three, sin dependencias. La usan el navegador (antes de subir) y el servidor.
//
// Las filas se numeran como en una planilla: la fila 1 es el encabezado y la 2, la primera pieza.

import type { EdgeId } from "@/data/types";

export interface ListingIssue {
  severity: "error" | "warning";
  /** Fila del archivo (1 = encabezado). */
  row: number;
  column: string;
  message: string;
}

export interface ListingEdgeBanding {
  /** Bordes con canto, con la convención asumida: largo 1 = largo-A, largo 2 = largo-B, corto 1 = corto-A, corto 2 = corto-B. */
  edges: readonly EdgeId[];
  type: string;
  widthMm: number;
  thicknessMm: number;
}

export interface ListingRow {
  /** Fila del archivo (1 = encabezado). */
  row: number;
  mueble: string;
  moduloNro: number;
  moduloNombre: string;
  codigo: string;
  nombrePieza: string;
  quantity: number;
  /** Nombres de las instancias (`Izq|Der`). Si el CSV no los trae, 1..cantidad. */
  instances: readonly string[];
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: string;
  /** null = ningún borde lleva canto. */
  edgeBanding: ListingEdgeBanding | null;
  observaciones: string | null;
}

export interface ListingResult {
  /** Solo las filas sin errores. */
  rows: ListingRow[];
  issues: ListingIssue[];
}

const EDGE_COLUMNS: readonly (readonly [string, EdgeId])[] = [
  ["canto_largo_1", "largo-A"],
  ["canto_largo_2", "largo-B"],
  ["canto_corto_1", "corto-A"],
  ["canto_corto_2", "corto-B"],
];

const REQUIRED = [
  "mueble",
  "modulo_nro",
  "modulo_nombre",
  "codigo",
  "nombre_pieza",
  "cantidad",
  "largo_mm",
  "ancho_mm",
  "espesor_mm",
  "material",
  ...EDGE_COLUMNS.map(([column]) => column),
];

const OPTIONAL = [
  "mueble_id",
  "instancias",
  "color",
  "veta",
  "canto_tipo",
  "canto_ancho_mm",
  "canto_espesor_mm",
  "canto_color",
  "observaciones",
];

const KNOWN = new Set([...REQUIRED, ...OPTIONAL]);

/** Separa el texto en registros y celdas. Acepta comillas dobles (con `""` adentro) y CRLF. */
function parseRecords(text: string, separator: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      record.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || record.length > 0) {
    record.push(cell);
    records.push(record);
  }
  return records;
}

/** `;` si el encabezado tiene más `;` que `,` (Excel en configuración regional es-AR guarda así). */
function detectSeparator(text: string): string {
  const header = text.split(/\r?\n/, 1)[0];
  const count = (ch: string) => header.split(ch).length - 1;
  return count(";") > count(",") ? ";" : ",";
}

const isBlank = (record: readonly string[]) => record.every((cell) => cell.trim() === "");

/** `SI`/`NO` sin distinguir mayúsculas ni tilde. null si es otra cosa. */
function parseYesNo(value: string): boolean | null {
  const normalized = value.trim().toUpperCase().replace("Í", "I");
  if (normalized === "SI") return true;
  if (normalized === "NO") return false;
  return null;
}

export function readListing(text: string): ListingResult {
  const issues: ListingIssue[] = [];
  const rows: ListingRow[] = [];
  const clean = text.replace(/^﻿/, "");
  const records = parseRecords(clean, detectSeparator(clean));
  if (records.length === 0 || isBlank(records[0])) {
    issues.push({ severity: "error", row: 1, column: "", message: "El archivo está vacío: falta la fila de encabezados." });
    return { rows, issues };
  }

  const header = records[0].map((name) => name.trim());
  const index = new Map(header.map((name, i) => [name, i]));

  for (const name of header) {
    if (!KNOWN.has(name)) {
      issues.push({ severity: "warning", row: 1, column: name, message: `Columna desconocida "${name}": se ignora.` });
    }
  }
  const missing = REQUIRED.filter((name) => !index.has(name));
  for (const name of missing) {
    issues.push({ severity: "error", row: 1, column: name, message: `Falta la columna obligatoria "${name}".` });
  }
  if (missing.length > 0) return { rows, issues };

  const seenCodes = new Set<string>();
  const moduleNames = new Map<number, string>();

  for (let r = 1; r < records.length; r += 1) {
    const record = records[r];
    if (isBlank(record)) continue;
    const row = r + 1;
    let hasError = false;

    const cell = (column: string) => (index.has(column) ? (record[index.get(column) as number] ?? "").trim() : "");
    const fail = (column: string, message: string) => {
      issues.push({ severity: "error", row, column, message });
      hasError = true;
    };
    const warn = (column: string, message: string) => issues.push({ severity: "warning", row, column, message });

    const text_ = (column: string): string => {
      const value = cell(column);
      if (value === "") fail(column, `"${column}" está vacío.`);
      return value;
    };
    const number = (column: string, { integer = false } = {}): number => {
      const value = cell(column);
      if (!/^\d+([.,]\d+)?$/.test(value) || Number(value.replace(",", ".")) <= 0 || (integer && !/^\d+$/.test(value))) {
        fail(column, `"${value}" no es un ${integer ? "número entero" : "número"} válido y mayor que cero.`);
        return Number.NaN;
      }
      if (value.includes(",")) warn(column, `"${value}" usa coma decimal: se leyó como ${value.replace(",", ".")}.`);
      return Number(value.replace(",", "."));
    };

    const mueble = text_("mueble");
    const moduloNro = number("modulo_nro", { integer: true });
    const moduloNombre = text_("modulo_nombre");
    const codigo = text_("codigo");
    const nombrePieza = text_("nombre_pieza");
    const quantity = number("cantidad", { integer: true });
    const lengthMm = number("largo_mm");
    const widthMm = number("ancho_mm");
    const thicknessMm = number("espesor_mm");
    const material = text_("material");

    if (codigo !== "") {
      if (seenCodes.has(codigo)) fail("codigo", `El código ${codigo} está repetido.`);
      seenCodes.add(codigo);
    }

    if (Number.isFinite(moduloNro) && moduloNombre !== "") {
      const known = moduleNames.get(moduloNro);
      if (known === undefined) moduleNames.set(moduloNro, moduloNombre);
      else if (known !== moduloNombre) {
        fail("modulo_nombre", `El módulo ${moduloNro} se llama "${known}" en otra fila y acá "${moduloNombre}".`);
      }
    }

    let instances: string[] = [];
    if (Number.isFinite(quantity)) {
      const listed = cell("instancias");
      instances = listed === "" ? Array.from({ length: quantity }, (_, i) => String(i + 1)) : listed.split("|").map((s) => s.trim());
      if (instances.length !== quantity) {
        fail("instancias", `"cantidad" dice ${quantity} y "instancias" lista ${instances.length} valores.`);
      }
    }

    const edges: EdgeId[] = [];
    for (const [column, edge] of EDGE_COLUMNS) {
      const flag = parseYesNo(cell(column));
      if (flag === null) fail(column, `"${cell(column)}" no es SI ni NO.`);
      else if (flag) edges.push(edge);
    }

    let edgeBanding: ListingEdgeBanding | null = null;
    if (edges.length > 0) {
      const type = text_("canto_tipo");
      const bandWidthMm = number("canto_ancho_mm");
      const bandThicknessMm = number("canto_espesor_mm");
      if (type !== "" && type.toUpperCase() !== "ABS") warn("canto_tipo", `Tipo de canto "${type}": el visor lo muestra como ABS.`);
      edgeBanding = { edges, type, widthMm: bandWidthMm, thicknessMm: bandThicknessMm };
    }

    if (hasError) continue;
    rows.push({
      row,
      mueble,
      moduloNro,
      moduloNombre,
      codigo,
      nombrePieza,
      quantity,
      instances,
      lengthMm,
      widthMm,
      thicknessMm,
      material,
      edgeBanding,
      observaciones: cell("observaciones") || null,
    });
  }

  return { rows, issues };
}
