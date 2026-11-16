// Textos de pantalla del spike: títulos de rechazo y razones en castellano. Función pura (sin React).
// Cada rechazo dice qué exportar o corregir: el mensaje del parser ya lo trae; acá va el título y, si hace falta,
// el paso a paso.

import type { CsvRejection } from "./reasons";

export const REJECTION_TEXT: Record<CsvRejection, { title: string; fix: string }> = {
  "csv-vacio": {
    title: "El CSV está vacío",
    fix: "En OpenCutList, pestaña Piezas, Exportar: fuente «Listado de piezas», formato CSV, separador punto y coma, UTF-8.",
  },
  "lista-de-instancias": {
    title: "Esto es la «Lista de instancias», no el «Listado de piezas»",
    fix: "En OpenCutList, pestaña Piezas, Exportar: cambiá la fuente a «Listado de piezas» (trae la columna Cantidad) y volvé a subir.",
  },
  "columna-faltante": {
    title: "Falta una columna del Listado de piezas",
    fix: "Si falta una columna de borde: en OpenCutList, Opciones, desmarcá «ocultar la columna de cantos». Después exportá de nuevo el «Listado de piezas» sin quitar columnas.",
  },
  "columna-ambigua": {
    title: "Hay columnas repetidas",
    fix: "Exportá de nuevo el «Listado de piezas» desde OpenCutList, sin editar el CSV a mano.",
  },
  "unidad-no-soportada": {
    title: "Las medidas no están en milímetros",
    fix: "En SketchUp, Ventana, Información del modelo, Unidades: elegí milímetros. Después exportá de nuevo el «Listado de piezas».",
  },
};

const REASON_TEXT: Record<string, string> = {
  // CSV
  "codigo-ausente": "fila sin Designación",
  "formato-invalido": "código con formato inválido",
  "nombre-anomalo": "código con guiones bajos de más",
  "valor-invalido": "medida o cantidad inválida en el CSV",
  "codigo-repetido": "código repetido en el CSV",
  "tipo-material-no-soportado": "tipo de material que no es Tablero",
  "canto-ilegible": "celda de canto ilegible",
  "fila-canto-no-coincide": "las filas de canto no coinciden con los lados marcados",
  // motor
  "codigo-inexistente": "el código no está en el CSV",
  "codigo-duplicado": "código en varias filas del listado",
  "codigo-excluido": "código excluido del listado por el CSV",
  "medida-fuera-de-tolerancia": "medida del .dae fuera de tolerancia",
  "cupo-excedido": "el .dae tiene más instancias que la cantidad del CSV",
  "geometria-no-alineada": "pieza no alineada a los ejes: no se pudo medir",
  faltante: "el .dae tiene menos instancias que la cantidad del CSV",
  "sin-confirmar": "instancias sin confirmar",
  "instancia-no-segura": "alguna instancia no salió segura",
  // cruce
  "codigo-sin-instancias": "el .dae no tiene ninguna instancia con ese código",
  "cantidad-no-coincide": "la cantidad del CSV no coincide con el .dae",
  "medida-no-coincide": "las medidas del CSV no coinciden con el .dae",
  "canteado-no-coincide": "los lados con canto no coinciden con las caras de canto del .dae",
};

export const reasonText = (reason: string) => REASON_TEXT[reason] ?? reason;

export const SOURCE_TEXT: Record<string, string> = { csv: "CSV", motor: "motor", cruce: "cruce con el .dae" };

export const ESTADO_TEXT: Record<string, string> = {
  "en-revision": "En revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  "publicado-simulado": "Publicado (simulado)",
};

/** Zona horaria con la que se muestran las fechas del spike (el taller está en Argentina). */
export const DISPLAY_TIME_ZONE = "America/Buenos_Aires";

/**
 * "16/11/2026 16:55:09 (America/Buenos_Aires)": 24 horas, con segundos y la zona escrita. Se arma por partes (no con
 * `toLocaleString`) para que el formato no dependa del navegador ni del locale (sin "p. m." ni coma).
 */
export function formatFecha(iso: string, timeZone: string = DISPLAY_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")} (${timeZone})`;
}
