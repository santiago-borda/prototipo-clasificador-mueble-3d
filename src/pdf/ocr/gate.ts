// Compuerta de procesamiento externo (docs/spec-fixture-sintetico.md §6; spec-extraccion §8 y §9).
// Corre ANTES de cualquier llamada de red. Decide solo por sha256: ningún nombre de archivo, metadato ni leyenda
// habilita un envío. Solo para el servidor o scripts (usa node:crypto).

import { createHash } from "node:crypto";

/** Hashes con la forma de `pdfId`: "sha256:" + hex. */
export interface GateLists {
  /** Sale del manifiesto del fixture sintético. */
  synthetic: ReadonlySet<string>;
  /** Lista blanca real: vive fuera del repo y arranca vacía. */
  whitelist: ReadonlySet<string>;
}

export type GateDecision = { ok: true; pdfId: string; via: "sintetico" | "lista-blanca" } | { ok: false; pdfId: string; motivo: string };

/** La bandera en desuso: si está definida, la compuerta no decide y falla cerrada. */
export class BanderaEnDesusoError extends Error {
  constructor() {
    super("PERMITIR_DATOS_REALES está en desuso: usar PROCESAMIENTO_EXTERNO=permitir. No se envía nada mientras esté definida.");
    this.name = "BanderaEnDesusoError";
  }
}

export const pdfIdOf = (pdf: Uint8Array): string => `sha256:${createHash("sha256").update(pdf).digest("hex")}`;

export function puedeEnviar(pdf: Uint8Array, env: Readonly<Record<string, string | undefined>>, lists: GateLists): GateDecision {
  if (env.PERMITIR_DATOS_REALES !== undefined) throw new BanderaEnDesusoError();
  const pdfId = pdfIdOf(pdf);
  if (lists.synthetic.has(pdfId)) return { ok: true, pdfId, via: "sintetico" };
  if (env.PROCESAMIENTO_EXTERNO !== "permitir") return { ok: false, pdfId, motivo: "Falta PROCESAMIENTO_EXTERNO=permitir y el PDF no es del fixture sintético." };
  if (!lists.whitelist.has(pdfId)) return { ok: false, pdfId, motivo: "El sha256 del PDF no está en la lista blanca." };
  return { ok: true, pdfId, via: "lista-blanca" };
}
