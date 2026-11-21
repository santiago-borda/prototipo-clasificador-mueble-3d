// S3-D8: adaptador de disco local (`.file-data/`, ignorada por git), solo fuera de producción. Rechaza rutas que se
// salen de su carpeta (F7). Misma lógica que `createLocalStore` del importador, con `YaExisteError`.

import fs from "node:fs/promises";
import path from "node:path";
import { ClaveInvalidaError, YaExisteError } from "./errors";
import { toBytes, type FileStore } from "./store";

const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/;

export function createLocalFileStore(root: string): FileStore {
  const resolve = (pathname: string) => {
    const partes = pathname.split("/");
    if (!SAFE_PATH.test(pathname) || pathname.startsWith("/") || partes.includes("..") || partes.includes(".") || partes.includes("")) {
      throw new ClaveInvalidaError(`ruta no permitida (${pathname.slice(0, 80)})`);
    }
    return path.join(root, ...partes);
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
      try {
        await fs.writeFile(file, toBytes(body), { flag: "wx" }); // "wx": falla si ya existe
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new YaExisteError(pathname);
        throw error;
      }
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
      return (await walk(root, "")).filter((p) => p.startsWith(prefix)).sort();
    },
    async delete(pathnames) {
      for (const p of pathnames) await fs.rm(resolve(p), { force: true });
    },
  };
}
