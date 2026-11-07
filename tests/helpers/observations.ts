// Adaptador mínimo DE PRUEBA: .dae -> Observation (docs/spec-sesion-2b-listado-cruce.md §5, D2).
// No es el adapter del motor: solo llena los campos que usa el cruce (§2.1: modelId, instanceKey, rawName, sizeMm,
// edgeRunsMm). El resto lleva valores fijos NO REALES (ver noReal): marco, orientación, posición y espejo son
// lógica del adapter del motor y acá no se calculan.

import type { Observation } from "@/engine/types";
import { componentCode } from "@/model/ids";
import { collectEdgeFaces } from "./edgeFaces";
import { loadDaeModel, loadDaeScene } from "./loadModel";

/** Campos que el cruce no usa: valores fijos, no medidos. No usar estas observaciones fuera del cruce. */
const noReal = (): Omit<Observation, "modelId" | "instanceKey" | "rawName" | "sizeMm" | "edgeRunsMm"> => ({
  frameVersion: "no-real:prueba-2b",
  axisAligned: true,
  orientation: "horizontal",
  centerRel: [0, 0, 0],
  crossesMidplane: [false, false, false],
  mirrored: false,
});

/**
 * Una observación por instancia de pieza del .dae. `sizeMm`: caja de la geometría de la `FurniturePart`, en mm,
 * ascendente. `edgeRunsMm`: caras `Canto_*` de `collectEdgeFaces` (lee la escena antes del merge, porque
 * `colladaModel.ts` quita los grupos), o "no-disponible" si la instancia no tiene. Las dos listas recorren el .dae
 * en el mismo orden: la n-ésima instancia de un código en una es la n-ésima en la otra (se comprueba el conteo).
 */
export function observationsFromDae(file: string, modelId: string): Observation[] {
  const model = loadDaeModel(file);
  const runsByCode = new Map<string, number[][]>();
  for (const { code, runsMm } of collectEdgeFaces(loadDaeScene(file))) runsByCode.set(code, [...(runsByCode.get(code) ?? []), runsMm]);

  const used = new Map<string, number>();
  const observations = model.parts.map((part): Observation => {
    const code = componentCode(part.instanceId);
    if (code === null) throw new Error(`${part.instanceId}: instancia sin código`);
    const n = used.get(code) ?? 0;
    used.set(code, n + 1);
    const runs = runsByCode.get(code)?.[n];
    if (runs === undefined) throw new Error(`${part.instanceId}: sin entrada en collectEdgeFaces`);

    part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (!box) throw new Error(`${part.instanceId}: sin caja`);
    const sizeMm = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((m) => m * 1000).sort((a, b) => a - b) as [number, number, number];

    return { ...noReal(), modelId, instanceKey: part.instanceId, rawName: part.componentName, sizeMm, edgeRunsMm: runs.length > 0 ? runs : "no-disponible" };
  });

  for (const [code, list] of runsByCode) {
    if (list.length !== (used.get(code) ?? 0)) throw new Error(`${code}: ${list.length} entradas de canto y ${used.get(code) ?? 0} instancias`);
  }
  return observations;
}
