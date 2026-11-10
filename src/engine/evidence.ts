// Verificación dura de un par (observación, tipo): medidas y espesor (spec-motor §6.2, elemento 2).
// T7 mínimo (docs/spec-t7-verificaciones-duras.md v0.2): solo checkDims. La evidencia blanda (orientación, posición,
// canto, espejo) y `rank` se suman después del 20/11 sin cambiar esta firma (T7-E1).
// Puro: sin three, sin @/model/, sin DOM (tests/engine/purity.test.ts).

import type { EngineParams, Evidence, ListadoRow, Observation } from "./types";

export interface DimsCheck {
  /** false solo si obs.axisAligned es false: no se midió (T7-E2). */
  measured: boolean;
  /** measured y |Δ| ≤ tol + ε en los tres ejes. */
  ok: boolean;
  /** Suma de |Δ| de los tres ejes, en mm; null si no se midió (T7-E3). */
  deviationMm: number | null;
  /** Siempre dos, en este orden: espesor, medidas. */
  evidence: [Evidence, Evidence];
}

const NOT_ALIGNED = "geometría no alineada: no se mide";

/** Formato fijo del texto (T7-E4): el AssociationRun tiene que ser igual byte a byte entre corridas. */
const f = (x: number): string => x.toFixed(2);

export function checkDims(obs: Observation, type: ListadoRow, p: EngineParams): DimsCheck {
  if (!obs.axisAligned) {
    return {
      measured: false,
      ok: false,
      deviationMm: null,
      evidence: [
        { kind: "espesor", result: "no-disponible", detail: NOT_ALIGNED },
        { kind: "medidas", result: "no-disponible", detail: NOT_ALIGNED },
      ],
    };
  }

  // obs.sizeMm ya viene ascendente (marco v1); el listado se ordena para que L < A (sin reordenar en el PDF) compare bien.
  const listed = [type.thicknessMm, type.widthMm, type.lengthMm].sort((a, b) => a - b);
  const delta = obs.sizeMm.map((v, i) => v - listed[i]);
  // Sin redondeo en la decisión: la cuantización (tupleRoundingMm) es solo para la tupla de la pasada 2.
  const within = delta.map((d) => Math.abs(d) <= p.toleranceMm + p.epsilonMm);
  const thicknessOk = within[0];
  const sizeOk = within[1] && within[2];
  const t = f(p.toleranceMm);
  const [o0, o1, o2] = obs.sizeMm;
  const [l0, l1, l2] = listed;

  return {
    measured: true,
    ok: thicknessOk && sizeOk,
    deviationMm: Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2]),
    evidence: [
      {
        kind: "espesor",
        result: thicknessOk ? "cumple" : "no-cumple",
        detail: `espesor ${f(o0)} mm, listado ${f(l0)} mm, tolerancia ${t} mm`,
      },
      {
        kind: "medidas",
        result: sizeOk ? "cumple" : "no-cumple",
        detail: `medidas ${f(o1)} x ${f(o2)} mm, listado ${f(l1)} x ${f(l2)} mm, tolerancia ${t} mm`,
      },
    ],
  };
}
