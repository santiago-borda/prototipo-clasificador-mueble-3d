// Convierte la escena de un .dae exportado desde SketchUp en FurnitureModel.
//
// Lo que el exportador de SketchUp deja en el archivo (verificado en olmo.dae):
//  - Unidades en pulgadas y Z hacia arriba: ColladaLoader ya lo resuelve (escala a metros y rota a Y arriba).
//  - Cada pieza es un componente cuyo nombre es el código: `_0001-01-M01-C04` (paneles de 24
//    triángulos cada uno). Las instancias se numeran por código: `0001-01-M01-C04#1`, `#2`.
//  - Solo se conservan esas piezas. El modelo no trae herrajes. Quedan afuera 6 geometrías sueltas de
//    20 x 35 x 10 mm (material Color_M06, sin identificar): no cuelgan de ningún componente con código.
//  - sabrina.dae (verificado): mismo formato, instancias anidadas en grupos de hasta 3 niveles (ColladaLoader
//    compone las transformaciones) y 24 objetos de líneas sueltos (aristas) que tampoco son piezas.
//  - Lo que queda afuera se cuenta en `FurnitureModel.excluded` (líneas y mallas sin código).
//  - Cada pieza conserva sus UV y un grupo por material (`FurniturePart.surfaces`), para dibujar las texturas.

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Line,
  LineSegments,
  Loader,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PIECE_NAME, canonicalCode } from "./ids";
import type { FurnitureModel, FurniturePart, PartSurface } from "./types";

/** Componente (con código) más cercano hacia arriba, o null si el mesh no pertenece a una pieza. */
function findPieceNode(mesh: Object3D): Object3D | null {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (PIECE_NAME.test(node.name)) return node;
  }
  return null;
}

const KEPT_ATTRIBUTES = ["position", "normal", "uv"] as const;

function surfaceOf(material: Material | undefined, images: Record<string, string>): PartSurface {
  if (!material || material.name === Loader.DEFAULT_MATERIAL_NAME) return { material: "", image: null };
  return { material: material.name, image: images[material.name] ?? null };
}

/** Vértices [start, start + count) de una geometría sin índice, con position + normal + uv. */
function slice(source: BufferGeometry, start: number, count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const name of KEPT_ATTRIBUTES) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const size = attribute.itemSize;
    geometry.setAttribute(name, new BufferAttribute(attribute.array.slice(start * size, (start + count) * size), size));
  }
  // mergeGeometries exige los mismos atributos en todas: sin coordenadas de textura van en cero.
  if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new BufferAttribute(new Float32Array(count * 2), 2));
  return geometry;
}

/**
 * Geometría con la transformada de mundo "horneada", sin índice, partida por material (un trozo por grupo del
 * mesh; varios materiales en Sabrina: cara del panel y cantos `Canto_*`).
 */
function bakeGeometry(mesh: Mesh, images: Record<string, string>): { surface: PartSurface; geometry: BufferGeometry }[] {
  let geometry = mesh.geometry.clone();
  if (geometry.index) geometry = geometry.toNonIndexed();
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) return [];
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  geometry.applyMatrix4(mesh.matrixWorld);

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: position.count, materialIndex: 0 }];
  return groups
    .filter((group) => group.count > 0)
    .map((group) => ({
      surface: surfaceOf(materials[group.materialIndex ?? 0], images),
      geometry: slice(geometry, group.start, Math.min(group.count, position.count - group.start)),
    }));
}

function merge(geometries: BufferGeometry[], useGroups = false): BufferGeometry | null {
  if (geometries.length === 1 && !useGroups) return geometries[0];
  return mergeGeometries(geometries, useGroups);
}

/** Une los trozos de una pieza: uno por material, en el orden en que aparecen, con un grupo cada uno. */
function mergePiece(pieces: { surface: PartSurface; geometry: BufferGeometry }[]) {
  const byMaterial = new Map<string, { surface: PartSurface; geometries: BufferGeometry[] }>();
  for (const { surface, geometry } of pieces) {
    const entry = byMaterial.get(surface.material);
    if (entry) entry.geometries.push(geometry);
    else byMaterial.set(surface.material, { surface, geometries: [geometry] });
  }
  const entries = [...byMaterial.values()];
  const perMaterial = entries.map((entry) => merge(entry.geometries));
  if (perMaterial.some((g) => g === null)) return null;
  const geometry = merge(perMaterial as BufferGeometry[], true);
  return geometry ? { geometry, surfaces: entries.map((entry) => entry.surface) } : null;
}

export function buildFurnitureModel(scene: Object3D): FurnitureModel {
  scene.updateMatrixWorld(true);

  // Map conserva el orden de inserción = orden de recorrido del .dae.
  const byPieceNode = new Map<Object3D, { surface: PartSurface; geometry: BufferGeometry }[]>();
  const excluded = { lineObjects: 0, meshesWithoutCode: 0 };
  const images: Record<string, string> = scene.userData.materialImages ?? {};

  scene.traverse((object) => {
    if (object instanceof Line || object instanceof LineSegments) excluded.lineObjects += 1;
    if (!(object instanceof Mesh)) return;
    const pieceNode = findPieceNode(object);
    if (!pieceNode) {
      excluded.meshesWithoutCode += 1; // geometría suelta sin código: ni siquiera se procesa
      return;
    }
    const baked = bakeGeometry(object, images);
    if (baked.length === 0) return;
    const list = byPieceNode.get(pieceNode);
    if (list) list.push(...baked);
    else byPieceNode.set(pieceNode, baked);
  });

  const parts: FurniturePart[] = [];
  const counters = new Map<string, number>();
  for (const [node, pieces] of byPieceNode) {
    const merged = mergePiece(pieces);
    if (!merged) continue;
    const code = canonicalCode(node.name);
    const n = (counters.get(code) ?? 0) + 1;
    counters.set(code, n);
    parts.push({ instanceId: `${code}#${n}`, componentName: node.name, ...merged });
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

  return { parts, excluded };
}
