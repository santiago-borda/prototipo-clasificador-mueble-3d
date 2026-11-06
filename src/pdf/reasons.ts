// Catálogo cerrado de razones (docs/spec-esquema-pdf.md §7.3).

export const PDF_REASONS = [
  "esquema-invalido",
  "estructura-no-reconocida",
  "unidad-no-soportada",
  "sin-capa-de-texto",
  "campo-pendiente",
  "codigo-ausente",
  "nombre-anomalo",
  "formato-invalido",
  "codigo-duplicado-en-tablero",
  "letra-duplicada-en-tablero",
  "letra-inconsistente",
  "suma-tablero-no-coincide",
  "suma-resumen-no-coincide",
  "diagrama-no-coincide",
  "hoja-incompleta",
  "lectura-fallida",
  "pieza-mayor-que-tablero",
  "cantos-inconsistentes",
  "codigo-con-distinto-material",
  "codigo-con-distintas-medidas",
  "codigo-con-distinto-canteado",
  "codigo-con-distinto-nombre",
  "porcentaje-invalido",
  "origen-ocr",
  "codigo-sin-instancias",
  "instancias-sin-fila",
  "cantidad-no-coincide",
  "medida-no-coincide",
  "canteado-no-coincide",
] as const;

export type PdfReason = (typeof PDF_REASONS)[number];

/** Un documento con cualquiera de estas razones se rechaza entero: no hay filas (§7.3). */
export const REJECTING_REASONS: readonly PdfReason[] = [
  "esquema-invalido",
  "unidad-no-soportada",
  "estructura-no-reconocida",
  "hoja-incompleta",
];
