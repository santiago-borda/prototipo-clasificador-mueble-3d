// C14 (docs/spec-proto-csv-ocl.md §5, commit P2): mismos bytes → misma DaeObservation por la vía de Node
// (`observeDae`, node:crypto) y por la vía del navegador (`observeDaeWithId` + `modelIdBrowser`, Web Crypto).
// La "vía del navegador" se corre acá en jsdom: es el mismo código que importa el navegador (sin node:crypto, probado
// abajo), pero no es un navegador real; M1 (manual, en la preview) lo cubre con uno.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { modelId } from "@/engine/hash";
import { modelIdBrowser } from "@/model/modelIdBrowser";
import { observeDae } from "@/model/observe";
import { observeDaeWithId } from "@/model/observeCore";
import { buildDae, enc } from "../helpers/daeBuilder";

const ROOT = path.resolve(__dirname, "..", "..");
const OLMO = path.join(ROOT, "public", "models", "Olmo", "olmo.dae");
const GABINETE = path.join(ROOT, "tests", "fixtures", "csv-ocl", "gabinete", "gabinete-prueba-opencutlist.dae");

const withCrlf = (bytes: Uint8Array): Uint8Array => {
  const out: number[] = [];
  for (const b of bytes) {
    if (b === 0x0a) out.push(0x0d);
    out.push(b);
  }
  return new Uint8Array(out);
};

async function viaBrowser(bytes: Uint8Array) {
  return observeDaeWithId(bytes, await modelIdBrowser(bytes));
}

const sinteticos = (): [string, Uint8Array][] => [
  ["sintético con canto", enc(buildDae({ panels: [{ name: "_9999-01-M01-C01", sizeMm: [500, 300, 18], atMm: [0, 0, 0], cantoFaces: ["y-", "y+"] }] }))],
  ["sintético sin canto", enc(buildDae({ panels: [{ name: "_9999-01-M01-C02", sizeMm: [300, 500, 18], atMm: [10, 0, 0] }] }))],
];

describe("C14: observeDae (Node) = observeDaeWithId + modelIdBrowser (Web Crypto)", () => {
  it("modelIdBrowser = modelId de @/engine/hash (con y sin \r\n)", async () => {
    for (const [name, bytes] of sinteticos()) {
      expect(await modelIdBrowser(bytes), name).toBe(modelId(bytes));
      expect(await modelIdBrowser(withCrlf(bytes)), `${name} con CRLF`).toBe(modelId(bytes));
    }
  });

  it.each(sinteticos())("misma DaeObservation: %s", async (_name, bytes) => {
    expect(await viaBrowser(bytes)).toEqual(observeDae(bytes));
  });

  it("con \r\n en los bytes: mismo modelId y misma observación por las dos vías", async () => {
    for (const [, bytes] of sinteticos()) {
      const crlf = withCrlf(bytes);
      const node = observeDae(crlf);
      expect(await viaBrowser(crlf)).toEqual(node);
      expect(node.modelId).toBe(observeDae(bytes).modelId);
    }
  });

  it("primer fixture real (Olmo): 39 observaciones iguales", async () => {
    const bytes = new Uint8Array(readFileSync(OLMO));
    const node = observeDae(bytes);
    expect(node.observations).toHaveLength(39);
    expect(await viaBrowser(bytes)).toEqual(node);
  });

  it("gabinete de prueba (csv-ocl): iguales", async () => {
    const bytes = new Uint8Array(readFileSync(GABINETE));
    expect(await viaBrowser(bytes)).toEqual(observeDae(bytes));
  });

  it("observeCore.ts y modelIdBrowser.ts no importan node:crypto ni @/engine/hash (corren en el navegador)", () => {
    for (const file of ["observeCore.ts", "modelIdBrowser.ts"]) {
      const src = readFileSync(path.join(ROOT, "src", "model", file), "utf8");
      expect(src, file).not.toMatch(/from\s+["'](node:crypto|crypto|@\/engine\/hash|\.\.?\/.*hash)["']/);
    }
  });
});
