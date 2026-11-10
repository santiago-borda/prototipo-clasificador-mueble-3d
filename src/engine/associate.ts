// Pasada 1 del motor de asociación (spec-motor §6.1 y §6.2; docs/spec-t8-pasada-1.md v0.2).
// Cada instancia se evalúa solo contra el tipo de su código: nombre, listado, medidas, cupo (T8-E3).
// Sin pasada 2 (T9): toda dudosa sale con `candidates: []`, que acá significa "no se rankeó" (T8-E2).
// Devuelve un `Pass1Result`, no un `AssociationRun`: los ids del run (listadoId, engineRunId) y las versiones los
// arma T10 encima, sin cambiar esta firma (T8-E1). Puro: sin three, sin @/model/, sin DOM y sin hash.

import { checkDims, type DimsCheck } from "./evidence";
import { normalizeName } from "./normalize";
import type { AssociationRun, EngineParams, Evidence, Inconsistency, InstanceResult, ListadoRow, Observation, Reason } from "./types";

export interface AssociateInput {
  furnitureId: string;
  modelId: string;
  observations: readonly Observation[];
  listado: readonly ListadoRow[];
  params: EngineParams;
}

export interface Pass1Result {
  /** Ordenados por instanceKey, comparación binaria. */
  results: InstanceResult[];
  /** Ordenado por pieceCode, binario; sin códigos duplicados (T8-E8). */
  typeSummary: AssociationRun["typeSummary"];
  /** Ordenadas por kind, pieceCode (null primero) e instanceKeys. */
  inconsistencies: Inconsistency[];
}

/** Una observación de otro modelo: no se mezclan modelos (como `MuebleDistintoError` del cruce 2b). */
export class ModeloDistintoError extends Error {
  constructor(
    readonly expectedModelId: string,
    readonly receivedModelId: string,
    readonly instanceKey: string,
  ) {
    super(`La observación ${instanceKey} es del modelo "${receivedModelId}" y la asociación es del modelo "${expectedModelId}".`);
    this.name = "ModeloDistintoError";
  }
}

const binary = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function compareKeys(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = binary(a[i], b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

function compareInconsistencies(a: Inconsistency, b: Inconsistency): number {
  const byKind = binary(a.kind, b.kind);
  if (byKind !== 0) return byKind;
  if (a.pieceCode !== b.pieceCode) {
    if (a.pieceCode === null) return -1;
    if (b.pieceCode === null) return 1;
    return binary(a.pieceCode, b.pieceCode);
  }
  return compareKeys(a.instanceKeys, b.instanceKeys);
}

const cantidadDetail = (claimants: number, quantity: number): string => `reclamantes ${claimants}, cantidad del listado ${quantity}`;

/** Reclamante de un tipo único, a la espera del cupo (paso 4). */
interface Claimant {
  obs: Observation;
  canonical: boolean;
  dims: DimsCheck;
  reasons: Reason[];
  evidence: Evidence[];
}

const dudosa = (instanceKey: string, reasons: Reason[], evidence: Evidence[]): InstanceResult => ({
  instanceKey,
  level: "dudosa",
  pieceCode: null,
  reasons,
  warnings: [],
  candidates: [],
  evidence,
});

export function associatePass1(input: AssociateInput): Pass1Result {
  for (const o of input.observations) {
    if (o.modelId !== input.modelId) throw new ModeloDistintoError(input.modelId, o.modelId, o.instanceKey);
  }

  const rowsByCode = new Map<string, ListadoRow[]>();
  for (const r of input.listado) {
    const rows = rowsByCode.get(r.code);
    if (rows === undefined) rowsByCode.set(r.code, [r]);
    else rows.push(r);
  }

  const results: InstanceResult[] = [];
  const inconsistencies: Inconsistency[] = [];
  const claimantsByCode = new Map<string, Claimant[]>();

  for (const o of input.observations) {
    const name = normalizeName(o.rawName);

    // Paso 0: el único camino a sin-asociar; sin evidencia (T8-E7: una inconsistencia por malla).
    if (name.kind === "sin-componente") {
      results.push({ instanceKey: o.instanceKey, level: "sin-asociar", pieceCode: null, reasons: ["sin-componente"], warnings: [], candidates: [], evidence: [] });
      inconsistencies.push({ kind: "sin-componente", pieceCode: null, instanceKeys: [o.instanceKey], detail: "malla sin componente" });
      continue;
    }

    // Paso 1b: sin tipo.
    if (name.kind === "formato-invalido") {
      results.push(dudosa(o.instanceKey, ["formato-invalido"], [{ kind: "codigo", result: "no-cumple", detail: "nombre sin código válido" }]));
      continue;
    }

    // Paso 1a: techo dudosa.
    const reasons: Reason[] = name.kind === "anomalo" ? ["nombre-anomalo"] : [];
    const rows = rowsByCode.get(name.code);

    // Paso 1c: sin tipo.
    if (rows === undefined) {
      reasons.push("codigo-inexistente");
      results.push(dudosa(o.instanceKey, reasons, [{ kind: "codigo", result: "no-cumple", detail: `código ${name.code}, no está en el listado` }]));
      continue;
    }

    // Paso 2: no hay un tipo único; no se mide ni entra en cupo, faltante ni sin-confirmar.
    if (rows.length > 1) {
      reasons.push("codigo-duplicado");
      results.push(
        dudosa(o.instanceKey, reasons, [{ kind: "codigo", result: "no-cumple", detail: `código ${name.code}, en ${rows.length} filas del listado` }]),
      );
      continue;
    }

    // Paso 3: medidas contra el tipo del código; checkDims decide si se midió (T7-E2).
    const dims = checkDims(o, rows[0], input.params);
    if (!dims.measured) reasons.push("geometria-no-alineada");
    else if (!dims.ok) reasons.push("medida-fuera-de-tolerancia");

    const codigo: Evidence =
      name.kind === "canonico"
        ? { kind: "codigo", result: "cumple", detail: `código ${name.code}, en el listado` }
        : { kind: "codigo", result: "no-cumple", detail: `nombre anómalo ${o.rawName ?? ""}, código ${name.code} en el listado` };

    const claimant: Claimant = { obs: o, canonical: name.kind === "canonico", dims, reasons, evidence: [codigo, ...dims.evidence] };
    const list = claimantsByCode.get(name.code);
    if (list === undefined) claimantsByCode.set(name.code, [claimant]);
    else list.push(claimant);
  }

  // Pasos 4 y 5, e inconsistencias por tipo; solo códigos con una fila (T8-E8).
  const typeSummary: AssociationRun["typeSummary"] = [];
  for (const [pieceCode, rows] of rowsByCode) {
    if (rows.length > 1) continue;
    const { quantity } = rows[0];
    const claimants = claimantsByCode.get(pieceCode) ?? [];
    const exceeded = claimants.length > quantity;
    const cantidad: Evidence = { kind: "cantidad", result: exceeded ? "no-cumple" : "cumple", detail: cantidadDetail(claimants.length, quantity) };
    const notSafe: string[] = [];
    let seguras = 0;

    for (const c of claimants) {
      if (exceeded) c.reasons.push("cupo-excedido");
      const evidence = [...c.evidence, cantidad];
      if (c.canonical && c.dims.ok && !exceeded) {
        seguras++;
        results.push({ instanceKey: c.obs.instanceKey, level: "segura", pieceCode, reasons: ["codigo-exacto"], warnings: [], candidates: [], evidence });
      } else {
        notSafe.push(c.obs.instanceKey);
        results.push(dudosa(c.obs.instanceKey, c.reasons, evidence));
      }
    }

    const keys = claimants.map((c) => c.obs.instanceKey).sort(binary);
    const detail = cantidadDetail(claimants.length, quantity);
    if (claimants.length < quantity) inconsistencies.push({ kind: "faltante", pieceCode, instanceKeys: keys, detail });
    // T8-E6: con cupo excedido también corresponde sin-confirmar (lectura literal de §6.2.3 y §6.2.5).
    if (exceeded) inconsistencies.push({ kind: "cupo-excedido", pieceCode, instanceKeys: keys, detail });
    if (seguras < claimants.length) {
      inconsistencies.push({
        kind: "sin-confirmar",
        pieceCode,
        instanceKeys: notSafe.sort(binary),
        detail: `seguras ${seguras}, reclamantes ${claimants.length}`,
      });
    }
    typeSummary.push({ pieceCode, quantity, claimants: claimants.length, seguras });
  }

  return {
    results: results.sort((a, b) => binary(a.instanceKey, b.instanceKey)),
    typeSummary: typeSummary.sort((a, b) => binary(a.pieceCode, b.pieceCode)),
    inconsistencies: inconsistencies.sort(compareInconsistencies),
  };
}
