// Detector de caras de canto, por triángulo (spec-motor §8.1 y §13; plan T4). Mallas de three armadas a mano:
// el largo esperado de cada triángulo se cuenta sobre sus vértices.

import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { CANTO_MATERIAL, edgeRunsOf } from "@/model/edgeFaces";

const material = (name: string) => Object.assign(new MeshBasicMaterial(), { name });

/** Triángulos en metros, sin índice. */
function geometryOf(triangles: number[][]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(triangles.flat()), 3));
  return geometry;
}

// Triángulo de 0,5 m en X y 0,018 m en Z (media cara de canto de 500 x 18 mm).
const T500 = [0, 0, 0, 0.5, 0, 0, 0.5, 0, 0.018];
const T300 = [0, 0, 0, 0, 0.3, 0, 0, 0.3, 0.018];

describe("edgeRunsOf", () => {
  it("convención Canto_* (AS4)", () => {
    expect(CANTO_MATERIAL.test("Canto_Blanco")).toBe(true);
    expect(CANTO_MATERIAL.test("Blanco_nature")).toBe(false);
    expect(CANTO_MATERIAL.test("canto_blanco")).toBe(false);
  });

  it("un material Canto_* sin grupos: un largo (mm) por triángulo, la dimensión mayor", () => {
    const mesh = new Mesh(geometryOf([T500, T500]), material("Canto_Blanco"));
    mesh.updateMatrixWorld(true);
    expect(edgeRunsOf(mesh)).toEqual([500, 500].map((v) => expect.closeTo(v, 3)));
  });

  it("un material que no es Canto_*: ninguna cara", () => {
    const mesh = new Mesh(geometryOf([T500, T500]), material("Blanco"));
    mesh.updateMatrixWorld(true);
    expect(edgeRunsOf(mesh)).toEqual([]);
  });

  it("varios materiales con grupos e índice: solo los triángulos de los grupos Canto_*", () => {
    const geometry = geometryOf([T500, T300]);
    geometry.setIndex([0, 1, 2, 3, 4, 5]);
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const mesh = new Mesh(geometry, [material("Blanco"), material("Canto_Cedro")]);
    mesh.updateMatrixWorld(true);
    expect(edgeRunsOf(mesh)).toEqual([expect.closeTo(300, 3)]);
  });

  it("usa la transformada de mundo (escala del padre)", () => {
    const parent = new Group();
    parent.scale.setScalar(2);
    const mesh = new Mesh(geometryOf([T500]), material("Canto_Blanco"));
    parent.add(mesh);
    parent.updateMatrixWorld(true);
    expect(edgeRunsOf(mesh)).toEqual([expect.closeTo(1000, 3)]);
  });
});
