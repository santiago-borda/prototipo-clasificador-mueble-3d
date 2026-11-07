// Nivel de una fila combinado con los hallazgos del cruce (docs/spec-sesion-2b-listado-cruce.md §4.1, D4).
// Pura: no modifica sus argumentos. validateFurniture no cambia; quien llama arma el nivel por fila.

import type { CrossCheckFinding } from "./crossCheck";
import type { RowLevel } from "./validate";

/** Orden de gravedad. Cubre todo `RowLevel`: si suma un valor, el tipo obliga a ubicarlo. */
const GRAVEDAD = { segura: 0, dudosa: 1 } as const satisfies Record<RowLevel, number>;

/** Nivel que implica un hallazgo: los que bajan el nivel, `dudosa`; los informativos no cuentan. */
const nivelDe = (finding: CrossCheckFinding): RowLevel | null => (finding.affectsLevel ? "dudosa" : null);

/**
 * "Gana el peor" entre el nivel de la fila y el de cada hallazgo de su código. Los hallazgos de otro código no
 * cuentan. Nunca mejora un nivel.
 */
export function combinarNivel(level: RowLevel, code: string, findings: readonly CrossCheckFinding[]): RowLevel {
  let worst = level;
  for (const finding of findings) {
    if (finding.code !== code) continue;
    const implied = nivelDe(finding);
    if (implied !== null && GRAVEDAD[implied] > GRAVEDAD[worst]) worst = implied;
  }
  return worst;
}
