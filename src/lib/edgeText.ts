import type { EdgeId } from "@/data/types";

/** "2 largos, 1 corto" / "Sin canto". Se deriva de edgeBanding, no se duplica en los datos. */
export function edgeSummary(edges: readonly EdgeId[]): string {
  if (edges.length === 0) return "Sin canto";
  const largos = edges.filter((e) => e.startsWith("largo")).length;
  const cortos = edges.filter((e) => e.startsWith("corto")).length;
  const parts: string[] = [];
  if (largos > 0) parts.push(`${largos} ${largos === 1 ? "largo" : "largos"}`);
  if (cortos > 0) parts.push(`${cortos} ${cortos === 1 ? "corto" : "cortos"}`);
  return parts.join(", ");
}
