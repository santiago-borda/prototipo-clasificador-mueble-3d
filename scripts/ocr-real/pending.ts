// Clasificación de los `PendingField.path` para la consola (docs/spec-ocr-prueba-real.md §7). Pura.
// Solo devuelve conteos: no se imprime ninguna ruta.

export interface PendingCounts {
  code: number;
  name: number;
  finalL: number;
  finalA: number;
  quantity: number;
  cantos: number;
  otros: number;
}

type Named = "code" | "name" | "finalL" | "finalA" | "quantity";
const NAMED: readonly Named[] = ["code", "name", "finalL", "finalA", "quantity"];

export function classifyPending(paths: readonly string[]): PendingCounts {
  const counts: PendingCounts = { code: 0, name: 0, finalL: 0, finalA: 0, quantity: 0, cantos: 0, otros: 0 };
  for (const path of paths) {
    if (path.includes(".edges")) {
      counts.cantos += 1;
      continue;
    }
    const last = (path.split(".").pop() ?? "").replace(/\[\d+\]$/, "");
    const named = NAMED.find((key) => key === last);
    if (named) counts[named] += 1;
    else counts.otros += 1;
  }
  return counts;
}
