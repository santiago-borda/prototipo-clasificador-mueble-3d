// M13 (plan T11): npm run eval con --sabrina-dir inexistente. Necesita eval/esperados.json del primer fixture, que nace en T12
// (docs/spec-t11-harness-minimo.md §4, T11-E9): hasta entonces `npm run eval` sale con 1 por G2. Se activa en T12.

import { describe, it } from "vitest";

describe("M13: npm run eval sin segundo fixture", () => {
  it.todo("M13: npm run eval con --sabrina-dir inexistente sale con 0 y el reporte dice 'no ejecutado' (se activa en T12)");
});
