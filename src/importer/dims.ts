// Medidas generales del mueble importado (D9): salen de la caja de las piezas del .dae, no del CSV.
// Función pura: solo lee `geometry.boundingBox` (sin three ni React).

import type { Furniture } from "@/data/types";
import type { FurniturePart } from "@/model/types";

/** Caja que envuelve todas las piezas, en mm redondeados: x ancho, y alto, z profundidad (escena con Y arriba). */
export function measureDimsMm(parts: readonly FurniturePart[]): Furniture["dimsMm"] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { geometry } of parts) {
    const box = geometry.boundingBox;
    if (!box) continue;
    const lo = [box.min.x, box.min.y, box.min.z];
    const hi = [box.max.x, box.max.y, box.max.z];
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], lo[i]);
      max[i] = Math.max(max[i], hi[i]);
    }
  }
  const mm = (i: number) => (Number.isFinite(min[i]) ? Math.round((max[i] - min[i]) * 1000) : 0);
  return { x: mm(0), y: mm(1), z: mm(2) };
}
