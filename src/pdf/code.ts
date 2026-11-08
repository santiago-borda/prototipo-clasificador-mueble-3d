// Normalización del código de la designación (docs/spec-esquema-pdf.md §7.1). Envuelve la regla única del motor
// (spec-motor §6.1, src/engine/normalize.ts; docs/spec-adapter-observation-listadoid.md §3.2, E3).
// El código es opaco: solo se valida el formato, no se interpretan sus segmentos.
//
// Diferencia a propósito con el motor: una celda vacía (o solo espacios) del PDF es "sin código" (`ausente`);
// un componente del .dae con nombre vacío es un componente con nombre inválido (`formato-invalido`).

import { normalizeName } from "@/engine/normalize";

export type NormalizedCode =
  | { state: "canonico" | "anomalo"; code: string }
  | { state: "ausente" | "invalido"; code: null };

export function normalizeCode(raw: string | null): NormalizedCode {
  if (raw === null || raw.trim() === "") return { state: "ausente", code: null };
  const status = normalizeName(raw);
  switch (status.kind) {
    case "canonico":
    case "anomalo":
      return { state: status.kind, code: status.code };
    case "sin-componente":
      return { state: "ausente", code: null };
    case "formato-invalido":
      return { state: "invalido", code: null };
  }
}

/** Si el texto, sin espacios, tiene forma de código (canónico o anómalo). Lo usa el parser para unir renglones. */
export function looksLikeCode(text: string): boolean {
  const { kind } = normalizeName(text);
  return kind === "canonico" || kind === "anomalo";
}
