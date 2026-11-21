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
      return empieza(b, [0x50, 0x4b, 0x03, 0x04]) || empieza(b, [0x50, 0x4b, 0x05, 0x06]); // zip vacío: solo el fin del directorio
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
export function tipoReal(kind: FileKind, declarado: string, body: Uint8Array): string {
  const regla = REGLAS[kind];
  if (body.length > regla.maxBytes) throw new ArchivoDemasiadoGrandeError(kind, body.length, regla.maxBytes);
  const real = regla.tipos.find((t) => tieneFirma(t, body));
  if (!real) throw new TipoNoPermitidoError(kind, declarado);
  return real;
}
