// Identificadores congelados de las entradas del motor (spec-motor §3 y §5.1; §5.1 enmendada por
// docs/spec-adapter-observation-listadoid.md §2.1). Usa node:crypto: solo lo importan el eval y el servidor,
// nunca un archivo "use client" ni src/pdf/ (H10).

import { createHash } from "node:crypto";
import type { EdgeId } from "@/data/types";
import { isCode } from "./normalize";
import type { AssociationRun, EngineParams, ListadoEdgeBanding, ListadoRow } from "./types";

export type Sha256Id = `sha256:${string}`;

export type ListadoInvalidoMotivo =
  | "codigo-formato"
  | "codigo-repetido"
  | "numero-no-finito"
  | "medida-no-positiva"
  | "cantidad-no-entera"
  | "cantidad-no-positiva"
  | "canto-repetido"
  | "canto-desconocido";

/** El listado no cumple las aserciones de §2.2: se falla fuerte, no se corrige. */
export class ListadoInvalidoError extends Error {
  constructor(
    readonly code: string | null,
    readonly motivo: ListadoInvalidoMotivo,
  ) {
    super(`Listado inválido (${motivo})${code === null ? "" : `: ${code}`}`);
    this.name = "ListadoInvalidoError";
  }
}

const EDGE_IDS: readonly EdgeId[] = ["largo-A", "largo-B", "corto-A", "corto-B"] satisfies readonly EdgeId[];

const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (data: Uint8Array | string): Sha256Id => `sha256:${createHash("sha256").update(data).digest("hex")}`;
const text = (value: string | null | undefined) => (value === undefined || value === null ? null : value.normalize("NFC"));

function assertRow(row: ListadoRow): void {
  // El listado ya viene normalizado: el código tiene que ser el canónico, sin `_` (formato de normalize.ts).
  const fail = (motivo: ListadoInvalidoMotivo) => new ListadoInvalidoError(row.code, motivo);
  if (typeof row.code !== "string" || !isCode(row.code)) throw fail("codigo-formato");
  const numbers = [row.lengthMm, row.widthMm, row.thicknessMm, row.quantity];
  if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) throw fail("numero-no-finito");
  if (!(row.lengthMm > 0 && row.widthMm > 0 && row.thicknessMm > 0)) throw fail("medida-no-positiva");
  if (!Number.isInteger(row.quantity)) throw fail("cantidad-no-entera");
  if (row.quantity < 1) throw fail("cantidad-no-positiva");
  const edges = row.edgeBanding;
  if (Array.isArray(edges)) {
    if (!edges.every((e) => EDGE_IDS.includes(e))) throw fail("canto-desconocido");
    if (new Set(edges).size !== edges.length) throw fail("canto-repetido");
  }
}

function edgeBandingOf(edges: ListadoEdgeBanding | undefined): readonly EdgeId[] | null | "sin-definir" {
  if (edges === undefined || edges === null) return null;
  if (edges === "sin-definir") return edges;
  return [...edges].sort(binary);
}

/** Cadena canónica del listado (§5.1): orden por código, claves fijas, ausente = null, NFC, sin espacios. */
export function canonicalListado(rows: readonly ListadoRow[]): string {
  const seen = new Set<string>();
  for (const row of rows) {
    assertRow(row);
    if (seen.has(row.code)) throw new ListadoInvalidoError(row.code, "codigo-repetido");
    seen.add(row.code);
  }
  const canonical = [...rows]
    .sort((a, b) => binary(a.code, b.code))
    .map((row) => ({
      code: row.code,
      name: text(row.name),
      lengthMm: row.lengthMm,
      widthMm: row.widthMm,
      thicknessMm: row.thicknessMm,
      material: text(row.material),
      quantity: row.quantity,
      edgeBanding: edgeBandingOf(row.edgeBanding),
      notes: text(row.notes),
    }));
  // JSON.stringify serializa los números como Number.prototype.toString. -0 no llega: es medida-no-positiva.
  return JSON.stringify(canonical);
}

export function listadoId(rows: readonly ListadoRow[]): Sha256Id {
  return sha256(canonicalListado(rows));
}

/** sha256 de los bytes del .dae con cada \r\n pasado a \n (Q4): mismo id en Windows y en Linux. */
export function modelId(bytes: Uint8Array): Sha256Id {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue;
    out[n++] = bytes[i];
  }
  return sha256(out.subarray(0, n));
}

/** Hex sin el prefijo, para nombres de archivo. */
export function hashFileName(id: Sha256Id): string {
  return id.slice("sha256:".length);
}

/**
 * Id del run (spec-motor §3; docs/spec-t10-run-minimo.md §3.2): sha256 del JSON armado a mano, claves en orden fijo
 * (no se confía en el orden del objeto de entrada). `furnitureId` y `passes` no entran.
 */
export function engineRunId(x: { modelId: string; listadoId: string; versions: AssociationRun["versions"]; params: EngineParams }): Sha256Id {
  return sha256(
    JSON.stringify({
      modelId: x.modelId,
      listadoId: x.listadoId,
      versions: { engine: x.versions.engine, vocabulary: x.versions.vocabulary, frame: x.versions.frame },
      params: { toleranceMm: x.params.toleranceMm, epsilonMm: x.params.epsilonMm, tupleRoundingMm: x.params.tupleRoundingMm },
    }),
  );
}
