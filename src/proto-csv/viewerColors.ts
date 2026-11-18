// Colores del visor 3D de la revisión por nivel del tipo (spec §4.2, v0.4). Puro: lo usa el visor y lo prueba jsdom.

export const VIEWER_COLORS = {
  /** Pieza elegida en la tabla (se mantiene sea cual sea su nivel). */
  selected: "#0d9488",
  dudosa: "#dc2626",
  advertencia: "#f59e0b",
  neutral: "#cbd5e1",
} as const;

/** Rojo si el tipo es dudoso, ámbar si tiene advertencia, gris el resto; verde la elegida. Si estuviera en ambos conjuntos, gana el rojo (bloquea). */
export function pieceColor(code: string, selected: string | null, dudosas: ReadonlySet<string>, advertencias: ReadonlySet<string>): string {
  if (code === selected) return VIEWER_COLORS.selected;
  if (dudosas.has(code)) return VIEWER_COLORS.dudosa;
  if (advertencias.has(code)) return VIEWER_COLORS.advertencia;
  return VIEWER_COLORS.neutral;
}
