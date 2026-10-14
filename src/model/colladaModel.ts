// Convierte la escena de un .dae exportado desde SketchUp en FurnitureModel.
//
// Lo que el exportador de SketchUp deja en el archivo (verificado en olmo.dae):
//  - Unidades en pulgadas y Z hacia arriba: ColladaLoader ya lo resuelve (escala a metros y rota a Y arriba).
//  - Cada pieza es un componente cuyo nombre es el código: `_0001-01-M01-C04` (paneles de 24
//    triángulos cada uno). Las instancias se numeran por código: `0001-01-M01-C04#1`, `#2`.
//  - Solo se conservan esas piezas. El modelo no trae herrajes. Quedan afuera 6 geometrías sueltas de
//    20 x 35 x 10 mm (material Color_M06, sin identificar): no cuelgan de ningún componente con código.

import { Box3, Mesh, Vector3, type BufferGeometry, type Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PIECE_NAME, canonicalCode } from "./ids";
import type { FurnitureModel, FurniturePart } from "./types";

/** Componente (con código) más cercano hacia arriba, o null si el mesh no pertenece a una pieza. */
function findPieceNode(mesh: Object3D): Object3D | null {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (PIECE_NAME.test(node.name)) return node;
  }
  return null;
}

/** Geometría con la transformada de mundo "horneada", solo position + normal, sin índice. */
function bakeGeometry(mesh: Mesh): BufferGeometry | null {
  let geometry = mesh.geometry.clone();
  if (geometry.index) geometry = geometry.toNonIndexed();
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
  }
  geometry.clearGroups();
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) return null;
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

function merge(geometries: BufferGeometry[]): BufferGeometry | null {
  if (geometries.length === 1) return geometries[0];
  return mergeGeometries(geometries, false);
}

export function buildFurnitureModel(scene: Object3D): FurnitureModel {
  scene.updateMatrixWorld(true);

  // Map conserva el orden de inserción = orden de recorrido del .dae.
  const byPieceNode = new Map<Object3D, BufferGeometry[]>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const pieceNode = findPieceNode(object);
    if (!pieceNode) return; // geometría suelta sin código: ni siquiera se procesa
    const geometry = bakeGeometry(object);
    if (!geometry) return;
    const list = byPieceNode.get(pieceNode);
    if (list) list.push(geometry);
    else byPieceNode.set(pieceNode, [geometry]);
  });

  const parts: FurniturePart[] = [];
  const counters = new Map<string, number>();
  for (const [node, geometries] of byPieceNode) {
    const geometry = merge(geometries);
    if (!geometry) continue;
    const code = canonicalCode(node.name);
    const n = (counters.get(code) ?? 0) + 1;
    counters.set(code, n);
    parts.push({ instanceId: `${code}#${n}`, componentName: node.name, geometry });
  }

  // Centrar en x/z y apoyar en y = 0 para que OrbitControls orbite alrededor del mueble.
  const bounds = new Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) bounds.union(part.geometry.boundingBox);
  }
  const center = bounds.getCenter(new Vector3());
  for (const part of parts) {
    part.geometry.translate(-center.x, -bounds.min.y, -center.z);
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }

  return { parts };
}
