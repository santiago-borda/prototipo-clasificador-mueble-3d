// Casos del plan de pruebas que necesitan código o respuestas de otra etapa (docs/test-plan-esquema-pdf.md).
// Quedan a la vista en cada corrida: al implementar cada uno, se mueve a su archivo.

import { describe, it } from "vitest";

describe("sesión 2b: cruce con el .dae (§7.2) y conversión al listado (§6)", () => {
  it.todo("TP-40: Olmo contra su .dae");
});

describe("pendiente de otra definición", () => {
  it.todo("TP-23: columna de cantos ausente, [] o null (ABIERTO: PDF-2, spec §6)");
  it.todo("TP-55: extracción real de TextoPdf con un PDF con texto (consulta 58)");
  it.todo("TP-61: listadoId con la función del motor (src/engine/ solo tiene tipos: la función no existe todavía)");
  it.todo("TP-70: casillas de R4 (supuesto PROVISORIO, spec §9)");
});
