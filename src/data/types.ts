// Tipos del dominio del prototipo. Sin dependencias de React ni de three.

export type ViewMode = "highlight" | "isolate" | "dim";

/** Borde de una pieza rectangular, orientado: largo A/B y corto A/B. */
export type EdgeId = "largo-A" | "largo-B" | "corto-A" | "corto-B";

export interface EdgeBandSpec {
  type: "ABS";
  widthMm: number;
  thicknessMm: number;
  status: "provisorio" | "confirmado";
  /** Aclaración que se muestra junto al canto (ej. discrepancia con la lista de compra). */
  note?: string;
}

export interface Furniture {
  id: string;
  qrId: string;
  name: string;
  /** Medidas generales del mueble (x ancho, y alto, z profundidad), en mm. */
  dimsMm: { x: number; y: number; z: number };
  designVersion: string;
  /** Flag mock: true muestra el aviso "Hay una versión más nueva de este diseño". */
  newerVersionAvailable: boolean;
  edgeBandSpec: EdgeBandSpec;
}

export interface Module {
  id: string;
  qrId: string;
  furnitureId: string;
  name: string;
}

export interface PieceType {
  qrId: string;
  /** Código canónico del componente en el .dae: `0001-01-M01-C04`. */
  code: string;
  name: string;
  moduleId: string;
  /** Largo x ancho, en mm. */
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: string;
  /** Cantidad de piezas equivalentes (mismo tipo, mismas medidas). */
  quantity: number;
  /** Bordes que llevan canto. Vacío = sin canto. */
  edgeBanding: readonly EdgeId[];
  notes: string | null;
}
