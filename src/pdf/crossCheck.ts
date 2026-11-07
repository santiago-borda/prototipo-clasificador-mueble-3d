// Cruce del listado del PDF con las observaciones del .dae del mismo mueble
// (docs/spec-sesion-2b-listado-cruce.md §2.3 y §4; docs/spec-esquema-pdf.md §7.2). Función pura, sin red.
//
// Clave del cruce: (mueble, código). Una observación de otro modelo es un error de quien llama
// (`MuebleDistintoError`), no una discrepancia. El cruce no corrige nada ni deduce módulos: informa.

import type { Evidence as EngineEvidence, Observation } from "@/engine/types";
import { normalizeCode } from "./code";
import type { ListedPiece } from "./listing";
import type { PdfReason } from "./reasons";

/** Razones que bajan el nivel de la fila de su código. */
export type LevelReason = Extract<PdfReason, "codigo-sin-instancias" | "cantidad-no-coincide" | "medida-no-coincide" | "canteado-no-coincide">;
/** Razones que solo se informan: no hay fila que marcar, o son informativas (D5). */
export type InfoReason = Extract<PdfReason, "instancias-sin-fila" | "canteado-sin-definir">;

interface FindingBase {
  furnitureId: string;
  /** Código normalizado. */
  code: string;
  /** Qué se comparó y con qué valores; al menos una. */
  evidence: EngineEvidence[];
}

/** La unión fuerza `affectsLevel` según la razón (2b-T1). */
export type CrossCheckFinding = (FindingBase & { reason: LevelReason; affectsLevel: true }) | (FindingBase & { reason: InfoReason; affectsLevel: false });

export type EdgeCheck = "cumple" | "neutral" | "no-disponible" | "sin-definir" | "no-coincide";

export interface CrossCheckContext {
  /** Id del mueble del listado. */
  furnitureId: string;
  /** Id del modelo .dae de ese mueble (el de `Observation.modelId`); no tiene por qué ser igual a `furnitureId`. */
  modelId: string;
  /** `FurnitureDef.toleranceMm`. */
  toleranceMm: number;
}

export interface CrossCheckResult {
  findings: CrossCheckFinding[];
  /** Por código del listado. */
  edges: Record<string, EdgeCheck>;
}

/** Llegó una observación de otro modelo: mezclar muebles es un error de quien llama. */
export class MuebleDistintoError extends Error {
  constructor(
    readonly expectedModelId: string,
    readonly receivedModelId: string,
    readonly instanceKey: string,
  ) {
    super(`La observación ${instanceKey} es del modelo "${receivedModelId}" y el cruce es del modelo "${expectedModelId}".`);
    this.name = "MuebleDistintoError";
  }
}

/** Entrada que el cruce no puede interpretar sin adivinar (tolerancia inválida, código repetido en el listado). */
export class CrossCheckInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossCheckInputError";
  }
}

/** Número para el texto de la evidencia: hasta 2 decimales, con coma. Solo para mostrar; no se compara con esto. */
const mm = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");
const box = (values: readonly number[]) => `[${values.map(mm).join("; ")}]`;
const ascending = (values: readonly number[]) => [...values].sort((a, b) => a - b);
/** Con `<=` (y no "no es mayor que"), una diferencia NaN (caja rota) no cumple. */
const within = (difference: number, toleranceMm: number) => difference <= toleranceMm;

interface EdgeOutcome {
  check: EdgeCheck;
  evidence: EngineEvidence[];
}

/** Lados L y A marcados contra las caras de canto que miden L y A (± tol), instancia por instancia (como A8). */
function compareEdges(piece: ListedPiece, instances: readonly Observation[], toleranceMm: number): EdgeOutcome {
  if (piece.edgeBanding === "sin-definir") {
    // Prioridad sobre "no-disponible": lo que falta decidir está del lado del PDF (§4).
    return {
      check: "sin-definir",
      evidence: [{ kind: "canto", result: "no-disponible", detail: `El PDF no trae la columna de cantos de ${piece.code}: el canteado no se compara (PDF-2).` }],
    };
  }
  const withRuns = instances.filter((o) => o.edgeRunsMm !== "no-disponible");
  if (withRuns.length === 0) return { check: "no-disponible", evidence: [] };
  if (within(Math.abs(piece.lengthMm - piece.widthMm), toleranceMm)) return { check: "neutral", evidence: [] };

  const expectedL = piece.edgeBanding.filter((edge) => edge.startsWith("largo")).length;
  const expectedA = piece.edgeBanding.filter((edge) => edge.startsWith("corto")).length;
  const evidence: EngineEvidence[] = [];
  for (const instance of instances) {
    if (instance.edgeRunsMm === "no-disponible") {
      // Otras instancias del mismo código sí traen caras de canto: el modelo no es parejo, no se supone nada.
      evidence.push({ kind: "canto", result: "no-cumple", detail: `${instance.instanceKey}: sin caras de canto, y otras instancias de ${piece.code} sí las tienen.` });
      continue;
    }
    let sidesL = 0;
    let sidesA = 0;
    let unclassified = 0;
    for (const run of instance.edgeRunsMm) {
      const toL = Math.abs(run - piece.lengthMm);
      const toA = Math.abs(run - piece.widthMm);
      const isL = within(toL, toleranceMm);
      const isA = within(toA, toleranceMm);
      // Dentro de la tolerancia de los dos: al más cercano; si empatan, no se clasifica.
      if (isL && (!isA || toL < toA)) sidesL += 1;
      else if (isA && (!isL || toA < toL)) sidesA += 1;
      else unclassified += 1;
    }
    if (sidesL !== expectedL || sidesA !== expectedA || unclassified > 0) {
      evidence.push({
        kind: "canto",
        result: "no-cumple",
        detail:
          `${instance.instanceKey}: listado ${expectedL} lados L y ${expectedA} lados A (L ${mm(piece.lengthMm)} · A ${mm(piece.widthMm)}); ` +
          `caras de canto ${box(instance.edgeRunsMm)}: ${sidesL} miden L, ${sidesA} miden A, ${unclassified} sin clasificar; tol ${mm(toleranceMm)}`,
      });
    }
  }
  return evidence.length > 0 ? { check: "no-coincide", evidence } : { check: "cumple", evidence: [] };
}

export function crossCheck(pieces: readonly ListedPiece[], observations: readonly Observation[], context: CrossCheckContext): CrossCheckResult {
  const { furnitureId, modelId, toleranceMm } = context;
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0) throw new CrossCheckInputError(`Tolerancia inválida: ${toleranceMm}.`);
  for (const observation of observations) {
    if (observation.modelId !== modelId) throw new MuebleDistintoError(modelId, observation.modelId, observation.instanceKey);
  }
  const listed = new Set<string>();
  for (const piece of pieces) {
    if (listed.has(piece.code)) throw new CrossCheckInputError(`El código ${piece.code} aparece dos veces en el listado.`);
    listed.add(piece.code);
  }

  // Mallas sin componente y nombres que no dan un código válido no entran (§4).
  const byCode = new Map<string, Observation[]>();
  for (const observation of observations) {
    const { code } = normalizeCode(observation.rawName);
    if (code === null) continue;
    const list = byCode.get(code);
    if (list) list.push(observation);
    else byCode.set(code, [observation]);
  }

  const findings: CrossCheckFinding[] = [];
  const edges: Record<string, EdgeCheck> = {};
  const level = (code: string, reason: LevelReason, evidence: EngineEvidence[]) => findings.push({ furnitureId, code, reason, affectsLevel: true, evidence });
  const info = (code: string, reason: InfoReason, evidence: EngineEvidence[]) => findings.push({ furnitureId, code, reason, affectsLevel: false, evidence });

  for (const piece of pieces) {
    const instances = byCode.get(piece.code) ?? [];

    if (instances.length === 0) {
      level(piece.code, "codigo-sin-instancias", [{ kind: "codigo", result: "no-cumple", detail: `${piece.code} está en el listado y no tiene instancias en el modelo "${modelId}".` }]);
    } else {
      if (instances.length !== piece.quantity) {
        level(piece.code, "cantidad-no-coincide", [
          { kind: "cantidad", result: "no-cumple", detail: `${piece.code}: el listado dice ${piece.quantity} y el modelo tiene ${instances.length} instancias.` },
        ]);
      }

      // {L, A, espesor} ordenado contra la caja ordenada; L y A no se nombran largo/corto (INV-7).
      const expected = ascending([piece.lengthMm, piece.widthMm, piece.thicknessMm]);
      const sizeEvidence: EngineEvidence[] = [];
      for (const instance of instances) {
        const actual = ascending(instance.sizeMm);
        if (!expected.every((value, i) => within(Math.abs(value - actual[i]), toleranceMm))) {
          sizeEvidence.push({
            kind: "medidas",
            result: "no-cumple",
            detail: `${instance.instanceKey}: L ${mm(piece.lengthMm)} · A ${mm(piece.widthMm)} · e ${mm(piece.thicknessMm)} contra caja ${box(actual)}; tol ${mm(toleranceMm)}`,
          });
        }
      }
      if (sizeEvidence.length > 0) level(piece.code, "medida-no-coincide", sizeEvidence);
    }

    const edgeOutcome = compareEdges(piece, instances, toleranceMm);
    edges[piece.code] = edgeOutcome.check;
    if (edgeOutcome.check === "sin-definir") info(piece.code, "canteado-sin-definir", edgeOutcome.evidence);
    if (edgeOutcome.check === "no-coincide") level(piece.code, "canteado-no-coincide", edgeOutcome.evidence);
  }

  const extra = [...byCode.keys()].filter((code) => !listed.has(code)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const code of extra) {
    const count = byCode.get(code)?.length ?? 0;
    info(code, "instancias-sin-fila", [{ kind: "codigo", result: "no-cumple", detail: `${code}: ${count} instancias en el modelo "${modelId}" y ninguna fila en el listado.` }]);
  }

  return { findings, edges };
}
