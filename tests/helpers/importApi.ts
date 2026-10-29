import fs from "node:fs";
import path from "node:path";
import { createImportApi } from "@/importer/api";
import { importPaths } from "@/importer/paths";
import { createMemoryStore, type ImportStore } from "@/importer/store";
import { LISTADO_M01, readFixture } from "./csv";

export const KEY = "clave-de-prueba";
export const OLMO_DAE = fs.readFileSync(path.join(__dirname, "..", "..", "public", "models", "Olmo", "olmo.dae"));
export const DIMS_MM = { x: 1200, y: 750, z: 571 };

/** importId de 16 hex distinto para cada número; `n` va en los primeros 8 dígitos, que forman el prefijo del qrId. */
export const idFor = (n: number) => `${n.toString(16).padStart(8, "0")}00000000`;

export function newApi(overrides: { store?: ImportStore; now?: () => Date } = {}) {
  const store = overrides.store ?? createMemoryStore();
  const api = createImportApi({ store, uploadKey: KEY, now: overrides.now });
  return { store, api };
}

/** Lo que el navegador deja en el almacenamiento antes de registrar: el .dae y el CSV tal cual. */
export async function seedUpload(
  store: ImportStore,
  importId: string,
  { csv = readFixture(LISTADO_M01), dae = OLMO_DAE as Uint8Array | string }: { csv?: string | Uint8Array; dae?: string | Uint8Array } = {},
) {
  const paths = importPaths(importId);
  await store.put(paths.dae, dae, "model/vnd.collada+xml");
  await store.put(paths.csv, csv, "text/csv");
}

export function request(method: string, url: string, { key, body }: { key?: string | null; body?: unknown } = {}): Request {
  const headers: Record<string, string> = {};
  if (key) headers["x-import-key"] = key;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

export const registerBody = (importId: string, extra: Record<string, unknown> = {}) => ({
  importId,
  dimsMm: DIMS_MM,
  nombres: { dae: "olmo.dae", csv: "listado.csv" },
  ...extra,
});

/** Sube y registra una importación de Olmo por el camino normal. */
export async function registerOlmo(api: ReturnType<typeof newApi>["api"], store: ImportStore, importId: string) {
  await seedUpload(store, importId);
  return api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(importId) }));
}
