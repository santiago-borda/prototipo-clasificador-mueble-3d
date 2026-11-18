// API del spike según las variables de entorno. Solo servidor. Usa el mismo store que el importador
// (BLOB_READ_WRITE_TOKEN o IMPORT_STORE=local), sin clave (v0.5); el aislamiento lo da `scopedStore` (P3).

import { importStoreFromEnv } from "@/importer/config";
import { createProtoApi, type ProtoApi } from "./api";

type Env = Record<string, string | undefined>;

export function protoApiFromEnv(env: Env): ProtoApi {
  return createProtoApi({ store: importStoreFromEnv(env) });
}
