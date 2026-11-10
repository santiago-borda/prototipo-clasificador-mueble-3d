// AssociationRun de la pasada 1 (docs/spec-t10-run-minimo.md v0.2, §3.1). Arma los ids y las versiones encima de
// associatePass1 sin cambiar su firma (T8-E1). Importa hash.ts (node:crypto): solo eval y servidor, nunca un archivo
// "use client" ni src/pdf/ (T10-E1, H10).

import { associatePass1, type AssociateInput } from "./associate";
import { engineRunId, listadoId } from "./hash";
import type { AssociationRun } from "./types";
import { ENGINE_VERSION, FRAME_VERSION, VOCABULARY_VERSION } from "./versions";

/** Una observación de otro marco de referencia: no se mezclan marcos (§3.1.4). */
export class MarcoDistintoError extends Error {
  constructor(
    readonly expectedFrameVersion: string,
    readonly receivedFrameVersion: string,
    readonly instanceKey: string,
  ) {
    super(`La observación ${instanceKey} es del marco "${receivedFrameVersion}" y el motor usa "${expectedFrameVersion}".`);
    this.name = "MarcoDistintoError";
  }
}

export function buildRun(input: AssociateInput): AssociationRun {
  // 1. Antes de asociar: con un código repetido lanza ListadoInvalidoError y no hay run (T10-E3).
  const listado = listadoId(input.listado);
  // 2. Lanza ModeloDistintoError y CodigoExcluidoYListadoError como en associatePass1.
  const pass1 = associatePass1(input);
  // 3.
  const versions: AssociationRun["versions"] = { engine: ENGINE_VERSION, vocabulary: VOCABULARY_VERSION, frame: FRAME_VERSION };
  // 4.
  for (const o of input.observations) {
    if (o.frameVersion !== FRAME_VERSION) throw new MarcoDistintoError(FRAME_VERSION, o.frameVersion, o.instanceKey);
  }
  // 5. Claves en el orden de §3.1.5.
  const params = { toleranceMm: input.params.toleranceMm, epsilonMm: input.params.epsilonMm, tupleRoundingMm: input.params.tupleRoundingMm };
  return {
    furnitureId: input.furnitureId,
    modelId: input.modelId,
    listadoId: listado,
    engineRunId: engineRunId({ modelId: input.modelId, listadoId: listado, versions, params }),
    versions,
    params,
    passes: 1,
    results: pass1.results,
    typeSummary: pass1.typeSummary,
    inconsistencies: pass1.inconsistencies,
  };
}
