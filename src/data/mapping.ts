// SIMULA LA REGLA EXACTA POR CÓDIGO DEL MOTOR DE ASOCIACIÓN.
// En el sistema real, el vínculo PieceType -> instancias físicas del modelo 3D lo va a producir un motor
// que cruza el listado de piezas con la geometría del .dae. Acá la regla es la más simple: un tipo de pieza
// se asocia a las instancias cuyo código de componente es igual al suyo (`0001-01-M01-C04` ->
// `0001-01-M01-C04#1`, `#2`). No hay tabla escrita a mano.
// La regla se aplica SIEMPRE dentro de un mueble (ver `data/registry.ts`): el mismo código puede existir en otro.

import { componentCode } from "@/model/ids";
import type { PieceType } from "./types";

/** ¿Esta instancia del 3D (`<código>#<n>`) pertenece al tipo de pieza? */
export function pieceMatchesInstance(piece: Pick<PieceType, "code">, instanceId: string): boolean {
  return componentCode(instanceId) === piece.code;
}

export interface AssociationReport {
  /** Instancias que ningún tipo de pieza reclama. */
  orphans: string[];
  /** Instancias que reclama más de un tipo de pieza. */
  ambiguous: string[];
  /** Tipos cuya cantidad de instancias reclamadas no es la del listado. */
  countMismatches: string[];
  /** Sin huérfanas, sin ambiguas y con las cantidades del listado. */
  ok: boolean;
}

/**
 * Verifica la asociación por código exacto dentro de UN mueble: cada instancia la reclama exactamente un tipo
 * de pieza y cada tipo reclama `quantity` instancias. Es el criterio A4; no hay niveles de certeza (eso es del
 * motor de asociación real, fuera de alcance del prototipo).
 */
export function checkAssociation(
  instanceIds: readonly string[],
  pieces: readonly Pick<PieceType, "code" | "quantity">[],
): AssociationReport {
  const orphans: string[] = [];
  const ambiguous: string[] = [];
  const claimed = new Map<string, number>();

  for (const instanceId of instanceIds) {
    const owners = pieces.filter((piece) => pieceMatchesInstance(piece, instanceId));
    if (owners.length === 0) orphans.push(instanceId);
    else if (owners.length > 1) ambiguous.push(instanceId);
    for (const piece of owners) claimed.set(piece.code, (claimed.get(piece.code) ?? 0) + 1);
  }

  const countMismatches = pieces
    .filter((piece) => (claimed.get(piece.code) ?? 0) !== piece.quantity)
    .map((piece) => `${piece.code}: el listado dice ${piece.quantity} y se asociaron ${claimed.get(piece.code) ?? 0}.`);

  return { orphans, ambiguous, countMismatches, ok: orphans.length + ambiguous.length + countMismatches.length === 0 };
}
