// Contrato entre "de dónde sale el mueble 3D" y el visor.
// El visor solo conoce FurniturePart; no sabe si la geometría viene de un .dae, de cajas
// generadas por código o de otro formato.

import type { BufferGeometry } from "three";

export interface FurniturePart {
  /**
   * Id de la instancia física. Coincide con el nombre del mesh.
   * Para el .dae: `<código canónico>#<n>` (ej. `0001-01-M01-C04#2`).
   */
  instanceId: string;
  /** Nombre del componente tal como viene en el .dae (ej. `_0001-01-M01-C01__`). */
  componentName: string;
  /** Geometría ya en coordenadas de escena (metros, Y arriba, mueble centrado, piso en y = 0). */
  geometry: BufferGeometry;
}

/** Lo que el .dae trae y no se convierte en pieza. Se informa para que no pase desapercibido. */
export interface ModelExclusions {
  /** Objetos de líneas (aristas sueltas de SketchUp): no son piezas. */
  lineObjects: number;
  /** Mallas que no cuelgan de ningún componente con código de pieza. */
  meshesWithoutCode: number;
}

export interface FurnitureModel {
  parts: readonly FurniturePart[];
  excluded: ModelExclusions;
}
