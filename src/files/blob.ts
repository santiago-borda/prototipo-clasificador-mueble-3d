// S3: adaptador de Vercel Blob privado. El cliente se inyecta (las pruebas usan uno falso, sin red); por defecto, el
// de `@vercel/blob`, con el token de BLOB_READ_WRITE_TOKEN si no se pasa otro. Mismas opciones que el importador:
// `access: "private"`, sin sufijo al azar, sin sobrescribir, y lectura del origen (sin caché de la CDN).

import { del, get, list, put } from "@vercel/blob";
import { YaExisteError } from "./errors";
import type { FileStore } from "./store";

/** Lo que el adaptador usa de `@vercel/blob`. */
export interface BlobClient {
  put: typeof put;
  get: typeof get;
  list: typeof list;
  del: typeof del;
}

const CLIENTE_REAL: BlobClient = { put, get, list, del };

/**
 * ¿El error de `put` dice que la clave ya existe? Con `allowOverwrite: false` el servicio responde `bad_request` y
 * `@vercel/blob` lanza un `BlobError` con el mensaje del servicio («This blob already exists…»): ASUMIDO por el texto,
 * a verificar en la primera prueba manual (S3-I4).
 */
function esYaExiste(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message);
}

export function createBlobFileStore(opciones: { token?: string; client?: BlobClient } = {}): FileStore {
  const { token } = opciones;
  const c = opciones.client ?? CLIENTE_REAL;
  return {
    async put(pathname, body, contentType) {
      try {
        await c.put(pathname, typeof body === "string" ? body : Buffer.from(body), {
          access: "private",
          contentType,
          addRandomSuffix: false,
          allowOverwrite: false,
          token,
        });
      } catch (error) {
        if (esYaExiste(error)) throw new YaExisteError(pathname);
        throw error;
      }
    },
    async get(pathname) {
      const result = await c.get(pathname, { access: "private", useCache: false, token });
      if (!result || result.statusCode !== 200) return null;
      return { body: new Uint8Array(await new Response(result.stream).arrayBuffer()) };
    },
    async list(prefix) {
      const paths: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await c.list({ prefix, cursor, token });
        paths.push(...page.blobs.map((blob) => blob.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return paths.sort();
    },
    async delete(pathnames) {
      if (pathnames.length > 0) await c.del(pathnames, { token });
    },
  };
}
