// Convenciones de nombres del modelo 3D. Sin dependencias de three: se puede usar desde el servidor.
//
// Los componentes del .dae se llaman `_0001-01-M01-C04` (C01 viene como `_0001-01-M01-C01__`, con
// guiones bajos de más al final: se informa como anomalía en la verificación de desarrollo).
// No se interpreta el significado de los segmentos: está a confirmar con Casa Mueble.

/** Nombre de componente que lleva código de pieza: `_0001-01-M01-C04`, con `_` finales opcionales. */
export const PIECE_NAME = /^_\d{4}-\d{2}-M\d{2}-C\d{2}_*$/;

/** Código canónico: el nombre del componente sin `_` inicial ni `_` finales. */
export const CODE_FORMAT = /^\d{4}-\d{2}-M\d{2}-C\d{2}$/;

/** `_0001-01-M01-C04` -> `0001-01-M01-C04`. */
export function canonicalCode(componentName: string): string {
  return componentName.replace(/^_+/, "").replace(/_+$/, "");
}

/** Código de pieza de una instancia: `0001-01-M01-C04#2` -> `0001-01-M01-C04`. null si no sigue la convención. */
export function componentCode(instanceId: string): string | null {
  const match = /^(\d{4}-\d{2}-M\d{2}-C\d{2})#/.exec(instanceId);
  return match ? match[1] : null;
}

/**
 * Último segmento del código ("C04"), para listas y menús.
 * ASUMIDO PARA EL PROTOTIPO: se muestra así porque los otros segmentos son iguales en todas las piezas
 * (M01); a confirmar con Casa Mueble. En la ficha siempre va el código completo.
 */
export function shortCode(code: string): string {
  return code.split("-").pop() ?? code;
}
