// Catálogo cerrado de los sitios de rechazo del parser (enmienda C2, docs/spec-revision-ocr-real.md §6.1;
// spec-esquema §8). Un id por sitio de `ReadFailure` en parseText.ts (lo verifica OR-18). El id y la página son lo
// único de un rechazo que una consola puede mostrar: no llevan texto del documento. El `detail` queda solo en
// archivos locales, porque algunos mensajes citan texto leído.
//
// `scope`: "pagina" si el rechazo es de una página (entonces `page` es un número), "documento" si no (`page = null`).

import type { PdfReadingFailure } from "./types";

interface RuleInfo {
  reason: PdfReadingFailure;
  scope: "pagina" | "documento";
}

export const PDF_REJECT_RULES = {
  // Documento.
  "documento-sin-texto": { reason: "sin-capa-de-texto", scope: "documento" },
  "documento-sin-resumen": { reason: "estructura-no-reconocida", scope: "documento" },
  "documento-sin-hojas": { reason: "estructura-no-reconocida", scope: "documento" },
  "hojas-numeracion-invalida": { reason: "estructura-no-reconocida", scope: "documento" },
  "hojas-columnas-distintas": { reason: "estructura-no-reconocida", scope: "documento" },
  // Resumen (página 1).
  "resumen-unidad-no-soportada": { reason: "unidad-no-soportada", scope: "pagina" },
  "resumen-sin-unidad": { reason: "estructura-no-reconocida", scope: "pagina" },
  "resumen-sin-titulo-o-tabla": { reason: "estructura-no-reconocida", scope: "pagina" },
  "resumen-titulo-ambiguo": { reason: "estructura-no-reconocida", scope: "pagina" },
  "resumen-titulo-sin-limite": { reason: "estructura-no-reconocida", scope: "pagina" },
  "resumen-tabla-sin-valor": { reason: "estructura-no-reconocida", scope: "pagina" },
  "resumen-celda-duplicada": { reason: "estructura-no-reconocida", scope: "pagina" },
  "resumen-fila-ambigua": { reason: "estructura-no-reconocida", scope: "pagina" },
  "resumen-tabla-vacia": { reason: "estructura-no-reconocida", scope: "pagina" },
  // Hojas.
  "hoja-sin-contador": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-sin-material": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-material-ambiguo": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-paginas-no-consecutivas": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-contador-distinto": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-material-distinto": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-pie-fuera-de-la-ultima": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-sin-pie": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-pie-ambiguo": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-diagrama-en-continuacion": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-texto-antes-de-filas": { reason: "estructura-no-reconocida", scope: "pagina" },
  "hoja-diagrama-en-continuacion-con-tabla": { reason: "hoja-incompleta", scope: "pagina" },
  "hoja-sin-encabezado-completo": { reason: "estructura-no-reconocida", scope: "pagina" },
  "hoja-medida-ambigua": { reason: "estructura-no-reconocida", scope: "pagina" },
  "hoja-tipo-ambiguo": { reason: "estructura-no-reconocida", scope: "pagina" },
} as const satisfies Record<string, RuleInfo>;

export type PdfRejectRule = keyof typeof PDF_REJECT_RULES;
