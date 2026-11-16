// API del spike según las variables de entorno. Solo servidor. Usa el mismo store y la misma clave que el importador
// (BLOB_READ_WRITE_TOKEN o IMPORT_STORE=local, e IMPORT_UPLOAD_KEY); el aislamiento lo da `scopedStore` (P3).

import { importStoreFromEnv } from "@/importer/config";
import { createProtoApi, type ProtoApi } from "./api";

type Env = Record<string, string | undefined>;

export function protoApiFromEnv(env: Env): ProtoApi {
  return createProtoApi({ store: importStoreFromEnv(env), uploadKey: env.IMPORT_UPLOAD_KEY || undefined });
}
