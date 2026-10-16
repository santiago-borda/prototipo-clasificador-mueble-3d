import type { FurnitureDef, PieceType } from "@/data/types";

// Mueble sintético (datos inventados, sin relación con ningún cliente) que REPITE códigos de Olmo
// (`0001-01-M01-C01..C03`): reproduce la colisión Olmo/Sabrina sin necesitar los datos de Sabrina.
function piece(suffix: string, quantity: number): PieceType {
  return {
    qrId: `demo-${suffix.toLowerCase()}`,
    code: `0001-01-M01-${suffix}`,
    name: `Pieza demo ${suffix}`,
    moduleId: "mod-demo",
    lengthMm: 500,
    widthMm: 300,
    thicknessMm: 18,
    material: "Demo",
    quantity,
    edgeBanding: null,
    notes: null,
  };
}

export const collidingDef: FurnitureDef = {
  furniture: {
    id: "demo",
    qrId: "demo-mueble",
    name: "Mueble demo",
    dimsMm: { x: 1000, y: 1000, z: 500 },
    designVersion: "v0",
    newerVersionAvailable: false,
    edgeBandSpec: { type: "ABS", widthMm: 22, thicknessMm: 0.45, status: "provisorio" },
  },
  modules: [{ id: "mod-demo", qrId: "demo-mod", furnitureId: "demo", name: "Módulo demo" }],
  pieceTypes: [piece("C01", 2), piece("C02", 1), piece("C03", 4)],
  modelUrl: "/models/no-existe.dae",
  toleranceMm: 2,
};
