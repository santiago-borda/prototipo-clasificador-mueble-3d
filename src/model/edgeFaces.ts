// Detector de caras de canto (spec-motor §4a y §8.1; plan T4). Sale de tests/helpers/edgeFaces.ts.
// En el .dae, las "tiras de canto" no son piezas aparte: son caras del borde del panel con material `Canto_*`
// (ASUMIDO, AS4), de 2 triángulos cada una. Acá solo se mide cada triángulo; el agrupado de a pares y el error por
// cantidad impar viven en observe.ts, y la clasificación en largo/corto la hace el motor para cada candidato (§5.2).

import { Vector3, type BufferGeometry, type Material, type Mesh } from "three";

/** Material de cara de canto (AS4). */
export const CANTO_MATERIAL = /^Canto_/;

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * Largo (mm) de cada triángulo con material `Canto_*`: la dimensión mayor de su caja en coordenadas de mundo.
 * Supone la escena en metros y `mesh.matrixWorld` al día (`updateMatrixWorld` antes de llamar).
 */
export function edgeRunsOf(mesh: Mesh): number[] {
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
      const lo = corners[0].clone().min(corners[1]).min(corners[2]);
      const hi = corners[0].clone().max(corners[1]).max(corners[2]);
      runs.push(Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) * 1000);
    }
  }
  return runs;
}
