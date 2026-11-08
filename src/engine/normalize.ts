// Normalización del nombre del componente (spec-motor §3 y §6.1). Fuente única del formato del código:
// src/pdf/code.ts y hash.ts la usan (docs/spec-adapter-observation-listadoid.md §3.2, E3). El motor no importa
// @/model/; una prueba verifica que este formato y CODE_FORMAT de @/model/ids aceptan y rechazan lo mismo.
// El código es opaco (AS1): solo se valida el formato, no se interpretan sus segmentos.

/** Formato del código, sin anclas (`C` en spec-motor §3). */
const CODE = /\d{4}-\d{2}-M\d{2}-C\d{2}/.source;
const EXACT = new RegExp(`^${CODE}$`);
/** Canónico: `C` o `_C`, sin guiones bajos de más. */
const CANONICAL = new RegExp(`^_?(${CODE})$`);
/** Canónico o anómalo: `_` de más al inicio y/o al final. */
const ANOMALOUS = new RegExp(`^_*(${CODE})_*$`);

export type NameStatus =
  | { kind: "sin-componente" }
  | { kind: "canonico"; code: string }
  | { kind: "anomalo"; code: string }
  | { kind: "formato-invalido" };

/** El texto es un código normalizado (sin `_`). */
export function isCode(text: string): boolean {
  return EXACT.test(text);
}

/** `null` = malla sin componente. Un nombre vacío es un nombre inválido, no un componente sin nombre. */
export function normalizeName(rawName: string | null): NameStatus {
  if (rawName === null) return { kind: "sin-componente" };
  const canonical = CANONICAL.exec(rawName);
  if (canonical) return { kind: "canonico", code: canonical[1] };
  const anomalous = ANOMALOUS.exec(rawName);
  if (anomalous) return { kind: "anomalo", code: anomalous[1] };
  return { kind: "formato-invalido" };
}
