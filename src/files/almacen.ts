// S3-I1 (docs/spec-s3-almacenamiento-archivos.md v0.2): el almacén de la integración con el ERP (`Almacen`: el zip y
// el CSV de cada envío, por sha256) sobre `FileStore` + `stored_file`, en lugar de la tabla `file_content`. Solo
// servidor. Lo elige `FILE_STORE` (src/server/archivos.ts); sin esa variable, todo sigue en la base, como antes.

import { readFileBySha256, saveFile, type FileDeps } from "./usecases";

/** La misma forma que `Almacen` de src/persistence/ports.ts (src/files no la importa: PB-13). */
export interface AlmacenDeArchivos {
  guardar(tenantId: string, sha256: string, datos: Uint8Array, clase?: "modelo" | "csv"): Promise<void>;
  leer(tenantId: string, sha256: string): Promise<Uint8Array | null>;
}

/** S3-I7: los topes de la integración (ERP_ZIP_MAX_BYTES, ERP_CSV_MAX_BYTES), para no rechazar acá lo que ya se aceptó. */
export interface LimitesAlmacen {
  zipMaxBytes?: number;
  csvMaxBytes?: number;
}

/**
 * Clase del archivo del envío (S3-I8, revisión del 21/11): la dice quien guarda (postTrabajo sabe cuál es el modelo y
 * cuál el CSV). Sin ella, por la firma: zip si empieza con «PK»; si no, CSV.
 */
function claseDe(datos: Uint8Array, clase: "modelo" | "csv" | undefined) {
  const esZip = clase ? clase === "modelo" : datos[0] === 0x50 && datos[1] === 0x4b;
  return esZip ? ({ kind: "zip", contentType: "application/zip", nombre: "modelo.zip" } as const) : ({ kind: "csv", contentType: "text/csv", nombre: "piezas.csv" } as const);
}

export function createFileAlmacen(deps: FileDeps, limites: LimitesAlmacen = {}): AlmacenDeArchivos {
  return {
    async guardar(tenantId, sha256, datos, clase) {
      const c = claseDe(datos, clase);
      const maxBytes = c.kind === "zip" ? limites.zipMaxBytes : limites.csvMaxBytes;
      await saveFile(deps, tenantId, { kind: c.kind, contentType: c.contentType, originalName: c.nombre, body: datos, uploadedBy: "erp", expectedSha256: sha256, maxBytes });
    },
    async leer(tenantId, sha256) {
      const leido = await readFileBySha256(deps, tenantId, sha256.toLowerCase());
      return leido ? leido.body : null;
    },
  };
}
