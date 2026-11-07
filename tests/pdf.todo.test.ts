// Casos del plan de pruebas que necesitan código o respuestas de otra etapa (docs/test-plan-esquema-pdf.md).
// Quedan a la vista en cada corrida: al implementar cada uno, se mueve a su archivo.

import { describe, it } from "vitest";

describe("sesión 2b: cruce con el .dae (§7.2) y conversión al listado (§6)", () => {
  it.todo("TP-11: el cruce con el .dae compara {L, A, espesor} ordenado");
  it.todo("TP-40: Olmo contra su .dae");
  it.todo("TP-41: codigo-sin-instancias");
  it.todo("TP-42: instancias-sin-fila");
  it.todo("TP-43: cantidad-no-coincide");
  it.todo("TP-44: medidas en el borde (k = 0,95 / 1,00 / 1,05)");
  it.todo("TP-45: canteado-no-coincide");
  it.todo("TP-46: canteado neutral con |L - A| <= tolerancia");
});

describe("pendiente de otra definición", () => {
  it.todo("TP-23: columna de cantos ausente, [] o null (ABIERTO: PDF-2, spec §6)");
  it.todo("TP-55: extracción real de TextoPdf con un PDF con texto (consulta 58)");
  it.todo("TP-61: listadoId con la función del motor (src/engine/ no existe todavía)");
  it.todo("TP-70: casillas de R4 (supuesto PROVISORIO, spec §9)");
});
