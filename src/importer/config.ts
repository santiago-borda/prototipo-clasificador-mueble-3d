// Arma la API del importador según las variables de entorno (R9). Solo servidor.
//   IMPORT_UPLOAD_KEY       clave compartida de escritura
//   BLOB_READ_WRITE_TOKEN   la crea Vercel al conectar el store de Blob
//   IMPORT_STORE=local      disco local (`.import-data/`) en vez de Blob; solo fuera de producción
// Sin clave o sin almacenamiento la API queda "sin configurar": la escritura responde 503 y nada más cambia.

import path from "node:path";
import { createImportApi, type ImportApi } from "./api";
import { createBlobStore } from "./blobStore";
import { createLocalStore, type ImportStore } from "./store";

type Env = Record<string, string | undefined>;

export const LOCAL_STORE_DIR = ".import-data";

export function importStoreFromEnv(env: Env): ImportStore | undefined {
  if (env.IMPORT_STORE === "local" && env.NODE_ENV !== "production") {
    return createLocalStore(path.resolve(process.cwd(), LOCAL_STORE_DIR));
  }
  if (env.BLOB_READ_WRITE_TOKEN) return createBlobStore(env.BLOB_READ_WRITE_TOKEN);
  return undefined;
}

export function importApiFromEnv(env: Env): ImportApi {
  return createImportApi({ store: importStoreFromEnv(env), uploadKey: env.IMPORT_UPLOAD_KEY || undefined });
}
