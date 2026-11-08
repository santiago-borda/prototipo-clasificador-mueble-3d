// Adapter del motor: .dae → Observation[] (spec-motor §4a y §5.2; plan T4; docs/spec-adapter-observation-listadoid.md
// §3). Es la única capa del motor que conoce three. Lee la escena de `ColladaLoader` **antes** de cualquier merge
// (colladaModel.ts quita los grupos de material y borraría las caras Canto_*). Nombres e instanceKey salen del XML
// (daeIndex.ts); cada malla se asigna a su instancia por el ancestro `@key:` del XML etiquetado.
// Marco de referencia v1 (FRAME_VERSION, ASUMIDO AS2): docs/marco-referencia.md.
// Importa @/engine/hash (node:crypto): solo lo usan el eval, el servidor y las pruebas, nunca un archivo "use client".

import { Mesh, Vector3, type Object3D } from "three";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { modelId as modelIdOf } from "@/engine/hash";
import type { Observation } from "@/engine/types";
import { FRAME_VERSION } from "@/engine/versions";
import { DaeStructureError, KEY_PREFIX, indexDae } from "./daeIndex";
import { edgeRunsOf } from "./edgeFaces";
import { skipTextures } from "./namedColladaLoader";

type Vec3 = [number, number, number];

export interface DaeObservation {
  /** `modelId(bytes)` del .dae (spec-motor §3, Q4): el mismo que lleva cada observación. */
  modelId: string;
  /** Una por entrada del índice (componente o malla suelta), en el orden del documento. */
  observations: Observation[];
  lineObjects: number;
  /** Caja de referencia del mueble, en mm en el marco: unión de las cajas de todas las observaciones (§5.2). */
  referenceBoxMm: { min: Vec3; max: Vec3 };
}

/** Cantidad impar de triángulos Canto_* en una instancia: cada cara son 2 (§5.2). El harness lo informa como entrada inválida. */
export class OddEdgeTrianglesError extends Error {
  constructor(
    readonly instanceKey: string,
    readonly count: number,
  ) {
    super(`${instanceKey}: cantidad impar de triángulos de canto (${count}).`);
    this.name = "OddEdgeTrianglesError";
  }
}

/** Una normal está "en un eje" si alguna componente tiene |n| ≥ 1 − este valor (plan T4). */
const AXIS_TOLERANCE = 1e-6;
/** Margen para "cruza el plano medio" (mm): tocar el plano no es cruzarlo (ε del motor, plan "Restricciones"). */
const MIDPLANE_EPSILON_MM = 1e-6;
/** Por eje del espesor en el marco v1: X, Y, Z. */
const ORIENTATION_BY_AXIS = ["vertical-lateral", "horizontal", "vertical-frontal"] as const;

interface Measured {
  min: Vec3;
  max: Vec3;
  axisAligned: boolean;
  triangleRuns: number[];
  mirrored: boolean;
}

function keyOf(mesh: Object3D): { key: string; node: Object3D } | null {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (node.name.startsWith(KEY_PREFIX)) return { key: node.name.slice(KEY_PREFIX.length), node };
  }
  return null;
}

/** Caja (mm, mundo) y normales de las caras de una malla; acumula en `into`. */
function measure(mesh: Mesh, into: Measured): void {
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.index;
  const world = (vertex: number) => new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);

  for (let v = 0; v < position.count; v++) {
    const p = world(v).toArray();
    for (let axis = 0; axis < 3; axis++) {
      into.min[axis] = Math.min(into.min[axis], p[axis]);
      into.max[axis] = Math.max(into.max[axis], p[axis]);
    }
  }

  const count = index ? index.count : position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => world(index ? index.getX(i + k) : i + k));
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    const length = normal.length();
    if (length === 0) continue; // triángulo degenerado: sin normal
    normal.divideScalar(length);
    if (Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)) < 1 - AXIS_TOLERANCE) into.axisAligned = false;
  }

  into.triangleRuns.push(...edgeRunsOf(mesh));
}

function faces(instanceKey: string, triangleRuns: number[]): number[] | "no-disponible" {
  if (triangleRuns.length === 0) return "no-disponible";
  if (triangleRuns.length % 2 !== 0) throw new OddEdgeTrianglesError(instanceKey, triangleRuns.length);
  // 2 triángulos por cara: ordenados quedan contiguos de a pares (mismo criterio que el detector de prueba anterior).
  return [...triangleRuns].sort((x, y) => x - y).filter((_, i) => i % 2 === 0);
}

/** Eje del espesor = el de menor extensión; en empate, el primero (X, Y, Z), para que sea determinista. */
function thicknessAxis(size: Vec3): 0 | 1 | 2 {
  let axis: 0 | 1 | 2 = 0;
  if (size[1] < size[axis]) axis = 1;
  if (size[2] < size[axis]) axis = 2;
  return axis;
}

export function observeDae(bytes: Uint8Array): DaeObservation {
  const modelId = modelIdOf(bytes);
  const index = indexDae(new TextDecoder("utf-8").decode(bytes));

  const loader = new ColladaLoader();
  skipTextures(loader);
  const collada = loader.parse(index.taggedXml, "/");
  if (!collada) throw new DaeStructureError("", "ColladaLoader no pudo leer el .dae.");
  const scene = collada.scene;
  scene.updateMatrixWorld(true);

  const measured = new Map<string, Measured>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const owner = keyOf(object);
    if (!owner) throw new DaeStructureError(object.name, "malla fuera de toda instancia del índice.");
    let entry = measured.get(owner.key);
    if (!entry) {
      entry = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], axisAligned: true, triangleRuns: [], mirrored: owner.node.matrixWorld.determinant() < 0 };
      measured.set(owner.key, entry);
    }
    measure(object, entry);
  });

  for (const key of measured.keys()) {
    if (!index.entries.some((e) => e.instanceKey === key)) throw new DaeStructureError(key, "clave @key: que no está en el índice.");
  }

  const boxes = index.entries.map((entry) => {
    const m = measured.get(entry.instanceKey);
    if (!m) throw new DaeStructureError(entry.nodeId, "instancia sin triángulos en la escena.");
    return m;
  });

  const ref = { min: [Infinity, Infinity, Infinity] as Vec3, max: [-Infinity, -Infinity, -Infinity] as Vec3 };
  for (const box of boxes) {
    for (let axis = 0; axis < 3; axis++) {
      ref.min[axis] = Math.min(ref.min[axis], box.min[axis]);
      ref.max[axis] = Math.max(ref.max[axis], box.max[axis]);
    }
  }

  const axes = [0, 1, 2] as const;
  const observations = index.entries.map((entry, i): Observation => {
    const box = boxes[i];
    const size = axes.map((a) => box.max[a] - box.min[a]) as Vec3;
    const centerRel = axes.map((a) => {
      const extent = ref.max[a] - ref.min[a];
      return extent > 0 ? ((box.min[a] + box.max[a]) / 2 - ref.min[a]) / extent : 0.5;
    }) as Vec3;
    const crossesMidplane = axes.map((a) => {
      const mid = (ref.min[a] + ref.max[a]) / 2;
      return box.min[a] < mid - MIDPLANE_EPSILON_MM && box.max[a] > mid + MIDPLANE_EPSILON_MM;
    }) as [boolean, boolean, boolean];

    return {
      modelId,
      instanceKey: entry.instanceKey,
      frameVersion: FRAME_VERSION,
      rawName: entry.rawName,
      sizeMm: [...size].sort((x, y) => x - y) as Vec3,
      axisAligned: box.axisAligned,
      orientation: ORIENTATION_BY_AXIS[thicknessAxis(size)],
      centerRel,
      crossesMidplane,
      edgeRunsMm: faces(entry.instanceKey, box.triangleRuns),
      mirrored: box.mirrored,
    };
  });

  return { modelId, observations, lineObjects: index.lineObjects, referenceBoxMm: ref };
}
