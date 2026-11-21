// S3-I1 (docs/spec-s3-almacenamiento-archivos.md v0.2): el almacén de la integración con el ERP (`Almacen`: el zip y
// el CSV de cada envío, por sha256) sobre `FileStore` + `stored_file`, en lugar de la tabla `file_content`. Solo
// servidor. Lo elige `FILE_STORE` (src/server/archivos.ts); sin esa variable, todo sigue en la base, como antes.

import { readFileBySha256, saveFile, type FileDeps } from "./usecases";

/** La misma forma que `Almacen` de src/persistence/ports.ts (src/files no la importa: PB-13). */
export interface AlmacenDeArchivos {
  guardar(tenantId: string, sha256: string, datos: Uint8Array): Promise<void>;
  leer(tenantId: string, sha256: string): Promise<Uint8Array | null>;
}

const ZIP = [0x50, 0x4b];

/** Clase del archivo del envío: el modelo es un zip; el otro, el CSV de piezas (IE-7). */
const claseDe = (datos: Uint8Array) => (datos[0] === ZIP[0] && datos[1] === ZIP[1] ? ({ kind: "zip", contentType: "application/zip", nombre: "modelo.zip" } as const) : ({ kind: "csv", contentType: "text/csv", nombre: "piezas.csv" } as const));

export function createFileAlmacen(deps: FileDeps): AlmacenDeArchivos {
  return {
    async guardar(tenantId, sha256, datos) {
      const clase = claseDe(datos);
      await saveFile(deps, tenantId, { kind: clase.kind, contentType: clase.contentType, originalName: clase.nombre, body: datos, uploadedBy: "erp", expectedSha256: sha256 });
    },
    async leer(tenantId, sha256) {
      const leido = await readFileBySha256(deps, tenantId, sha256.toLowerCase());
      return leido ? leido.body : null;
    },
  };
}
