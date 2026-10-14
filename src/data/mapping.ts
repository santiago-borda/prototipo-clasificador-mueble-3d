// SIMULA LA REGLA EXACTA POR CÓDIGO DEL MOTOR DE ASOCIACIÓN.
// En el sistema real, el vínculo PieceType -> instancias físicas del modelo 3D lo va a producir un motor
// que cruza el listado de piezas con la geometría del .dae. Acá la regla es la más simple: un tipo de pieza
// se asocia a las instancias cuyo código de componente es igual al suyo (`0001-01-M01-C04` ->
// `0001-01-M01-C04#1`, `#2`). No hay tabla escrita a mano.

import { componentCode } from "@/model/ids";
import type { PieceType } from "./types";

/** ¿Esta instancia del 3D (`<código>#<n>`) pertenece al tipo de pieza? */
export function pieceMatchesInstance(piece: Pick<PieceType, "code">, instanceId: string): boolean {
  return componentCode(instanceId) === piece.code;
}
