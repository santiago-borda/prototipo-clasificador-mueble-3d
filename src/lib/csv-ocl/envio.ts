// IC-2 a IC-5 y IC-7 (docs/spec-importador-csv-envio.md): del CSV que mandó el ERP (bytes) al listado del envío, o a
// la causa por la que no se puede usar. Función pura y determinista (sin red, DOM ni crypto): la usan el servidor al
// recibir el envío (POST /api/trabajos) y al servir el listado (GET /api/erp/proyectos/{uuid}/listado), que lo
// recalcula desde los bytes guardados.
//
// Conservador, como el spike: o el listado entero se puede usar (`publicable`), o el envío falla con la causa.

import type { EdgeId } from "@/data/types";
import { parseOclCsv, type CsvIssue, type CsvPiece } from "./parse";
import type { CsvRejection } from "./reasons";

/** Filas con problemas que se nombran en el mensaje (IC-4); el resto se cuenta. */
export const FILAS_EN_MENSAJE = 3;
/**
 * IC-I7 (revisión del 21/11): topes de largo. Los mensajes del parser copian la celda del CSV, que puede ser larguísima,
 * y `job.message` es varchar(2000) en la base: un mensaje más largo haría fallar el `settle` (500 en vez del 422).
 */
export const LARGO_MAX_PROBLEMA = 200;
export const LARGO_MAX_MENSAJE = 1500;

/** Corta en `max` caracteres (contando el «…» final). */
export const acotar = (texto: string, max: number): string => (texto.length <= max ? texto : `${texto.slice(0, max - 1)}…`);

export type MotivoCsvEnvio = "csv-utf8" | `csv-${CsvRejection}` | "csv-borrador";

export interface CantoDelListado {
  /** Con las celdas del CSV de OpenCutList (`<material> (<espesor> mm x <ancho> mm)`) los tres vienen siempre. */
  material: string | null;
  anchoMm: number | null;
  /** Redondeado a un decimal por OpenCutList: solo texto, nunca un dato exacto. */
  espesorTexto: string | null;
}

/** Una fila del listado, como la sirve GET …/listado (IC-6). Medidas finales, sin reordenar. */
export interface PiezaDelListado {
  codigo: string;
  /** `Descripción` del CSV; "" si viene vacía (no se inventa). */
  nombre: string;
  largoMm: number;
  anchoMm: number;
  espesorMm: number;
  material: string;
  cantidad: number;
  canteado: EdgeId[];
  /** El primer lado con canto (s1 a s4); null si la pieza no lleva canto. */
  canto: CantoDelListado | null;
}

export interface AvisoDelListado {
  fila: number;
  columna: string;
  mensaje: string;
}

export interface ListadoDelEnvio {
  /** Para `listadoId` (solo servidor). Orden por código, como el parser. */
  pieces: CsvPiece[];
  piezas: PiezaDelListado[];
  tipos: number;
  /** Σ cantidades. */
  piezasTotales: number;
  /** Σ cantidad × largo de las filas de canto, en metros, sin desperdicio. */
  metrosCanto: number;
  /** Avisos que no impiden usar el listado (hoy: `nombre-ausente`). */
  avisos: AvisoDelListado[];
}

export type LecturaCsvEnvio = { ok: true; listado: ListadoDelEnvio } | { ok: false; motivo: MotivoCsvEnvio; mensaje: string };

const aviso = (i: CsvIssue): AvisoDelListado => ({ fila: i.csvRow, columna: i.column, mensaje: i.message });

function cantoDe(piece: CsvPiece): CantoDelListado | null {
  const strip = piece.strips.s1 ?? piece.strips.s2 ?? piece.strips.s3 ?? piece.strips.s4;
  return strip ? { material: strip.material, anchoMm: strip.widthMm, espesorTexto: strip.thicknessText } : null;
}

const aPieza = (p: CsvPiece): PiezaDelListado => ({
  codigo: p.code,
  nombre: p.name,
  largoMm: p.lengthMm,
  anchoMm: p.widthMm,
  espesorMm: p.thicknessMm,
  material: p.material,
  cantidad: p.quantity,
  canteado: p.edgeBanding === "sin-definir" ? [] : [...p.edgeBanding], // con las 4 columnas de borde nunca sale "sin-definir"
  canto: cantoDe(p),
});

/** IC-2: UTF-8 estricto. null si los bytes no son UTF-8. */
export function textoUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * IC-4: cuántas filas tienen problemas y las primeras FILAS_EN_MENSAJE filas, cada una con sus problemas (columna y
 * mensaje del parser, sin el punto final); «y N filas más» cuenta filas, no problemas.
 */
function mensajeBorrador(issues: readonly CsvIssue[]): string {
  const porFila = new Map<number, CsvIssue[]>();
  for (const i of issues) {
    if (i.reason === "nombre-ausente") continue;
    const lista = porFila.get(i.csvRow);
    if (lista) lista.push(i);
    else porFila.set(i.csvRow, [i]);
  }
  const filas = [...porFila.keys()].sort((a, b) => a - b);
  const primeras = filas.slice(0, FILAS_EN_MENSAJE).map((fila) => {
    const problemas = (porFila.get(fila) ?? []).map((i) => `«${i.column}»: ${acotar(i.message.replace(/\.$/, ""), LARGO_MAX_PROBLEMA)}`);
    return `fila ${fila}, ${problemas.join("; ")}`;
  });
  const resto = filas.length - primeras.length;
  const cuantas = filas.length === 1 ? "1 fila" : `${filas.length} filas`;
  const mas = resto === 0 ? "" : ` · y ${resto === 1 ? "1 fila más" : `${resto} filas más`}`;
  return acotar(`El listado de piezas del CSV tiene ${cuantas} con problemas: ${primeras.join(" · ")}${mas}. Corregí el modelo o el CSV y volvé a enviar el proyecto.`, LARGO_MAX_MENSAJE);
}

export function leerCsvDelEnvio(bytes: Uint8Array): LecturaCsvEnvio {
  const texto = textoUtf8(bytes);
  if (texto === null) {
    return { ok: false, motivo: "csv-utf8", mensaje: "El CSV no está en UTF-8: exportá de nuevo el «Listado de piezas» desde OpenCutList." };
  }
  const leido = parseOclCsv(texto);
  if (!leido.ok) return { ok: false, motivo: `csv-${leido.reason}`, mensaje: acotar(`El CSV no se pudo leer: ${leido.message}`, LARGO_MAX_MENSAJE) };
  if (leido.listing.status !== "publicable") return { ok: false, motivo: "csv-borrador", mensaje: mensajeBorrador(leido.issues) };

  const { pieces } = leido.listing;
  return {
    ok: true,
    listado: {
      pieces,
      piezas: pieces.map(aPieza),
      tipos: pieces.length,
      piezasTotales: pieces.reduce((s, p) => s + p.quantity, 0),
      metrosCanto: Math.round(leido.edgeTotalMm) / 1000,
      avisos: leido.issues.filter((i) => i.reason === "nombre-ausente").map(aviso),
    },
  };
}

/** IC-5: mensaje del trabajo `success`. */
export function mensajeListadoLeido(listado: Pick<ListadoDelEnvio, "tipos" | "piezasTotales">): string {
  return `Modelo y CSV recibidos y verificados; listado de piezas leído (${listado.tipos} ${listado.tipos === 1 ? "tipo" : "tipos"}, ${listado.piezasTotales} ${listado.piezasTotales === 1 ? "pieza" : "piezas"}).`;
}
