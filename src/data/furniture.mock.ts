// DATOS MOCK — subconjunto del Escritorio Olmo para el spike.
// Medidas y cantidades: tomadas del listado provisto. No agregar cifras que no estén en él.
// Todo lo marcado "ASUMIDO PARA EL PROTOTIPO" es un dato a confirmar con Casa Mueble.

import type { Furniture, Module, PieceType } from "./types";

export const furniture: Furniture = {
  id: "olmo",
  qrId: "olmo-mueble",
  name: "Escritorio Olmo",
  dimsMm: { x: 1200, y: 750, z: 550 },
  designVersion: "v1",
  // Poné true para ver el aviso "Hay una versión más nueva de este diseño".
  newerVersionAvailable: false,
  // Canto ABS 22 x 0,45 mm — provisorio.
  edgeBandSpec: { type: "ABS", widthMm: 22, thicknessMm: 0.45, status: "provisorio" },
};

// ASUMIDO PARA EL PROTOTIPO: la agrupación de piezas en módulos.
export const modules: readonly Module[] = [
  { id: "mod-escritorio", qrId: "olmo-mod-escritorio", furnitureId: "olmo", name: "Escritorio" },
  { id: "mod-cajones", qrId: "olmo-mod-cajones", furnitureId: "olmo", name: "Módulo cajones" },
];

const BLANCO = "Blanco Nature";

// ASUMIDO PARA EL PROTOTIPO: falta el dato real de orientación.
// El listado original solo dice cuántos largos y cuántos cortos llevan canto, no cuáles.
// Los ids (largo-A/B, corto-A/B) y la elección de cuáles se marcan son inventados para el spike.
export const pieceTypes: readonly PieceType[] = [
  {
    qrId: "olmo-01",
    code: "_01",
    name: "Mesa / techo escritorio",
    moduleId: "mod-escritorio",
    lengthMm: 980,
    widthMm: 550,
    thicknessMm: 18,
    material: BLANCO,
    quantity: 1,
    // 2 largos y 2 cortos
    edgeBanding: ["largo-A", "largo-B", "corto-A", "corto-B"],
    notes: null,
  },
  {
    qrId: "olmo-02",
    code: "_02",
    name: "Lateral escritorio",
    moduleId: "mod-escritorio",
    lengthMm: 732,
    widthMm: 550,
    thicknessMm: 18,
    material: BLANCO,
    quantity: 1,
    // 2 largos y 1 corto
    edgeBanding: ["largo-A", "largo-B", "corto-A"],
    notes: null,
  },
  {
    qrId: "olmo-04",
    code: "_04",
    name: "Lateral módulo cajones",
    moduleId: "mod-cajones",
    lengthMm: 550,
    widthMm: 494,
    thicknessMm: 18,
    material: BLANCO,
    quantity: 2,
    // 1 largo y 1 corto
    edgeBanding: ["largo-A", "corto-A"],
    notes: "2 piezas equivalentes: se resaltan las dos en el 3D.",
  },
  {
    qrId: "olmo-05",
    code: "_05",
    name: "Piso y techo módulo cajones",
    moduleId: "mod-cajones",
    lengthMm: 550,
    widthMm: 404,
    thicknessMm: 18,
    material: BLANCO,
    quantity: 2,
    // 1 corto
    edgeBanding: ["corto-A"],
    notes: "Una pieza hace de piso y la otra de techo; son equivalentes.",
  },
  {
    qrId: "olmo-06",
    code: "_06",
    name: "Gola vertical",
    moduleId: "mod-cajones",
    lengthMm: 404,
    widthMm: 50,
    thicknessMm: 18,
    material: BLANCO,
    quantity: 1,
    edgeBanding: [],
    notes: "Sin canto.",
  },
  {
    qrId: "olmo-12",
    code: "_12",
    name: "Fondo cajones",
    moduleId: "mod-cajones",
    lengthMm: 400,
    widthMm: 378,
    thicknessMm: 3,
    material: "MDF blanco",
    quantity: 2,
    edgeBanding: [],
    notes: "Sin canto.",
  },
];
