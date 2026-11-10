// Versiones que entran al engineRunId (spec-motor §3). Cambiar una regla del motor o el marco exige subirlas.
//
// Regla de `AssociationRun.passes` (T10-E2, docs/spec-t10-run-minimo.md): T10 escribe `passes: 1`. Cuando T9 agregue
// la pasada 2 y pase `passes` a 2, DEBE subir ENGINE_VERSION en el mismo cambio: `passes` no entra en el engineRunId,
// que lo distingue solo por `versions.engine`.

export const ENGINE_VERSION = "motor/1";
/** Marco de referencia v1 (AS2), a documentar en docs/marco-referencia.md (plan T4). */
export const FRAME_VERSION = "marco/1";
/** Sin vocabulario: "sin reglas" (T10-E5). T6 lo pasa a "vocabulario/1". */
export const VOCABULARY_VERSION = "vocabulario/0";
