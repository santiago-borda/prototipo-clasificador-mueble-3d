// Tipos del dominio del spike. Sin dependencias de React ni de three.

export type ViewMode = "highlight" | "isolate" | "dim";

/** Borde de una pieza rectangular, orientado: largo A/B y corto A/B. */
export type EdgeId = "largo-A" | "largo-B" | "corto-A" | "corto-B";

export interface EdgeBandSpec {
  type: "ABS";
  widthMm: number;
  thicknessMm: number;
  status: "provisorio" | "confirmado";
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

/** PieceType + instancias físicas del 3D (resueltas vía mapping.ts). */
export interface ResolvedPieceType extends PieceType {
  instanceIds: readonly string[];
}
