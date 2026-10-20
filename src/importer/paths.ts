// Rutas de almacenamiento y límites del importador de prueba (docs/spec-importador-prueba.md, "Contrato de datos").
// Sin dependencias: se puede usar en el navegador y en el servidor.

/** `importId`: 16 caracteres hexadecimales aleatorios; es el id público del link. */
export const IMPORT_ID_FORMAT = /^[0-9a-f]{16}$/;

export const IMPORTS_PREFIX = "importaciones/";

export const MAX_DAE_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_BYTES = 1024 * 1024;
/** Tope provisorio de importaciones guardadas: protege las 10.000 operaciones simples al mes del plan gratuito. */
export const MAX_IMPORTS = 50;

export function importPaths(importId: string) {
  const dir = `${IMPORTS_PREFIX}${importId}/`;
  return {
    dir,
    dae: `${dir}modelo.dae`,
    csv: `${dir}listado.csv`,
    mueble: `${dir}mueble.json`,
    informe: `${dir}informe.json`,
  };
}

/** Un path que el navegador puede subir directo al almacenamiento: `modelo.dae` o `listado.csv` de un importId válido. */
export const UPLOAD_PATH = /^importaciones\/([0-9a-f]{16})\/(modelo\.dae|listado\.csv)$/;

export function newImportId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
