// Análisis en el navegador (spike): CSV + .dae → listado y cruce. Sin node:crypto (P2): `modelIdBrowser` y
// `observeDaeWithId`. Lo usan la pantalla de subida (antes de subir) y la de revisión (recalcula desde los archivos
// guardados y lo compara con lo registrado). En la versión real el cruce lo calculará el servidor (§3).

import { modelIdBrowser } from "@/model/modelIdBrowser";
import { observeDaeWithId } from "@/model/observeCore";
import type { Estado, Evento, ProtoInforme } from "./api";
import { parseOclCsv, type CsvParse } from "./parse";
import { reviewListing, summarizeReview, type Review } from "./review";

export const TOLERANCE_MM = 2;

export type Analysis =
  | { ok: false; stage: "csv"; rejection: Extract<CsvParse, { ok: false }> }
  | { ok: false; stage: "dae"; message: string }
  | { ok: true; parse: Extract<CsvParse, { ok: true }>; review: Review; modelId: string };

export async function analyze(csvText: string, daeBytes: Uint8Array): Promise<Analysis> {
  const parse = parseOclCsv(csvText);
  if (!parse.ok) return { ok: false, stage: "csv", rejection: parse };
  try {
    const modelId = await modelIdBrowser(daeBytes);
    const dae = observeDaeWithId(daeBytes, modelId);
    return { ok: true, parse, review: reviewListing(parse.listing, dae, TOLERANCE_MM), modelId };
  } catch (error) {
    return {
      ok: false,
      stage: "dae",
      message: `No se pudo leer el .dae (${error instanceof Error ? error.message : String(error)}). Exportalo de nuevo desde SketchUp como COLLADA (.dae).`,
    };
  }
}

export interface LoadedCarga {
  informe: ProtoInforme;
  eventos: Evento[];
  estado: Estado;
  analysis: Analysis;
  /** El cruce recalculado ahora no es el que se guardó al registrar (o el .dae cambió): no se confía en la carga. */
  mismatch: string | null;
}

export async function loadCarga(id: string): Promise<LoadedCarga> {
  const res = await fetch(`/api/proto-csv/${id}`, { cache: "no-store" });
  if (res.status === 404) throw new Error("No existe esa carga (puede haberse borrado o no terminó de registrarse).");
  if (!res.ok) throw new Error(`No se pudo leer la carga (error ${res.status}).`);
  const { informe, eventos, estado } = (await res.json()) as { informe: ProtoInforme; eventos: Evento[]; estado: Estado };

  const [csvRes, daeRes] = await Promise.all([fetch(`/api/proto-csv/${id}/archivo/listado.csv`), fetch(`/api/proto-csv/${id}/archivo/modelo.dae`)]);
  if (!csvRes.ok || !daeRes.ok) throw new Error("No se pudieron leer los archivos de la carga.");
  const analysis = await analyze(await csvRes.text(), new Uint8Array(await daeRes.arrayBuffer()));

  let mismatch: string | null = null;
  if (!analysis.ok) mismatch = "Los archivos guardados ya no se pueden leer.";
  else if (analysis.modelId !== informe.modelId) mismatch = "El .dae guardado no es el registrado (modelId distinto).";
  else if (JSON.stringify(summarizeReview(analysis.review)) !== JSON.stringify(informe.cruce)) mismatch = "El cruce recalculado no coincide con el registrado.";
  return { informe, eventos, estado, analysis, mismatch };
}
