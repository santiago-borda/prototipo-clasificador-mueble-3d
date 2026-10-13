// Contrato entre "de dónde sale el mueble 3D" y el visor.
// El visor solo conoce FurniturePart; no sabe si la geometría viene de un .dae, de cajas
// generadas por código o de otro formato.

import type { BufferGeometry } from "three";

export interface FurniturePart {
  /**
   * Id de la instancia física. Coincide con el nombre del mesh y con data/mapping.ts.
   * Para el .dae: `<nombre del componente>#<n>` (ej. `_04_Lateral_modulo_cajones#2`).
   */
  instanceId: string;
  /** Geometría ya en coordenadas de escena (metros, Y arriba, mueble centrado, piso en y = 0). */
  geometry: BufferGeometry;
}

export interface FurnitureModel {
  parts: readonly FurniturePart[];
}
