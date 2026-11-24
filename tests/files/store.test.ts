// @vitest-environment node
// S3 PF-1, PF-2 y PF-8 (docs/spec-s3-almacenamiento-archivos.md v0.2): una batería de contrato de `FileStore` contra
// los tres adaptadores: memoria, disco local (carpeta temporal) y Vercel Blob con un cliente falso (sin red).

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createBlobFileStore, type BlobClient } from "@/files/blob";
import { ClaveInvalidaError, YaExisteError } from "@/files/errors";
import { createLocalFileStore } from "@/files/local";
import { createMemoryFileStore } from "@/files/memory";
import type { FileStore } from "@/files/store";

const texto = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : null);

/** Cliente de Vercel Blob falso, en memoria, con los mensajes del servicio (ASUMIDO para «already exists», S3-I4). */
function clienteFalso(): BlobClient & { llamadas: string[] } {
  const blobs = new Map<string, Uint8Array>();
  const llamadas: string[] = [];
  const cliente = {
    llamadas,
    put: (async (pathname: string, body: unknown, opciones: { allowOverwrite?: boolean; access?: string }) => {
      llamadas.push(`put ${pathname} ${opciones.access}`);
      if (blobs.has(pathname) && !opciones.allowOverwrite) throw new Error("Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.");
      blobs.set(pathname, typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body as Buffer));
      return { pathname };
    }) as unknown as BlobClient["put"],
    get: (async (pathname: string) => {
      const b = blobs.get(pathname);
      if (!b) return null;
      return { statusCode: 200, stream: new Response(b.slice()).body };
    }) as unknown as BlobClient["get"],
    list: (async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
      const todos = [...blobs.keys()].filter((p) => p.startsWith(prefix)).sort();
      // Dos por página, para probar la paginación.
      const desde = cursor ? Number(cursor) : 0;
      const pagina = todos.slice(desde, desde + 2);
      const hasMore = desde + 2 < todos.length;
      return { blobs: pagina.map((pathname) => ({ pathname })), hasMore, cursor: hasMore ? String(desde + 2) : undefined };
    }) as unknown as BlobClient["list"],
    del: (async (pathnames: string[]) => {
      for (const p of pathnames) blobs.delete(p);
    }) as unknown as BlobClient["del"],
  };
  return cliente;
}

const temporales: string[] = [];
afterAll(() => {
  for (const d of temporales) rmSync(d, { recursive: true, force: true });
});

function bateria(nombre: string, crear: () => FileStore) {
  describe(`FileStore: ${nombre}`, () => {
    it("PF-1: put dos veces en la misma clave → YaExisteError; queda el primero", async () => {
      const s = crear();
      await s.put("t/a/archivos/x", "primero", "text/plain");
      await expect(s.put("t/a/archivos/x", "segundo", "text/plain")).rejects.toThrow(YaExisteError);
      expect(texto((await s.get("t/a/archivos/x"))?.body)).toBe("primero");
    });

    it("PF-2: get de una clave que no existe → null; list por prefijo; delete de algo que no existe no falla", async () => {
      const s = crear();
      expect(await s.get("t/a/archivos/no")).toBeNull();
      await s.put("t/a/archivos/1", new Uint8Array([1]), "application/octet-stream");
      await s.put("t/a/archivos/2", new Uint8Array([2]), "application/octet-stream");
      await s.put("t/a/archivos/3", new Uint8Array([3]), "application/octet-stream");
      await s.put("t/b/archivos/1", new Uint8Array([4]), "application/octet-stream");
      expect(await s.list("t/a/")).toEqual(["t/a/archivos/1", "t/a/archivos/2", "t/a/archivos/3"]);
      await s.delete(["t/a/archivos/2", "t/a/archivos/no-existe"]);
      expect(await s.list("t/a/")).toEqual(["t/a/archivos/1", "t/a/archivos/3"]);
      expect([...(await s.get("t/b/archivos/1"))!.body]).toEqual([4]);
    });
  });
}

bateria("memoria", createMemoryFileStore);
bateria("disco local", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pfg-files-"));
  temporales.push(dir);
  return createLocalFileStore(dir);
});
bateria("Vercel Blob (cliente falso)", () => createBlobFileStore({ client: clienteFalso() }));

describe("Vercel Blob: opciones", () => {
  it("guarda privado, sin sufijo al azar y sin sobrescribir", async () => {
    const c = clienteFalso();
    const espia: BlobClient = { ...c, put: ((p: string, b: unknown, o: Record<string, unknown>) => {
      expect(o).toMatchObject({ access: "private", addRandomSuffix: false, allowOverwrite: false });
      return c.put(p, b as string, o as never);
    }) as unknown as BlobClient["put"] };
    await createBlobFileStore({ client: espia }).put("t/a/archivos/x", "x", "text/csv");
    expect(c.llamadas).toEqual(["put t/a/archivos/x private"]);
  });
});

describe("PF-8 (F7): el adaptador local no sale de su carpeta", () => {
  it.each(["../afuera", "t/../../afuera", "/absoluta", "t/a b/x", "t//x", "t/./x", "t\\x", "t/ñ"])("%s → ClaveInvalidaError y nada escrito", async (clave) => {
    const dir = mkdtempSync(path.join(tmpdir(), "pfg-files-"));
    temporales.push(dir);
    const s = createLocalFileStore(path.join(dir, "raiz"));
    await expect(s.put(clave, "x", "text/plain")).rejects.toThrow(ClaveInvalidaError);
    expect(existsSync(path.join(dir, "afuera"))).toBe(false);
    expect(existsSync(path.join(dir, "raiz"))).toBe(false);
  });
});
