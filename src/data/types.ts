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
  /**
   * Bordes que llevan canto. `[]` = sin canto (dato confirmado). `null` = sin dato: el listado no dice qué
   * bordes llevan canto (pendiente de confirmar con Casa Mueble, consulta 2 sobre el origen del canteado).
   */
  edgeBanding: readonly EdgeId[] | null;
  notes: string | null;
}

/**
 * Un mueble completo, listo para registrar: datos de ficha + de dónde sale su modelo 3D.
 * Cada mueble tiene su propio ámbito de códigos: dos muebles pueden repetir códigos de pieza
 * (Olmo y Sabrina comparten `0001-01-M01-C01..C15`), así que un código solo se interpreta
 * dentro del mueble al que pertenece (ver `data/registry.ts`).
 */
export interface FurnitureDef {
  furniture: Furniture;
  modules: readonly Module[];
  pieceTypes: readonly PieceType[];
  /** URL del .dae de este mueble. */
  modelUrl: string;
  /** Tolerancia (mm) al comparar la caja de la geometría con el listado (ver `model/verifyModel.ts`). */
  toleranceMm: number;
}
