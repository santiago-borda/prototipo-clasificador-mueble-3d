// Dónde van, sobre la pieza física del 3D, los bordes con canto y la marca de orientación.
//
// ASUMIDO PARA EL PROTOTIPO: falta el dato real de orientación (ver data/furniture.mock.ts).
// Convención usada, que replica la del esquema 2D (EdgeBandingDiagram):
//  - La pieza es el prisma de su bounding box: eje más corto = espesor, el más largo = largo,
//    el restante = ancho. (Los paneles de este mueble están alineados a los ejes.)
//  - largo-A / largo-B: los dos bordes a lo largo, en el mínimo / máximo del eje del ancho.
//  - corto-A / corto-B: los dos bordes cortos, en el mínimo / máximo del eje del largo.
//  - Esquina de referencia: el vértice largo-A × corto-A (a mitad del espesor, visible desde ambas caras).
// Con piezas equivalentes (ej. los dos laterales _04) cada copia usa su propia caja, así que
// "A" puede quedar espejado entre una y otra: el dato real lo debe definir Casa Mueble.

import { Box3, Vector3, type BufferGeometry } from "three";
import type { EdgeId } from "@/data/types";

/** Espesor dibujado del canto (m). Exagerado a propósito: el canto real es 0,45 mm. */
const BAND_THICKNESS = 0.01;

type Vec3 = [number, number, number];

export interface EdgeBandBox {
  id: EdgeId;
  center: Vec3;
  size: Vec3;
}

export interface EdgeLayout {
  bands: EdgeBandBox[];
  referenceCorner: Vec3;
}

function toVec(values: number[]): Vec3 {
  return [values[0], values[1], values[2]];
}

export function computeEdgeLayout(geometry: BufferGeometry, edges: readonly EdgeId[]): EdgeLayout {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new Box3();
  const min = box.min.toArray();
  const max = box.max.toArray();
  const size = box.getSize(new Vector3()).toArray();
  const mid = (axis: number) => (min[axis] + max[axis]) / 2;

  // Ejes ordenados de menor a mayor medida: espesor, ancho, largo.
  const [t, w, l] = [0, 1, 2].sort((a, b) => size[a] - size[b]);

  const band = (id: EdgeId, across: number, along: number, side: -1 | 1): EdgeBandBox => {
    const s = [0, 0, 0];
    const c = [0, 0, 0];
    s[t] = size[t];
    c[t] = mid(t);
    s[along] = size[along];
    c[along] = mid(along);
    s[across] = BAND_THICKNESS;
    c[across] = side < 0 ? min[across] - BAND_THICKNESS / 2 : max[across] + BAND_THICKNESS / 2;
    return { id, center: toVec(c), size: toVec(s) };
  };

  const all: Record<EdgeId, EdgeBandBox> = {
    "largo-A": band("largo-A", w, l, -1),
    "largo-B": band("largo-B", w, l, 1),
    "corto-A": band("corto-A", l, w, -1),
    "corto-B": band("corto-B", l, w, 1),
  };

  const corner = [0, 0, 0];
  corner[l] = min[l];
  corner[w] = min[w];
  corner[t] = mid(t);

  return { bands: edges.map((id) => all[id]), referenceCorner: toVec(corner) };
}
