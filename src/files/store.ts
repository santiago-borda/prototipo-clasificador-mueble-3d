// S3 (docs/spec-s3-almacenamiento-archivos.md v0.2): interfaz única para guardar bytes, con adaptadores de memoria,
// disco local y Vercel Blob. Nunca se sobrescribe. Puro: sin `@vercel/blob`, `next/*` ni `node:*` (F9).
//
// v0.2 (S3-D1 enmendada): `ImportStore` (src/importer/store.ts) NO se toca: el importador de prueba sigue con sus
// adaptadores. Unificar los dos (la parada U-alias de la v0.1) queda como propuesta.

export interface StoredBytes {
  body: Uint8Array;
}

export interface FileStore {
  /** Falla con `YaExisteError` si la clave existe: nunca se sobrescribe. */
  put(pathname: string, body: string | Uint8Array, contentType: string): Promise<void>;
  /** null si no existe. */
  get(pathname: string): Promise<StoredBytes | null>;
  /** Claves que empiezan con el prefijo. */
  list(prefix: string): Promise<string[]>;
  /** Borra las claves dadas; las que no existen se ignoran. */
  delete(pathnames: string[]): Promise<void>;
}

export const toBytes = (body: string | Uint8Array): Uint8Array => (typeof body === "string" ? new TextEncoder().encode(body) : body);
