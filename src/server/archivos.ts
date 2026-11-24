// S3-I1 (docs/spec-s3-almacenamiento-archivos.md v0.2): dónde guarda la integración con el ERP los zip y CSV de cada
// envío. Solo servidor. Lo decide FILE_STORE:
//   (vacía)  en la base, tabla `file_content` (como hasta ahora; ASUMIDO hasta S3);
//   blob     Vercel Blob privado (token en BLOB_READ_WRITE_TOKEN) + fila en `stored_file`;
//   local    disco, `.file-data/` (ignorada por git) + fila en `stored_file`; no se acepta con NODE_ENV=production.
// Otro valor: `ConfigArchivosError` al armar las dependencias (no se adivina).

import path from "node:path";
import { createFileAlmacen, type LimitesAlmacen } from "@/files/almacen";
import { createBlobFileStore } from "@/files/blob";
import { createLocalFileStore } from "@/files/local";
import type { Almacen, Persistence } from "@/persistence/ports";

export const FILE_STORES = ["blob", "local"] as const;

export class ConfigArchivosError extends Error {
  constructor(detalle: string) {
    super(`FILE_STORE: ${detalle}.`);
    this.name = "ConfigArchivosError";
  }
}

/** Carpeta del adaptador local (S3-D8). */
export const CARPETA_LOCAL = ".file-data";

export function almacenDesdeEntorno(env: Record<string, string | undefined>, persistence: Persistence, limites: LimitesAlmacen = {}): Almacen {
  const modo = (env.FILE_STORE ?? "").trim();
  if (modo === "") return persistence.almacen;
  if (modo === "blob") return createFileAlmacen({ store: createBlobFileStore({ token: env.BLOB_READ_WRITE_TOKEN || undefined }), files: persistence.files }, limites);
  if (modo === "local") {
    if (env.NODE_ENV === "production") throw new ConfigArchivosError("«local» es solo para desarrollo (NODE_ENV=production)");
    return createFileAlmacen({ store: createLocalFileStore(path.resolve(process.cwd(), CARPETA_LOCAL)), files: persistence.files }, limites);
  }
  throw new ConfigArchivosError(`«${modo}» no es un valor válido (vacía, ${FILE_STORES.join(" o ")})`);
}
