// @vitest-environment node
// S3 PF-3 a PF-7, PF-11 y PF-12 (docs/spec-s3-almacenamiento-archivos.md v0.2): claves, reglas por clase, casos de uso
// con sha256 y metadatos, y la frontera de imports de src/files. Sin red ni base (persistencia en memoria).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArchivoCorruptoError, ArchivoDemasiadoGrandeError, ArchivoNoEncontradoError, ClaveInvalidaError, Sha256DistintoError, TipoNoPermitidoError } from "@/files/errors";
import { fileKey } from "@/files/keys";
import { createMemoryFileStore } from "@/files/memory";
import { REGLAS, tipoReal } from "@/files/rules";
import { readFile, saveFile, type FileDeps } from "@/files/usecases";
import { createMemoryPersistence } from "@/persistence/memory";
import type { FileRepository } from "@/persistence/ports";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]);

async function entorno(files?: (r: FileRepository) => FileRepository) {
  const p = createMemoryPersistence();
  const a = await p.tenants.create({ name: "A", id: "carpinteria-a" });
  const b = await p.tenants.create({ name: "B", id: "carpinteria-b" });
  const store = createMemoryFileStore();
  let n = 0;
  const deps: FileDeps = { store, files: files ? files(p.files) : p.files, newId: () => `archivo-${++n}` };
  return { p, a: a.id, b: b.id, store, deps };
}

const imagen = (body: Uint8Array, contentType = "image/png", originalName = "foto.png") => ({ kind: "imagen" as const, contentType, originalName, body, uploadedBy: "prueba" });

describe("PF-3 (F3): fileKey", () => {
  it("t/<tenantId>/archivos/<sha256>", () => {
    expect(fileKey("carpinteria-a", "a".repeat(64))).toBe(`t/carpinteria-a/archivos/${"a".repeat(64)}`);
    expect(fileKey("5e1a0000-0000-4000-8000-0000000c0001", "0".repeat(64))).toMatch(/^t\/5e1a0000-0000-4000-8000-0000000c0001\/archivos\/0{64}$/);
  });
  it.each([
    ["", "a".repeat(64)],
    ["a/b", "a".repeat(64)],
    ["..", "a".repeat(64)],
    ["a b", "a".repeat(64)],
    ["carpinteria-a", "a".repeat(63)],
    ["carpinteria-a", "A".repeat(64)],
    ["carpinteria-a", `${"a".repeat(62)}/.`],
  ])("tenant «%s», sha256 «%s» → ClaveInvalidaError", (t, s) => {
    expect(() => fileKey(t, s)).toThrow(ClaveInvalidaError);
  });
});

describe("PF-7 (F6, S3-D6, S3-D7): reglas por clase y tipo real por los primeros bytes", () => {
  it("imagen de más de 5 MB → ArchivoDemasiadoGrandeError; un PDF declarado como imagen → TipoNoPermitidoError", () => {
    const grande = new Uint8Array(REGLAS.imagen.maxBytes + 1);
    grande.set(PNG);
    expect(() => tipoReal("imagen", "image/png", grande)).toThrow(ArchivoDemasiadoGrandeError);
    expect(() => tipoReal("imagen", "image/png", PDF)).toThrow(TipoNoPermitidoError);
  });
  it("un PNG declarado como JPEG se guarda como PNG; JPEG, PDF, zip y .dae por firma", () => {
    expect(tipoReal("imagen", "image/jpeg", PNG)).toBe("image/png");
    expect(tipoReal("imagen", "image/png", JPEG)).toBe("image/jpeg");
    expect(tipoReal("pdf", "application/pdf", PDF)).toBe("application/pdf");
    expect(tipoReal("zip", "application/octet-stream", ZIP)).toBe("application/zip");
    expect(tipoReal("modelo-dae", "text/xml", new TextEncoder().encode('﻿  <?xml version="1.0"?><COLLADA/>'))).toBe("model/vnd.collada+xml");
    expect(() => tipoReal("zip", "application/zip", PDF)).toThrow(TipoNoPermitidoError);
    expect(() => tipoReal("csv", "text/csv", new Uint8Array([0x41, 0, 0x42]))).toThrow(TipoNoPermitidoError);
  });
  it("F6: un archivo fuera de las reglas no deja nada escrito", async () => {
    const { a, store, p, deps } = await entorno();
    await expect(saveFile(deps, a, imagen(PDF, "image/png", "no-es.png"))).rejects.toThrow(TipoNoPermitidoError);
    expect(await store.list("t/")).toEqual([]);
    expect(await p.files.findBySha256(a, sha(PDF))).toBeNull();
  });
});

describe("saveFile / readFile", () => {
  it("guarda bytes y fila con el tipo real; lee con la integridad comprobada", async () => {
    const { a, store, deps } = await entorno();
    const meta = await saveFile(deps, a, imagen(PNG, "image/jpeg", "foto.jpg"));
    expect(meta).toMatchObject({ id: "archivo-1", sha256: sha(PNG), bytes: PNG.length, contentType: "image/png", kind: "imagen", originalName: "foto.jpg", storageKey: `t/${a}/archivos/${sha(PNG)}` });
    expect(await store.list("t/")).toEqual([meta.storageKey]);
    const leido = await readFile(deps, a, meta.id);
    expect(leido.meta).toEqual(meta);
    expect([...leido.body]).toEqual([...PNG]);
  });

  it("PF-4 (F3): lo guardado en A no se lee con B (ArchivoNoEncontradoError)", async () => {
    const { a, b, deps } = await entorno();
    const meta = await saveFile(deps, a, imagen(PNG));
    await expect(readFile(deps, b, meta.id)).rejects.toThrow(ArchivoNoEncontradoError);
  });

  it("PF-5 (F4): mismo contenido dos veces en A = un objeto y una fila; en B, otro objeto", async () => {
    const { a, b, store, deps } = await entorno();
    const x = await saveFile(deps, a, imagen(PNG));
    const y = await saveFile(deps, a, imagen(PNG, "image/png", "otra.png"));
    expect(y).toEqual(x);
    expect(await store.list(`t/${a}/`)).toHaveLength(1);
    const z = await saveFile(deps, b, imagen(PNG));
    expect(z.id).not.toBe(x.id);
    expect(await store.list(`t/${b}/`)).toEqual([`t/${b}/archivos/${sha(PNG)}`]);
  });

  it("PF-6 (F5): un byte alterado en el almacenamiento → ArchivoCorruptoError; bytes perdidos, también", async () => {
    const { a, store, deps } = await entorno();
    const meta = await saveFile(deps, a, imagen(PNG));
    store.bytesCrudos(meta.storageKey)![5] ^= 0xff;
    await expect(readFile(deps, a, meta.id)).rejects.toThrow(ArchivoCorruptoError);
    await store.delete([meta.storageKey]);
    await expect(readFile(deps, a, meta.id)).rejects.toThrow(ArchivoCorruptoError);
  });

  it("PF-12 (S3-D5): si falla la fila no queda fila, el error se propaga y un segundo intento funciona", async () => {
    let fallar = true;
    const { a, p, store, deps } = await entorno((r) => ({
      ...r,
      insert: async (t, f) => {
        if (fallar) throw new Error("la base no respondió");
        return r.insert(t, f);
      },
    }));
    await expect(saveFile(deps, a, imagen(PNG))).rejects.toThrow("la base no respondió");
    expect(await p.files.findBySha256(a, sha(PNG))).toBeNull();
    expect(await store.list("t/")).toHaveLength(1); // bytes sin fila: inofensivo
    fallar = false;
    const meta = await saveFile(deps, a, imagen(PNG));
    expect((await readFile(deps, a, meta.id)).body).toEqual(PNG);
  });

  it("S3-I3: con expectedSha256 distinto del calculado, Sha256DistintoError y nada escrito", async () => {
    const { a, store, deps } = await entorno();
    await expect(saveFile(deps, a, { ...imagen(PNG), expectedSha256: "0".repeat(64) })).rejects.toThrow(Sha256DistintoError);
    expect(await store.list("t/")).toEqual([]);
    expect((await saveFile(deps, a, { ...imagen(PNG), expectedSha256: sha(PNG).toUpperCase() })).sha256).toBe(sha(PNG));
  });
});

describe("revisión del 21/11 (S3-I7, S3-I8)", () => {
  it("S3-I8: la fila ya existe pero los bytes no están en ESTE almacén (cambió FILE_STORE): se vuelven a subir", async () => {
    const { a, p, deps } = await entorno();
    const meta = await saveFile(deps, a, imagen(PNG));
    const otroAlmacen = createMemoryFileStore(); // p. ej. de local a blob: la fila es la misma, los bytes no están
    const deps2: FileDeps = { ...deps, store: otroAlmacen };
    await expect(readFile(deps2, a, meta.id)).rejects.toThrow(ArchivoCorruptoError);
    expect(await saveFile(deps2, a, imagen(PNG))).toEqual(meta);
    expect(await otroAlmacen.list("t/")).toEqual([meta.storageKey]);
    expect((await readFile(deps2, a, meta.id)).body).toEqual(PNG);
    expect(await p.files.findBySha256(a, sha(PNG))).toEqual(meta); // una sola fila
  });

  it("S3-I7: maxBytes propio reemplaza al de la clase (en los dos sentidos)", () => {
    const zip = new Uint8Array(REGLAS.zip.maxBytes + 10);
    zip.set(ZIP);
    expect(() => tipoReal("zip", "application/zip", zip)).toThrow(ArchivoDemasiadoGrandeError);
    expect(tipoReal("zip", "application/zip", zip, REGLAS.zip.maxBytes + 10)).toBe("application/zip");
    expect(() => tipoReal("zip", "application/zip", ZIP, 3)).toThrow(ArchivoDemasiadoGrandeError);
  });

  it("zip con preámbulo (no empieza con «PK» pero trae el fin del directorio central): es zip", () => {
    const fin = [0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)];
    const conPreambulo = new Uint8Array([...new TextEncoder().encode("#!/bin/sh preámbulo\n"), ...fin]);
    expect(tipoReal("zip", "application/zip", conPreambulo)).toBe("application/zip");
    expect(() => tipoReal("zip", "application/zip", new TextEncoder().encode("no es un zip"))).toThrow(TipoNoPermitidoError);
  });
});

describe("PF-11 (F9): imports de src/files", () => {
  const DIR = path.resolve(__dirname, "..", "..", "src", "files");
  const puros = ["store.ts", "keys.ts", "rules.ts", "memory.ts", "meta.ts", "errors.ts"];
  it.each(puros)("%s no importa @vercel/blob, next/* ni node:*", (archivo) => {
    const src = readFileSync(path.join(DIR, archivo), "utf8");
    const specs = [...src.matchAll(/(?:from|import|require\()\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs.filter((s) => /^(@vercel\/blob|next(\/|$)|node:)/.test(s))).toEqual([]);
  });
  it("ningún archivo de src/files importa src/persistence (PB-13)", () => {
    for (const archivo of readdirSync(DIR)) {
      const src = readFileSync(path.join(DIR, archivo), "utf8");
      expect(src, archivo).not.toMatch(/["']@\/persistence/);
    }
  });
});
