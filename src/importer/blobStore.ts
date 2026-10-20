// ImportStore sobre Vercel Blob privado (@vercel/blob: put/get/list/del con `access: "private"`).
// No tiene prueba automática (necesita el servicio): se verifica a mano al desplegar (I13).

import { del, get, list, put } from "@vercel/blob";
import type { ImportStore } from "./store";

export function createBlobStore(token?: string): ImportStore {
  return {
    async put(pathname, body, contentType) {
      await put(pathname, typeof body === "string" ? body : Buffer.from(body), {
        access: "private",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
        token,
      });
    },
    async get(pathname) {
      // useCache: false -> lee del origen; si no, un borrado reciente podría seguir sirviéndose desde la CDN.
      const result = await get(pathname, { access: "private", useCache: false, token });
      if (!result || result.statusCode !== 200) return null;
      return { body: new Uint8Array(await new Response(result.stream).arrayBuffer()) };
    },
    async list(prefix) {
      const paths: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, token });
        paths.push(...page.blobs.map((blob) => blob.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return paths;
    },
    async delete(pathnames) {
      if (pathnames.length > 0) await del(pathnames, { token });
    },
  };
}
