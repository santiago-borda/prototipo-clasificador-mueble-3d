// IE-10: lista de orígenes del frontend del ERP que pueden embeber /embebido/* y cabeceras de framing.
// Función pura y sin imports: la usa next.config.ts (que no resuelve el alias "@/"), el servidor y las pruebas.
//
// `ERP_FRONT_ORIGENES`: orígenes exactos separados por coma (p. ej. "https://erp-qa.casamueble.com.ar").
// Sin comodines, sin ruta ni barra final y, con NODE_ENV=production, solo https. Vacía o sin definir: el embebido
// queda apagado (ningún origen puede embeber nada) y la app funciona como siempre.

export class OrigenesErpInvalidosError extends Error {
  constructor(readonly motivo: "comodin" | "no-es-origen" | "esquema" | "http-en-produccion", readonly valor: string) {
    super(`ERP_FRONT_ORIGENES inválida (${motivo}): "${valor}". Tienen que ser orígenes exactos, sin comodines.`);
    this.name = "OrigenesErpInvalidosError";
  }
}

/** Valida y devuelve la lista (sin repetidos, en el orden dado). Lanza `OrigenesErpInvalidosError`. */
export function parsearOrigenes(raw: string | undefined, opciones: { produccion: boolean }): string[] {
  const valores = (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  const lista: string[] = [];
  for (const valor of valores) {
    if (valor.includes("*")) throw new OrigenesErpInvalidosError("comodin", valor);
    let url: URL;
    try {
      url = new URL(valor);
    } catch {
      throw new OrigenesErpInvalidosError("no-es-origen", valor);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new OrigenesErpInvalidosError("esquema", valor);
    // Coincidencia exacta: el texto tiene que ser el origen tal cual (sin ruta, consulta, usuario ni barra final).
    if (url.origin !== valor) throw new OrigenesErpInvalidosError("no-es-origen", valor);
    if (opciones.produccion && url.protocol !== "https:") throw new OrigenesErpInvalidosError("http-en-produccion", valor);
    if (!lista.includes(valor)) lista.push(valor);
  }
  return lista;
}

/** Lista de orígenes del entorno del proceso. */
export function origenesDelEntorno(env: Record<string, string | undefined> = process.env): string[] {
  return parsearOrigenes(env.ERP_FRONT_ORIGENES, { produccion: env.NODE_ENV === "production" });
}

export interface ReglaDeCabeceras {
  source: string;
  headers: { key: string; value: string }[];
}

/** Valor de `frame-ancestors` para /embebido/*: la lista, o 'none' si está vacía. */
export function frameAncestors(origenes: readonly string[]): string {
  return origenes.length === 0 ? "frame-ancestors 'none'" : `frame-ancestors ${origenes.join(" ")}`;
}

/**
 * Reglas de `headers()` de next.config.ts. Next aplica todas las que coinciden y, con la misma clave, gana la
 * última: primero 'none' para todo el sitio y después la lista para /embebido y /embebido/*.
 */
export function reglasDeFraming(origenes: readonly string[]): ReglaDeCabeceras[] {
  const csp = (value: string) => [{ key: "Content-Security-Policy", value }];
  return [
    { source: "/:path*", headers: csp("frame-ancestors 'none'") },
    { source: "/embebido", headers: csp(frameAncestors(origenes)) },
    { source: "/embebido/:path*", headers: csp(frameAncestors(origenes)) },
  ];
}
