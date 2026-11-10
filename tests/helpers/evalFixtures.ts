// Casos del eval armados a mano para tests/eval/ (docs/spec-t11-harness-minimo.md §4). Sin datos reales ni archivos del repo:
// los `furnitureId` son etiquetas ("olmo" = caso del repo, "sabrina" = segundo fixture) y los códigos son los de ejemplo 9999.

import { buildRealCase, type RealCase } from "../../eval/cases";
import type { DaeObservation } from "@/model/observe";
import type { ListedPiece, Listing } from "@/pdf/listing";
import { code, MODEL_ID, obs, params, row } from "./engineFixtures";

export type OkCase = Extract<RealCase, { status: "ok" }>;

const dae = (): DaeObservation => ({
  modelId: MODEL_ID,
  observations: [
    obs("_C01", { key: "ID1" }), // segura
    obs("_C02__", { key: "ID2" }), // anómala → dudosa
    obs("_C03", { key: "ID3" }), // segura
    obs(null, { key: "ID4" }), // malla suelta → sin-asociar
  ],
  lineObjects: 0,
  referenceBoxMm: { min: [0, 0, 0], max: [1, 1, 1] },
});

export const piece = (short: string, quantity: number): ListedPiece => ({ ...row(short, quantity), edgeBanding: [], rows: [] });

export function listingOf(furnitureId: string, status: "publicable" | "borrador", pieces: ListedPiece[] = [piece("C01", 1), piece("C02", 1), piece("C03", 1)]): Listing {
  if (status === "publicable") return { status, furnitureId, pieces, excluded: [], unkeyedRows: [] };
  return { status, furnitureId, pieces, excluded: [{ code: code("C09"), reasons: ["campo-pendiente"], rows: [] }], unkeyedRows: [] };
}

/** Caso real `ok` con 2 seguras, 1 dudosa (nombre anómalo) y 1 malla suelta. */
export function okCase(furnitureId: string, status: "publicable" | "borrador" = "publicable"): OkCase {
  const built = buildRealCase({ furnitureId, listing: listingOf(furnitureId, status), dae: dae(), toleranceMm: params.toleranceMm });
  if (built.status !== "ok") throw new Error(`el caso de prueba no corrió: ${built.motivo}`);
  return built;
}

export { dae as daeFixture };
