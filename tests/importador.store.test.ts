// R7: el ImportStore tiene tres implementaciones (Blob, disco local, memoria). Contrato común para las dos que
// se pueden probar sin red. La de Blob no se prueba acá (necesita el servicio): se verifica a mano (I13).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createLocalStore, createMemoryStore, type ImportStore } from "@/importer/store";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "import-store-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe.each([
  ["memoria", () => createMemoryStore()],
  ["disco local", () => createLocalStore(fs.mkdtempSync(path.join(tmp, "s-")))],
] as [string, () => ImportStore][])("ImportStore (%s)", (_name, make) => {
  it("guarda y lee texto y bytes", async () => {
    const store = make();
    await store.put("importaciones/a/x.json", '{"ñ":1}', "application/json");
    await store.put("importaciones/a/y.bin", new Uint8Array([0, 255, 7]), "application/octet-stream");
    expect(text((await store.get("importaciones/a/x.json"))!.body)).toBe('{"ñ":1}');
    expect(Array.from((await store.get("importaciones/a/y.bin"))!.body)).toEqual([0, 255, 7]);
  });

  it("devuelve null si no existe", async () => {
    expect(await make().get("importaciones/a/no-esta")).toBeNull();
  });

  it("nunca sobrescribe: guardar dos veces el mismo path falla", async () => {
    const store = make();
    await store.put("importaciones/a/x", "uno", "text/plain");
    await expect(store.put("importaciones/a/x", "dos", "text/plain")).rejects.toThrow();
    expect(text((await store.get("importaciones/a/x"))!.body)).toBe("uno");
  });

  it("lista por prefijo", async () => {
    const store = make();
    await store.put("importaciones/a/1", "x", "text/plain");
    await store.put("importaciones/a/2", "x", "text/plain");
    await store.put("importaciones/b/1", "x", "text/plain");
    expect((await store.list("importaciones/a/")).sort()).toEqual(["importaciones/a/1", "importaciones/a/2"]);
    expect(await store.list("importaciones/zzz/")).toEqual([]);
    expect(await store.list("importaciones/")).toHaveLength(3);
  });

  it("borra varios paths y tolera los que no existen", async () => {
    const store = make();
    await store.put("importaciones/a/1", "x", "text/plain");
    await store.put("importaciones/a/2", "x", "text/plain");
    await store.delete(["importaciones/a/1", "importaciones/a/no-esta"]);
    expect(await store.list("importaciones/a/")).toEqual(["importaciones/a/2"]);
  });
});

describe("ImportStore (disco local): no sale de su carpeta", () => {
  it.each(["../fuera", "importaciones/../../fuera", "/absoluto", "C:\\x"])("rechaza el path %s", async (p) => {
    const store = createLocalStore(fs.mkdtempSync(path.join(tmp, "s-")));
    await expect(store.put(p, "x", "text/plain")).rejects.toThrow();
    await expect(store.get(p)).rejects.toThrow();
  });
});
