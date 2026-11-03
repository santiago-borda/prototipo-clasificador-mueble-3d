// Mapeo de las subcolumnas de "Tiras de cantos" a EdgeId (docs/spec-esquema-pdf.md §5, RP3).
// `largo-*` es el lado L y `corto-*` el lado A; no significan el borde más largo o más corto (RP2).
// La columna ausente no pasa por acá: si vale `[]` o `null` está ABIERTO (§6, PDF-2).

import type { EdgeId } from "@/data/types";
import type { EdgeStrips } from "./types";

const EDGE_BY_STRIP: readonly (readonly [keyof EdgeStrips, EdgeId])[] = [
  ["s3", "corto-A"],
  ["s4", "corto-B"],
  ["s2", "largo-A"],
  ["s1", "largo-B"],
];

/** Bordes con marca, en el orden alfabético de la serialización del listado (motor §5.1). */
export function edgeStripsToEdgeIds(strips: EdgeStrips): EdgeId[] {
  return EDGE_BY_STRIP.filter(([strip]) => strips[strip] !== null).map(([, edge]) => edge);
}
