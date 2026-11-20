// IE-6 e IE-12: origen del frontend del ERP y cabeceras de framing (docs/spec-integracion-erp-minima.md v0.3).
// Función pura y sin imports: la usa next.config.ts (que no resuelve el alias "@/"), el servidor y las pruebas.
//
// `ERP_WEB_ORIGEN`: un solo origen exacto (p. ej. "https://erp-qa.casamueble.com.ar"), sin comodines, sin ruta y sin
// barra final; con NODE_ENV=production, solo https. Vacía o sin definir: la integración queda apagada (/erp/* y
// /api/erp/* responden 404, /api/trabajos también) y la app funciona como siempre.

export type MotivoOrigenInvalido = "comodin" | "no-es-origen" | "esquema" | "http-en-produccion" | "mas-de-uno";

export class OrigenErpInvalidoError extends Error {
  constructor(
    readonly variable: string,
    readonly motivo: MotivoOrigenInvalido,
  ) {
    super(`${variable} inválida (${motivo}). Tiene que ser un origen exacto, sin comodines ni barra final.`);
    this.name = "OrigenErpInvalidoError";
  }
}

/** Valida un origen exacto. Lanza `OrigenErpInvalidoError` (el mensaje nombra la variable, no el valor). */
export function parsearOrigen(valor: string, opciones: { variable: string; produccion: boolean; soloHttps?: boolean }): string {
  const { variable } = opciones;
  if (valor.includes("*")) throw new OrigenErpInvalidoError(variable, "comodin");
  if (valor.includes(",") || /\s/.test(valor)) throw new OrigenErpInvalidoError(variable, "mas-de-uno");
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new OrigenErpInvalidoError(variable, "no-es-origen");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new OrigenErpInvalidoError(variable, "esquema");
  // Coincidencia exacta: el texto tiene que ser el origen tal cual (sin ruta, consulta, usuario ni barra final).
  if (url.origin !== valor) throw new OrigenErpInvalidoError(variable, "no-es-origen");
  if ((opciones.produccion || opciones.soloHttps) && url.protocol !== "https:") throw new OrigenErpInvalidoError(variable, "http-en-produccion");
  return valor;
}

/** `ERP_WEB_ORIGEN` validada, o null si está vacía (integración apagada). */
export function origenWebDelEntorno(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.ERP_WEB_ORIGEN ?? "").trim();
  if (raw === "") return null;
  return parsearOrigen(raw, { variable: "ERP_WEB_ORIGEN", produccion: env.NODE_ENV === "production" });
}

export interface ReglaDeCabeceras {
  source: string;
  headers: { key: string; value: string }[];
}

/** Valor de `frame-ancestors` para /erp/*: el origen del ERP, o 'none' si la integración está apagada. */
export function frameAncestors(origen: string | null): string {
  return origen === null ? "frame-ancestors 'none'" : `frame-ancestors ${origen}`;
}

/**
 * Reglas de `headers()` de next.config.ts. Next aplica todas las que coinciden y, con la misma clave, gana la
 * última: primero 'none' para todo el sitio y después el origen del ERP para /erp y /erp/*.
 */
export function reglasDeFraming(origen: string | null): ReglaDeCabeceras[] {
  const csp = (value: string) => [{ key: "Content-Security-Policy", value }];
  return [
    { source: "/:path*", headers: csp("frame-ancestors 'none'") },
    { source: "/erp", headers: csp(frameAncestors(origen)) },
    { source: "/erp/:path*", headers: csp(frameAncestors(origen)) },
  ];
}
