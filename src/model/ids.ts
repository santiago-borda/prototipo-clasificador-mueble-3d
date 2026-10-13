// Convenciones de nombres del modelo 3D. Sin dependencias de three: se puede usar desde el servidor.

/** Nombre de componente que lleva código de pieza: `_01_...`, `_12_...` */
export const PIECE_NAME = /^_\d+_/;

/** Código de pieza de una instancia: `_04_Lateral_modulo_cajones#2` -> `_04`. null si no sigue la convención. */
export function componentCode(instanceId: string): string | null {
  const match = /^(_\d+)_/.exec(instanceId);
  return match ? match[1] : null;
}
