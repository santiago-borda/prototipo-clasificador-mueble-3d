// Normalización del código de la designación (docs/spec-esquema-pdf.md §7.1; misma regla que el motor §6.1).
// El código es opaco: solo se valida el formato, no se interpretan sus segmentos.

import { CODE_FORMAT } from "@/model/ids";

const CORE = CODE_FORMAT.source.replace(/^\^/, "").replace(/\$$/, "");
const CANONICAL = new RegExp(`^_?(${CORE})$`);
const WITH_UNDERSCORES = new RegExp(`^_*(${CORE})_*$`);

export type NormalizedCode =
  | { state: "canonico" | "anomalo"; code: string }
  | { state: "ausente" | "invalido"; code: null };

export function normalizeCode(raw: string | null): NormalizedCode {
  if (raw === null || raw.trim() === "") return { state: "ausente", code: null };
  const canonical = CANONICAL.exec(raw);
  if (canonical) return { state: "canonico", code: canonical[1] };
  const anomalous = WITH_UNDERSCORES.exec(raw);
  if (anomalous) return { state: "anomalo", code: anomalous[1] };
  return { state: "invalido", code: null };
}

/** Si el texto, sin espacios, tiene forma de código (canónico o anómalo). Lo usa el parser para unir renglones. */
export function looksLikeCode(text: string): boolean {
  return WITH_UNDERSCORES.test(text);
}
