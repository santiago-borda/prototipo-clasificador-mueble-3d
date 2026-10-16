import { Mesh, Vector3, type BufferGeometry, type Material, type Object3D } from "three";
import { PIECE_NAME, canonicalCode } from "@/model/ids";

// En el .dae de Sabrina las "tiras de canto" no son piezas aparte: son caras del borde del panel con material
// `Canto_*` (Canto_Blanco, Canto_Cedro), de 2 triángulos cada una. Acá se cuentan por instancia y se mide cuánto
// corre cada una (su dimensión mayor, en mm) para clasificarla en largo / corto.

const CANTO_MATERIAL = /^Canto_/;

export interface EdgeFaces {
  /** `<código>` de la instancia (sin `#n`). */
  code: string;
  /** Largo (mm) de cada cara de canto de la instancia. */
  runsMm: number[];
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Largo (mm) de cada triángulo con material de canto: la dimensión mayor de su caja en coordenadas de mundo. */
function cantoTriangleRuns(mesh: Mesh): number[] {
  const geometry: BufferGeometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const materials = materialsOf(mesh);
  const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: index ? index.count : position.count, materialIndex: 0 }];
  const runs: number[] = [];

  for (const group of groups) {
    const material = materials[group.materialIndex ?? 0];
    if (!material || !CANTO_MATERIAL.test(material.name)) continue;
    for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
      const corners = [0, 1, 2].map((k) => {
        const vertex = index ? index.getX(i + k) : i + k;
        return new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld);
      });
      const lo = new Vector3().copy(corners[0]).min(corners[1]).min(corners[2]);
      const hi = new Vector3().copy(corners[0]).max(corners[1]).max(corners[2]);
      runs.push(Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) * 1000);
    }
  }
  return runs;
}

/**
 * Una entrada por instancia de pieza (componente con código) con el largo de cada una de sus caras de canto.
 * Cada cara son 2 triángulos: se agrupa de a dos por largo.
 */
export function collectEdgeFaces(scene: Object3D): EdgeFaces[] {
  scene.updateMatrixWorld(true);
  const byNode = new Map<Object3D, number[]>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    let node: Object3D | null = object;
    while (node && !PIECE_NAME.test(node.name)) node = node.parent;
    if (!node) return;
    const runs = cantoTriangleRuns(object);
    byNode.set(node, [...(byNode.get(node) ?? []), ...runs]);
  });

  return [...byNode].map(([node, triangleRuns]) => {
    // 2 triángulos por cara: ordenados quedan contiguos de a pares.
    const sorted = [...triangleRuns].sort((a, b) => a - b);
    if (sorted.length % 2 !== 0) throw new Error(`${node.name}: cantidad impar de triángulos de canto (${sorted.length}).`);
    const faces = sorted.filter((_, i) => i % 2 === 0);
    return { code: canonicalCode(node.name), runsMm: faces };
  });
}
