// TIE-11 y TIE-12 (docs/spec-integracion-erp-minima.md §7): política de framing (IE-10).

import { afterEach, describe, expect, it, vi } from "vitest";
import { frameAncestors, OrigenesErpInvalidosError, parsearOrigenes, reglasDeFraming, type ReglaDeCabeceras } from "@/lib/embebido/origenes";

/** Coincidencia de `source` de Next para las formas que usamos: exacta o `/<prefijo>/:path*` (cero o más segmentos). */
function coincide(source: string, ruta: string): boolean {
  if (source.endsWith("/:path*")) {
    const base = source.slice(0, -"/:path*".length);
    return base === "" || ruta === base || ruta.startsWith(`${base}/`);
  }
  return source === ruta;
}

/** Valor efectivo de una cabecera: con la misma clave, gana la última regla que coincide (docs de Next, headers). */
function efectiva(reglas: readonly ReglaDeCabeceras[], ruta: string, clave: string): string | undefined {
  let valor: string | undefined;
  for (const regla of reglas) {
    if (!coincide(regla.source, ruta)) continue;
    for (const h of regla.headers) if (h.key === clave) valor = h.value;
  }
  return valor;
}

async function reglasDeNextConfig(env: Record<string, string | undefined>): Promise<ReglaDeCabeceras[]> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  const { default: config } = await import("../../next.config");
  return (await config.headers!()) as ReglaDeCabeceras[];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TIE-11: cabeceras de framing", () => {
  const ORIGENES = ["https://erp-qa.casamueble.com.ar", "https://erp.casamueble.com.ar"];

  it("/embebido y /embebido/* llevan frame-ancestors con la lista; /p/<qrId> y el resto, 'none'", () => {
    const reglas = reglasDeFraming(ORIGENES);
    const lista = "frame-ancestors https://erp-qa.casamueble.com.ar https://erp.casamueble.com.ar";
    for (const ruta of ["/embebido", "/embebido/proyectos/P-0002", "/embebido/proyectos/P-0002/visor/D-1/erp-x"]) {
      expect(efectiva(reglas, ruta, "Content-Security-Policy"), ruta).toBe(lista);
    }
    for (const ruta of ["/", "/p/olmo-c04", "/p/olmo-mueble", "/prueba/abc", "/importar", "/qr", "/escanear", "/api/embebido/sesion", "/embebidos", "/embebido-x"]) {
      expect(efectiva(reglas, ruta, "Content-Security-Policy"), ruta).toBe("frame-ancestors 'none'");
    }
  });

  it("sin orígenes configurados, nada se puede embeber", () => {
    expect(frameAncestors([])).toBe("frame-ancestors 'none'");
    const reglas = reglasDeFraming([]);
    expect(efectiva(reglas, "/embebido/proyectos/P-0002", "Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("next.config.ts aplica esas reglas y conserva X-Robots-Tag", async () => {
    const reglas = await reglasDeNextConfig({ ERP_FRONT_ORIGENES: ORIGENES.join(","), NODE_ENV: "production" });
    expect(efectiva(reglas, "/embebido/proyectos/P-0002", "Content-Security-Policy")).toBe(frameAncestors(ORIGENES));
    expect(efectiva(reglas, "/p/olmo-c04", "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(efectiva(reglas, "/p/olmo-c04", "X-Robots-Tag")).toBe("noindex, nofollow");
    expect(efectiva(reglas, "/embebido", "X-Robots-Tag")).toBe("noindex, nofollow");
  });
});

describe("TIE-12: ERP_FRONT_ORIGENES se valida al arrancar", () => {
  it.each([
    ["comodín de subdominio", "https://*.casamueble.com.ar", "comodin"],
    ["comodín solo", "*", "comodin"],
    ["con ruta", "https://erp-qa.casamueble.com.ar/app", "no-es-origen"],
    ["con barra final", "https://erp-qa.casamueble.com.ar/", "no-es-origen"],
    ["sin esquema", "erp-qa.casamueble.com.ar", "no-es-origen"],
    ["otro esquema", "ftp://erp-qa.casamueble.com.ar", "esquema"],
    ["con mayúsculas (no es el origen tal cual)", "https://ERP-qa.casamueble.com.ar", "no-es-origen"],
  ])("%s: error", (_caso, valor, motivo) => {
    expect(() => parsearOrigenes(valor, { produccion: false })).toThrow(OrigenesErpInvalidosError);
    try {
      parsearOrigenes(valor, { produccion: false });
    } catch (e) {
      expect((e as OrigenesErpInvalidosError).motivo).toBe(motivo);
    }
  });

  it("http en producción: error; en desarrollo se acepta", () => {
    expect(() => parsearOrigenes("http://localhost:4010", { produccion: true })).toThrow(/http-en-produccion/);
    expect(parsearOrigenes("http://localhost:4010", { produccion: false })).toEqual(["http://localhost:4010"]);
    expect(() => parsearOrigenes("https://erp-qa.casamueble.com.ar, http://erp.casamueble.com.ar", { produccion: true })).toThrow(OrigenesErpInvalidosError);
  });

  it("lista válida: separa por coma, recorta espacios y quita repetidos; vacía o sin definir = []", () => {
    expect(parsearOrigenes(" https://a.example , https://b.example:8443,https://a.example ", { produccion: true })).toEqual([
      "https://a.example",
      "https://b.example:8443",
    ]);
    expect(parsearOrigenes(undefined, { produccion: true })).toEqual([]);
    expect(parsearOrigenes(" , ", { produccion: true })).toEqual([]);
  });

  it("next.config.ts no carga con una lista inválida (Next no arranca)", async () => {
    await expect(reglasDeNextConfig({ ERP_FRONT_ORIGENES: "https://*.casamueble.com.ar" })).rejects.toThrow(/ERP_FRONT_ORIGENES inválida \(comodin\)/);
    await expect(reglasDeNextConfig({ ERP_FRONT_ORIGENES: "http://erp-qa.casamueble.com.ar", NODE_ENV: "production" })).rejects.toThrow(
      /http-en-produccion/,
    );
  });
});
