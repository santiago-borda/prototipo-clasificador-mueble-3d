// S3-D6 y S3-D7: reglas por clase de archivo, como tabla de datos, y detección del tipo por los primeros bytes (no por
// el nombre ni por lo que declara quien sube). Puro. Tamaños ASUMIDO, reversibles.

import { ArchivoDemasiadoGrandeError, TipoNoPermitidoError } from "./errors";

export const FILE_KINDS = ["imagen", "modelo-dae", "zip", "pdf", "csv"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const MB = 1024 * 1024;

interface Regla {
  /** Tipos de contenido admitidos, en el orden en que se prueban por firma. */
  tipos: readonly string[];
  maxBytes: number;
}

export const REGLAS: Record<FileKind, Regla> = {
  imagen: { tipos: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * MB },
  "modelo-dae": { tipos: ["model/vnd.collada+xml"], maxBytes: 10 * MB },
  zip: { tipos: ["application/zip"], maxBytes: 50 * MB },
  pdf: { tipos: ["application/pdf"], maxBytes: 20 * MB },
  // v0.2: el CSV del envío del ERP (listado de OpenCutList). Mismo tope que ERP_CSV_MAX_BYTES por defecto (ASUMIDO).
  csv: { tipos: ["text/csv"], maxBytes: 5 * MB },
};

const empieza = (b: Uint8Array, firma: readonly number[], desde = 0) => firma.every((x, i) => b[desde + i] === x);

/** Firma del fin del directorio central de un zip (50 4B 05 06) en los últimos 65.557 bytes. */
function tieneFinDeDirectorio(b: Uint8Array): boolean {
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i -= 1) if (empieza(b, [0x50, 0x4b, 0x05, 0x06], i)) return true;
  return false;
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** ¿Los bytes tienen la firma de ese tipo? Los de texto se aceptan si no traen bytes nulos. */
function tieneFirma(tipo: string, b: Uint8Array): boolean {
  switch (tipo) {
    case "image/jpeg":
      return empieza(b, [0xff, 0xd8, 0xff]);
    case "image/png":
      return empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return empieza(b, ascii("RIFF")) && empieza(b, ascii("WEBP"), 8);
    case "application/zip":
      // Empieza con una entrada local o, como lo lee src/server/erp/zip.ts, trae el fin del directorio central en los
      // últimos 64 KB + 22 bytes (un zip con preámbulo, p. ej. autoextraíble, no empieza con «PK»).
      return empieza(b, [0x50, 0x4b, 0x03, 0x04]) || tieneFinDeDirectorio(b);
    case "application/pdf":
      return empieza(b, ascii("%PDF-"));
    case "model/vnd.collada+xml": {
      const inicio = new TextDecoder().decode(b.subarray(0, 512)).replace(/^﻿/, "").trimStart();
      return inicio.startsWith("<?xml") || inicio.startsWith("<COLLADA");
    }
    case "text/csv":
      return !b.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

/**
 * Valida tamaño y tipo de un archivo de la clase dada y devuelve el tipo de contenido REAL (por firma). Lanza
 * `ArchivoDemasiadoGrandeError` o `TipoNoPermitidoError` (con el tipo declarado). Un PNG declarado como JPEG se
 * guarda como PNG (PF-7).
 */
export function tipoReal(kind: FileKind, declarado: string, body: Uint8Array, maxBytes?: number): string {
  const regla = REGLAS[kind];
  const max = maxBytes ?? regla.maxBytes;
  if (body.length > max) throw new ArchivoDemasiadoGrandeError(kind, body.length, max);
  const real = regla.tipos.find((t) => tieneFirma(t, body));
  if (!real) throw new TipoNoPermitidoError(kind, declarado);
  return real;
}
