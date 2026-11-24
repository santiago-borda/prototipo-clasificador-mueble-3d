// S3: adaptador en memoria (pruebas y desarrollo). Puro (F9). `bytesCrudos` deja alterar un objeto en PF-6.

import { YaExisteError } from "./errors";
import { toBytes, type FileStore } from "./store";

export interface MemoryFileStore extends FileStore {
  /** Solo para pruebas: el arreglo guardado (modificarlo simula un almacenamiento que alteró el archivo). */
  bytesCrudos(pathname: string): Uint8Array | undefined;
}

export function createMemoryFileStore(): MemoryFileStore {
  const files = new Map<string, Uint8Array>();
  return {
    async put(pathname, body) {
      if (files.has(pathname)) throw new YaExisteError(pathname);
      files.set(pathname, new Uint8Array(toBytes(body)));
    },
    async get(pathname) {
      const body = files.get(pathname);
      return body ? { body: new Uint8Array(body) } : null;
    },
    async list(prefix) {
      return [...files.keys()].filter((p) => p.startsWith(prefix)).sort();
    },
    async delete(pathnames) {
      for (const p of pathnames) files.delete(p);
    },
    bytesCrudos: (pathname) => files.get(pathname),
  };
}
