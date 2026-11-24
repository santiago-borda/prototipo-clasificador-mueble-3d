// Catálogo cerrado del parser del CSV de OpenCutList (docs/spec-importador-csv-envio.md §2; viene del spike, docs/spec-proto-csv-ocl.md §2). Valores en español y
// kebab-case, como los del PDF y el motor. Separado de src/pdf/reasons.ts a propósito: el spike es descartable y ese
// catálogo se compara con la spec del PDF.

/** El archivo entero se rechaza: no hay listado. */
export const CSV_REJECTIONS = ["csv-vacio", "lista-de-instancias", "columna-faltante", "columna-ambigua", "unidad-no-soportada"] as const;
export type CsvRejection = (typeof CSV_REJECTIONS)[number];

/** Razones de fila: el código va a `excluded` (o la fila a `unkeyedRows`) y el listado queda `borrador`. */
export const CSV_ROW_REASONS = [
  "codigo-ausente",
  "formato-invalido",
  "nombre-anomalo",
  "valor-invalido",
  "codigo-repetido",
  "tipo-material-no-soportado",
  "canto-ilegible",
  "fila-canto-no-coincide",
] as const;
export type CsvRowReason = (typeof CSV_ROW_REASONS)[number];

/** Avisos: se informan y no cambian el estado del listado. */
export const CSV_WARNINGS = ["nombre-ausente"] as const;
export type CsvWarning = (typeof CSV_WARNINGS)[number];

const byCatalog = (a: CsvRowReason, b: CsvRowReason) => CSV_ROW_REASONS.indexOf(a) - CSV_ROW_REASONS.indexOf(b);

/** Sin duplicados, en el orden del catálogo. */
export const orderedRowReasons = (reasons: Iterable<CsvRowReason>): CsvRowReason[] => [...new Set(reasons)].sort(byCatalog);
