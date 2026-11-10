// Tipos del motor de asociación: fuente única (docs/spec-sesion-2b-listado-cruce.md §2.1, D1).
// Tal como están en docs/spec-motor-asociacion.md v3 §5.2 (`Observation`) y §5.3 (`Evidence`).
// Si esa spec cambia, cambia este archivo; nadie copia estos tipos. Además: `ListadoRow` (§5.1 enmendada), los
// contratos de resultados (§5.3), los catálogos cerrados (§5.4) y los parámetros (plan T2). El único valor es DEFAULT_PARAMS.

import type { EdgeId } from "@/data/types"; // solo tipo: @/data/types no trae three ni DOM

/**
 * Canteado de una fila del listado (spec-motor §5.1, enmendada por docs/spec-adapter-observation-listadoid.md §2.1):
 * lista de lados con canto (`[]` = sin canto), `null` = sin dato, `"sin-definir"` = columna ausente en el PDF (D3).
 * Las tres formas son distintas en el hash.
 */
export type ListadoEdgeBanding = readonly EdgeId[] | null | "sin-definir";

/** Fila del listado que entra al `listadoId`. `PieceType` (mock) y `ListedPiece` (PDF) son asignables. */
export interface ListadoRow {
  code: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: string;
  quantity: number;
  edgeBanding: ListadoEdgeBanding;
  notes: string | null;
}

/** Salida del adapter, única entrada geométrica del motor (spec-motor §5.2). */
export interface Observation {
  modelId: string;
  instanceKey: string;
  frameVersion: string;
  /** Nombre del componente (del XML); null = malla sin componente. */
  rawName: string | null;
  /** Caja ordenada ascendente (espesor, medio, mayor), en mm. */
  sizeMm: [number, number, number];
  /** false si hay normales fuera de los ejes. */
  axisAligned: boolean;
  /** Por el eje del espesor, en el marco. */
  orientation: "horizontal" | "vertical-lateral" | "vertical-frontal";
  /** Centro relativo a la caja de referencia del mueble, 0..1 por eje. */
  centerRel: [number, number, number];
  /** La caja de la instancia cruza el plano medio del mueble en ese eje. */
  crossesMidplane: [boolean, boolean, boolean];
  /** Largo de cada cara de canto; sin caras Canto_* -> "no-disponible". */
  edgeRunsMm: number[] | "no-disponible";
  /** Transformada con determinante < 0. */
  mirrored: boolean;
}

/** Evidencia de una comparación (spec-motor §5.3). */
export interface Evidence {
  kind: "codigo" | "medidas" | "espesor" | "cantidad" | "orientacion" | "posicion" | "canto" | "espejo";
  result: "cumple" | "no-cumple" | "neutral" | "no-disponible";
  /** Texto legible: qué se comparó y con qué valores. */
  detail: string;
  /** Id de la regla de vocabulario, si aplica. */
  rule?: string;
}

type Score = number;

/** 7 números, menor = mejor, comparación lexicográfica (plan, "Decisiones"; spec-motor §6.3). */
export type ScoreTuple = [Score, Score, Score, Score, Score, Score, Score];

export type Level = "segura" | "dudosa" | "sin-asociar";

/** Razones de nivel (spec-motor §5.4). */
export type Reason =
  | "codigo-exacto"
  | "nombre-anomalo"
  | "formato-invalido"
  | "codigo-inexistente"
  | "codigo-duplicado"
  /** spec-motor v3.1 (T10-E4): el código está en el PDF pero toListing lo dejó en `excluded` (datos no tomables). */
  | "codigo-excluido"
  | "medida-fuera-de-tolerancia"
  | "cupo-excedido"
  | "geometria-no-alineada"
  | "sin-componente"
  | "empate";

/** Advertencias: evidencia blanda que no coincide (spec-motor §5.4). */
export type Warning = "orientacion-no-coincide" | "posicion-no-coincide" | "canto-no-coincide";

/** Inconsistencias de corrida (spec-motor §5.4). */
export interface Inconsistency {
  kind: "faltante" | "sin-confirmar" | "cupo-excedido" | "cupo-completo-sugerido" | "conflicto" | "sin-componente";
  pieceCode: string | null;
  instanceKeys: string[];
  detail: string;
}

export interface Candidate {
  pieceCode: string;
  tuple: ScoreTuple;
  cupoCompleto: boolean;
  /** P. ej. "tipo del código; medidas no coinciden". */
  notes: string[];
  evidence: Evidence[];
}

export interface InstanceResult {
  instanceKey: string;
  level: Level;
  /** Solo si es segura. */
  pieceCode: string | null;
  /** Catálogo cerrado; puede llevar más de una, en el orden en que se evalúan (§6.1, §6.2). */
  reasons: Reason[];
  warnings: Warning[];
  /** Top-3 por tupla y luego por código; [] para segura, sin-componente y dudosas sin tipo que cumpla medidas. */
  candidates: Candidate[];
  evidence: Evidence[];
}

export interface EngineParams {
  /** FurnitureDef.toleranceMm (AS8). */
  toleranceMm: number;
  epsilonMm: number;
  tupleRoundingMm: number;
}

export const DEFAULT_PARAMS: Omit<EngineParams, "toleranceMm"> = { epsilonMm: 1e-6, tupleRoundingMm: 0.01 };

/** Sin fechas ni tiempos: la misma entrada da la misma salida, byte a byte (§5.3). */
export interface AssociationRun {
  furnitureId: string;
  modelId: string;
  listadoId: string;
  engineRunId: string;
  versions: { engine: string; vocabulary: string; frame: string };
  params: EngineParams;
  /** spec-motor v3.1 (T10-E2): pasadas corridas. 1 = sin ranking (dudosas con `candidates: []` = "no se rankeó"). No entra en el engineRunId. */
  passes: 1 | 2;
  /** Ordenados por instanceKey, comparación binaria (no por locale). */
  results: InstanceResult[];
  typeSummary: { pieceCode: string; quantity: number; claimants: number; seguras: number }[];
  inconsistencies: Inconsistency[];
}
