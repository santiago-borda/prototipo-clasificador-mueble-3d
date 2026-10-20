// Almacenamiento de las importaciones (R7). La interfaz es mínima a propósito: la usan los handlers de ruta y
// tiene tres implementaciones: Vercel Blob (`blobStore.ts`), disco local para desarrollo y memoria para las pruebas.
// Nunca se sobrescribe: `put` sobre un path que ya existe falla.

import fs from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  body: Uint8Array;
}

export interface ImportStore {
  put(pathname: string, body: string | Uint8Array, contentType: string): Promise<void>;
  /** null si no existe. */
  get(pathname: string): Promise<StoredFile | null>;
  /** Paths que empiezan con el prefijo. */
  list(prefix: string): Promise<string[]>;
  /** Borra los paths dados; los que no existen se ignoran. */
  delete(pathnames: string[]): Promise<void>;
}

const toBytes = (body: string | Uint8Array) => (typeof body === "string" ? new TextEncoder().encode(body) : body);

export function createMemoryStore(): ImportStore {
  const files = new Map<string, Uint8Array>();
  return {
    async put(pathname, body) {
      if (files.has(pathname)) throw new Error(`Ya existe ${pathname}: no se sobrescribe.`);
      files.set(pathname, new Uint8Array(toBytes(body)));
    },
    async get(pathname) {
      const body = files.get(pathname);
      return body ? { body: new Uint8Array(body) } : null;
    },
    async list(prefix) {
      return [...files.keys()].filter((p) => p.startsWith(prefix));
    },
    async delete(pathnames) {
      for (const p of pathnames) files.delete(p);
    },
  };
}

const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/;

/** Disco local (`.import-data/`, ignorada por git), solo para desarrollo. Rechaza paths que se salgan de la carpeta. */
export function createLocalStore(root: string): ImportStore {
  const resolve = (pathname: string) => {
    if (!SAFE_PATH.test(pathname) || pathname.startsWith("/") || pathname.split("/").includes("..")) {
      throw new Error(`Path no permitido: ${pathname}`);
    }
    return path.join(root, ...pathname.split("/"));
  };

  async function walk(dir: string, base: string): Promise<string[]> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found: string[] = [];
    for (const entry of entries) {
      const rel = `${base}${entry.name}`;
      if (entry.isDirectory()) found.push(...(await walk(path.join(dir, entry.name), `${rel}/`)));
      else found.push(rel);
    }
    return found;
  }

  return {
    async put(pathname, body) {
      const file = resolve(pathname);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, toBytes(body), { flag: "wx" }); // "wx": falla si ya existe
    },
    async get(pathname) {
      const file = resolve(pathname);
      try {
        return { body: new Uint8Array(await fs.readFile(file)) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async list(prefix) {
      return (await walk(root, "")).filter((p) => p.startsWith(prefix));
    },
    async delete(pathnames) {
      for (const p of pathnames) await fs.rm(resolve(p), { force: true });
    },
  };
}
