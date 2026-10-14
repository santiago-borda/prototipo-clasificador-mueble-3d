// Verificación de desarrollo: ¿el modelo 3D cargado coincide con el listado de piezas?
// Función pura (sin three ni React): devuelve los resultados, quien la llama decide cómo mostrarlos.

import type { PieceType } from "@/data/types";
import type { FurniturePart } from "./types";
import { CODE_FORMAT, canonicalCode, componentCode } from "./ids";

/** Tolerancia al comparar la caja de la geometría con las medidas del listado. */
const TOLERANCE_MM = 2;

export interface ModelVerification {
  types: number;
  instances: number;
  /** Diferencias entre el listado y el modelo. Se espera que no haya ninguna. */
  warnings: string[];
  /** Rarezas del nombre en el .dae que no impiden asociar la pieza (ej. guiones bajos de más). */
  anomalies: string[];
}

export function verifyModel(parts: readonly FurniturePart[], pieces: readonly PieceType[]): ModelVerification {
  const warnings: string[] = [];
  const anomalies: string[] = [];

  for (const piece of pieces) {
    // (c) formato del código
    if (!CODE_FORMAT.test(piece.code)) warnings.push(`${piece.code}: el código no tiene el formato esperado.`);

    const instances = parts.filter((part) => componentCode(part.instanceId) === piece.code);

    // (a) cantidad de instancias == cantidad del listado
    if (instances.length !== piece.quantity) {
      warnings.push(`${piece.code}: el listado dice ${piece.quantity} y el modelo tiene ${instances.length} instancias.`);
    }

    // (b) caja de la geometría == largo x ancho x espesor del listado. El modelo está en metros.
    const expected = [piece.thicknessMm, piece.widthMm, piece.lengthMm].sort((a, b) => a - b);
    for (const part of instances) {
      const box = part.geometry.boundingBox;
      if (!box) {
        warnings.push(`${part.instanceId}: la geometría no tiene caja calculada.`);
        continue;
      }
      const actual = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]
        .map((meters) => meters * 1000)
        .sort((a, b) => a - b);
      if (actual.some((mm, i) => Math.abs(mm - expected[i]) > TOLERANCE_MM)) {
        const fmt = (values: number[]) => values.map((v) => Math.round(v * 10) / 10).join(" x ");
        warnings.push(`${part.instanceId}: mide ${fmt(actual)} mm y el listado dice ${fmt(expected)} mm (espesor x ancho x largo).`);
      }
    }
  }

  // Nombres del .dae con algo de más respecto del código canónico (se asocian igual).
  const seen = new Set<string>();
  for (const part of parts) {
    if (seen.has(part.componentName)) continue;
    seen.add(part.componentName);
    const expectedName = `_${canonicalCode(part.componentName)}`;
    if (part.componentName !== expectedName) {
      anomalies.push(`El componente "${part.componentName}" tiene guiones bajos de más al final; se usa el código "${canonicalCode(part.componentName)}".`);
    }
  }

  return { types: pieces.length, instances: parts.length, warnings, anomalies };
}
