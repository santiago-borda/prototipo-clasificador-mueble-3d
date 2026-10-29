// DATOS MOCK — Escritorio Olmo, listado de Casa Mueble del 9/10.
// Medidas, cantidades y materiales: tomados del listado provisto. No agregar cifras que no estén en él.
// Todo lo marcado "ASUMIDO PARA EL PROTOTIPO" es un dato a confirmar con Casa Mueble.

import type { EdgeId, Furniture, FurnitureDef, Module, PieceType } from "./types";

export const furniture: Furniture = {
  id: "olmo",
  qrId: "olmo-mueble",
  name: "Escritorio Olmo",
  dimsMm: { x: 1200, y: 750, z: 550 },
  designVersion: "v1",
  // Poné true para ver el aviso "Hay una versión más nueva de este diseño".
  newerVersionAvailable: false,
  // Canto ABS 22 x 0,45 mm — provisorio.
  edgeBandSpec: { type: "ABS", widthMm: 22, thicknessMm: 0.45, status: "provisorio", note: "la lista de compra dice 0,22" },
};

// ASUMIDO PARA EL PROTOTIPO, a confirmar con Casa Mueble: la agrupación de piezas en módulos, los nombres
// de módulo y los qrId de módulo y de mueble (R6 sigue abierto).
// El código de pieza lleva M01 en todas, así que no sirve para agrupar.
export const modules: readonly Module[] = [
  { id: "mod-escritorio", qrId: "olmo-mod-escritorio", furnitureId: "olmo", name: "Escritorio" },
  { id: "mod-cajones", qrId: "olmo-mod-cajones", furnitureId: "olmo", name: "Módulo cajones" },
];

const BLANCO = "Blanco Nature";
const GAUDI = "Gaudi";
const MDF_BLANCO = "MDF blanco";

const ESC = "mod-escritorio";
const CAJ = "mod-cajones";

// Bordes. ASUMIDO PARA EL PROTOTIPO: falta el dato real de orientación.
// El listado solo dice cuántos largos y cuántos cortos llevan canto, no cuáles.
// Los ids (largo-A/B, corto-A/B) y la elección de cuáles se marcan son inventados para el prototipo.
const SIN_CANTO: readonly EdgeId[] = [];
const L1: readonly EdgeId[] = ["largo-A"]; // 1 largo
const C1: readonly EdgeId[] = ["corto-A"]; // 1 corto
const L1C1: readonly EdgeId[] = ["largo-A", "corto-A"]; // 1 largo y 1 corto
const L2C1: readonly EdgeId[] = ["largo-A", "largo-B", "corto-A"]; // 2 largos y 1 corto
const L2C2: readonly EdgeId[] = ["largo-A", "largo-B", "corto-A", "corto-B"]; // 2 largos y 2 cortos
const C2: readonly EdgeId[] = ["corto-A", "corto-B"]; // 2 cortos

/** Código canónico del componente en el .dae. M01 y los dos primeros segmentos son iguales en todas las piezas. */
const code = (suffix: string) => `0001-01-M01-${suffix}`;

function piece(
  suffix: string,
  name: string,
  moduleId: string,
  lengthMm: number,
  widthMm: number,
  thicknessMm: number,
  material: string,
  quantity: number,
  edgeBanding: readonly EdgeId[],
  notes: string | null = null,
): PieceType {
  return {
    qrId: `olmo-${suffix.toLowerCase()}`,
    code: code(suffix),
    name,
    moduleId,
    lengthMm,
    widthMm,
    thicknessMm,
    material,
    quantity,
    edgeBanding,
    notes,
  };
}

// 21 tipos de pieza, 33 instancias en total. Nombres tal cual el listado ("Cajon 1" está dos veces
// con distinto tamaño, y lo mismo "Cajon 2": no se inventan diferencias, las listas ya muestran las medidas).
export const pieceTypes: readonly PieceType[] = [
  // Blanco Nature, MDF 18 mm
  piece("C01", "Mesa/Techo escritorio", ESC, 980, 550, 18, BLANCO, 1, L2C2),
  piece("C02", "Lateral escritorio", ESC, 732, 550, 18, BLANCO, 1, L2C1),
  piece("C03", "Faja grande medio escritorio", ESC, 742, 200, 18, BLANCO, 1, L1C1),
  piece("C04", "Laterales sector cajones", CAJ, 550, 494, 18, BLANCO, 2, L1C1),
  piece("C05", "Piso y techo sector cajones", CAJ, 550, 404, 18, BLANCO, 2, C1),
  piece("C06", "Gola Vertical", CAJ, 404, 50, 18, BLANCO, 1, SIN_CANTO),
  piece("C07", "Gola Horizontal", CAJ, 404, 36, 18, BLANCO, 2, L1, "Medida provisoria (404 x 36 mm), a confirmar."),
  piece("C08", "Cajon 1", CAJ, 400, 100, 18, BLANCO, 2, L1),
  piece("C09", "Cajon 1", CAJ, 342, 100, 18, BLANCO, 2, L1),
  piece("C10", "Cajon 2", CAJ, 400, 200, 18, BLANCO, 2, L1),
  piece("C11", "Cajon 2", CAJ, 342, 200, 18, BLANCO, 2, L1),
  piece("C12", "Tapa cajon 1", CAJ, 440, 165, 18, BLANCO, 1, L2C2),
  piece("C13", "Tapa cajon 2", CAJ, 440, 296, 18, BLANCO, 1, L2C2),
  // Gaudi, MDF 18 mm
  piece("C14", "Techo y piso estante abierto", CAJ, 550, 440, 18, GAUDI, 2, L2C1),
  piece("C15", "Laterales estante abierto", CAJ, 550, 102, 18, GAUDI, 2, C1),
  piece("C16", "Fajas verticales", ESC, 682, 50, 18, GAUDI, 2, L1C1),
  piece("C17", "Fajas horizontales grandes", ESC, 962, 50, 18, GAUDI, 2, L1C1),
  piece("C18", "Faja horizontal chica", ESC, 514, 50, 18, GAUDI, 1, L1),
  piece("C19", "Faja donde apoya mesa", ESC, 514, 100, 18, GAUDI, 1, C2),
  // MDF 3 mm blanco
  piece("C20", "Fondo cajones", CAJ, 400, 378, 3, MDF_BLANCO, 2, SIN_CANTO),
  piece("C21", "Fondo sector cajones", CAJ, 614, 422, 3, MDF_BLANCO, 1, SIN_CANTO),
];

/** Olmo como mueble registrable. Tolerancia 2 mm: la de la verificación original. */
export const olmoDef: FurnitureDef = {
  furniture,
  modules,
  pieceTypes,
  modelUrl: "/models/Olmo/olmo.dae",
  toleranceMm: 2,
};
