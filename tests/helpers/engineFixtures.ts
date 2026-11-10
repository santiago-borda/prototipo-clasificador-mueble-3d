// Casos del motor armados a mano (plan T8: `obs(...)`, `row(...)`). Códigos de ejemplo con el proyecto 9999
// (anonimización de docs/): "C01" se expande a "9999-01-M01-C01", también dentro de un nombre ("_C01__").

import { DEFAULT_PARAMS, type EngineParams, type ListadoRow, type Observation } from "@/engine/types";
import type { AssociateInput } from "@/engine/associate";

export const MODEL_ID = "sha256:" + "0".repeat(64);
export const OTHER_MODEL_ID = "sha256:" + "1".repeat(64);

export const params: EngineParams = { toleranceMm: 2, ...DEFAULT_PARAMS };

/** "C01" → "9999-01-M01-C01". */
export const code = (short: string): string => `9999-01-M01-${short}`;

/** Expande cada `Cnn` de un nombre abreviado; `null` = malla sin componente. */
const expand = (rawName: string | null): string | null => (rawName === null ? null : rawName.replace(/C\d{2}/g, (c) => code(c)));

export interface ObsOptions {
  key?: string;
  size?: [number, number, number];
  axisAligned?: boolean;
  modelId?: string;
}

export function obs(rawName: string | null, o: ObsOptions = {}): Observation {
  return {
    modelId: o.modelId ?? MODEL_ID,
    instanceKey: o.key ?? "ID1",
    frameVersion: "marco/1",
    rawName: expand(rawName),
    sizeMm: o.size ?? [18, 300, 500],
    axisAligned: o.axisAligned ?? true,
    orientation: "vertical-lateral",
    centerRel: [0.5, 0.5, 0.5],
    crossesMidplane: [false, false, false],
    edgeRunsMm: "no-disponible",
    mirrored: false,
  };
}

/** Fila de 500 x 300 x 18 mm, salvo que se indique otra cosa. */
export function row(short: string, quantity: number, over: Partial<ListadoRow> = {}): ListadoRow {
  return {
    code: code(short),
    name: "Lateral",
    lengthMm: 500,
    widthMm: 300,
    thicknessMm: 18,
    material: "Melamina 18 mm",
    quantity,
    edgeBanding: null,
    notes: null,
    ...over,
  };
}

export function input(observations: readonly Observation[], listado: readonly ListadoRow[], p: EngineParams = params): AssociateInput {
  return { furnitureId: "sintetico", modelId: MODEL_ID, observations, listado, params: p };
}
