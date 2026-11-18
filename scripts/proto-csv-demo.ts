// Siembra cargas de demostración del spike CSV en el almacenamiento LOCAL (.import-data/, ignorado por git), una por
// estado, usando la misma API que las rutas. Solo para ver las pantallas en `next dev` con IMPORT_STORE=local.
// Solo el fixture del gabinete (sin datos de terceros). No usa red.
//
//   npx vite-node -c vitest.config.ts scripts/proto-csv-demo.ts
//   IMPORT_STORE=local IMPORT_UPLOAD_KEY=<la que elijas> npm run dev   →  /backoffice/csv/<id>

import { readFileSync } from "node:fs";
import path from "node:path";
import { installDom } from "../eval/dom";
import { modelId } from "@/engine/hash";
import { LOCAL_STORE_DIR } from "@/importer/config";
import { createLocalStore } from "@/importer/store";
import { observeDae } from "@/model/observe";
import { createProtoApi } from "@/proto-csv/api";
import { parseOclCsv } from "@/proto-csv/parse";
import { protoDir, protoPath } from "@/proto-csv/paths";
import { reviewListing, summarizeReview } from "@/proto-csv/review";

installDom();
const DIR = path.resolve("tests/fixtures/csv-ocl/gabinete");
const CSV = readFileSync(path.join(DIR, "gabinete-prueba-canto.csv"), "utf8");
const DAE = new Uint8Array(readFileSync(path.join(DIR, "gabinete-prueba-opencutlist.dae")));
const SVG = new Uint8Array(readFileSync(path.join(DIR, "diagrama-blanco18.svg")));
const KEY = "demo-local";
const enc = (t: string) => new TextEncoder().encode(t);

const store = createLocalStore(path.resolve(LOCAL_STORE_DIR));
const api = createProtoApi({ store, uploadKey: KEY });
const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "x-import-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body) });

/** Variante sintética del CSV real: C04 con Cantidad 2 (el .dae tiene 1): advertencia, se acepta con motivo. */
const CSV_ADVERTENCIA = CSV.replace(/^(A;0001-01-M01-C04;)1;/m, "$12;");
/** Variante sintética: C03 con nombre anómalo (excluido del listado): dudosa, solo se puede rechazar. */
const CSV_DUDOSA = CSV.replace(/^A;0001-01-M01-C03;/m, "A;_0001-01-M01-C03__;");

async function seed(id: string, csv: string, steps: { estado: string; motivo?: string }[]) {
  await store.delete(await store.list(protoDir(id)));
  await store.put(protoPath(id, "listado.csv"), enc(csv), "text/csv");
  await store.put(protoPath(id, "modelo.dae"), DAE, "model/vnd.collada+xml");
  await store.put(protoPath(id, "diagrama-blanco-18.svg"), SVG, "image/svg+xml");
  const parsed = parseOclCsv(csv);
  if (!parsed.ok) throw new Error(parsed.message);
  const cruce = summarizeReview(reviewListing(parsed.listing, observeDae(DAE), 2));
  const res = await api.register(post("/api/proto-csv", { id, modelId: modelId(DAE), cruce, svgMaterial: "Blanco 18", nombres: { csv: "gabinete-prueba-canto.csv", dae: "gabinete-prueba-opencutlist.dae" } }));
  if (res.status !== 201) throw new Error(`${id}: registro ${res.status} ${await res.text()}`);
  for (const step of steps) {
    const r = await api.changeState(post(`/api/proto-csv/${id}/estado`, step), id);
    if (!r.ok) throw new Error(`${id}: ${step.estado} ${r.status} ${await r.text()}`);
  }
  console.log(`${id}: ${["en-revision", ...steps.map((s) => s.estado)].join(" → ")} (dudosas: ${cruce.dudosas}, advertencias: ${cruce.advertencias})`);
}

await seed("a1a1a1a1a1a1a1a1", CSV, []);
await seed("b2b2b2b2b2b2b2b2", CSV_DUDOSA, []);
await seed("a7a7a7a7a7a7a7a7", CSV_ADVERTENCIA, []); // en revisión con advertencias (capturas HITL v0.4)
await seed("c3c3c3c3c3c3c3c3", CSV, [{ estado: "aprobado" }]);
await seed("d4d4d4d4d4d4d4d4", CSV, [{ estado: "aprobado" }, { estado: "publicado-simulado" }]);
await seed("e5e5e5e5e5e5e5e5", CSV_DUDOSA, [{ estado: "rechazado", motivo: "C03 con nombre anómalo en el CSV: reexportar" }]);
const incomplete = "f6f6f6f6f6f6f6f6";
await store.delete(await store.list(protoDir(incomplete)));
await store.put(protoPath(incomplete, "listado.csv"), enc(CSV), "text/csv");
console.log(`${incomplete}: incompleta (solo listado.csv, sin registrar)`);
