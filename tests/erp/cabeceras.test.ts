// @vitest-environment node
// TIE-11 (framing, IE-6), IE-12 (variables de entorno) y TIE-20 (prohibido en producción), de
// docs/spec-integracion-erp-minima.md v0.3 §6.

import { afterEach, describe, expect, it, vi } from "vitest";
import { frameAncestors, OrigenErpInvalidoError, origenWebDelEntorno, parsearOrigen, reglasDeFraming, type ReglaDeCabeceras } from "@/lib/erp/origenes";
import { leerConfigErp, validarConfiguracionAlArrancar } from "@/server/erp/config";
import { ConfiguracionErpInvalida, ErpSimuladoEnProduccionError, LoginDirectoEnProduccionError } from "@/server/erp/errores";

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

const QA = {
  ERP_WEB_ORIGEN: "https://erp-qa.casamueble.com.ar",
  ERP_ISSUER: "https://erp-auth-api-qa.casamueble.com.ar/",
  ERP_API_URL: "https://erp-api-qa.casamueble.com.ar",
};

describe("TIE-11: cabeceras de framing", () => {
  const ERP = "https://erp-qa.casamueble.com.ar";

  it("/erp y /erp/* llevan frame-ancestors del ERP; /p/<qrId>, /api/trabajos, /ingresar y el resto, 'none'", () => {
    const reglas = reglasDeFraming(ERP);
    for (const ruta of ["/erp", "/erp/proyectos/5e1a0000-0000-4000-8000-000000000142", "/erp/proyectos/x/visor/erp-abc-c04"]) {
      expect(efectiva(reglas, ruta, "Content-Security-Policy"), ruta).toBe(`frame-ancestors ${ERP}`);
    }
    for (const ruta of ["/", "/p/olmo-c04", "/p/olmo-mueble", "/prueba/abc", "/importar", "/qr", "/escanear", "/ingresar", "/api/trabajos", "/api/erp/sesion", "/erpx", "/erp-x", "/embebido"]) {
      expect(efectiva(reglas, ruta, "Content-Security-Policy"), ruta).toBe("frame-ancestors 'none'");
    }
  });

  it("con la integración apagada, nada se puede embeber", () => {
    expect(frameAncestors(null)).toBe("frame-ancestors 'none'");
    expect(efectiva(reglasDeFraming(null), "/erp/proyectos/x", "Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("next.config.ts aplica esas reglas y conserva X-Robots-Tag", async () => {
    const reglas = await reglasDeNextConfig({ ERP_WEB_ORIGEN: ERP, NODE_ENV: "production" });
    expect(efectiva(reglas, "/erp/proyectos/x", "Content-Security-Policy")).toBe(`frame-ancestors ${ERP}`);
    expect(efectiva(reglas, "/p/olmo-c04", "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(efectiva(reglas, "/p/olmo-c04", "X-Robots-Tag")).toBe("noindex, nofollow");
    expect(efectiva(reglas, "/erp", "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("next.config.ts no carga con un origen inválido (Next no arranca)", async () => {
    await expect(reglasDeNextConfig({ ERP_WEB_ORIGEN: "https://*.casamueble.com.ar" })).rejects.toThrow(/ERP_WEB_ORIGEN inválida \(comodin\)/);
    await expect(reglasDeNextConfig({ ERP_WEB_ORIGEN: "http://erp-qa.casamueble.com.ar", NODE_ENV: "production" })).rejects.toThrow(/http-en-produccion/);
  });
});

describe("IE-12: ERP_WEB_ORIGEN es un solo origen exacto", () => {
  it.each([
    ["comodín de subdominio", "https://*.casamueble.com.ar", "comodin"],
    ["comodín solo", "*", "comodin"],
    ["dos orígenes (la v0.2 aceptaba una lista)", "https://a.example,https://b.example", "mas-de-uno"],
    ["con ruta", "https://erp-qa.casamueble.com.ar/app", "no-es-origen"],
    ["con barra final", "https://erp-qa.casamueble.com.ar/", "no-es-origen"],
    ["sin esquema", "erp-qa.casamueble.com.ar", "no-es-origen"],
    ["otro esquema", "ftp://erp-qa.casamueble.com.ar", "esquema"],
    ["con mayúsculas (no es el origen tal cual)", "https://ERP-qa.casamueble.com.ar", "no-es-origen"],
  ])("%s: error", (_caso, valor, motivo) => {
    expect(() => parsearOrigen(valor, { variable: "ERP_WEB_ORIGEN", produccion: false })).toThrow(OrigenErpInvalidoError);
    try {
      parsearOrigen(valor, { variable: "ERP_WEB_ORIGEN", produccion: false });
    } catch (e) {
      expect((e as OrigenErpInvalidoError).motivo).toBe(motivo);
      expect((e as Error).message).not.toContain(valor.length > 3 ? valor : "\u0000");
    }
  });

  it("http solo fuera de producción; vacía = integración apagada", () => {
    expect(origenWebDelEntorno({ ERP_WEB_ORIGEN: "http://localhost:4010" })).toBe("http://localhost:4010");
    expect(() => origenWebDelEntorno({ ERP_WEB_ORIGEN: "http://localhost:4010", NODE_ENV: "production" })).toThrow(/http-en-produccion/);
    expect(origenWebDelEntorno({ ERP_WEB_ORIGEN: " " })).toBeNull();
    expect(origenWebDelEntorno({})).toBeNull();
  });
});

describe("IE-12: configuración de la integración", () => {
  it("con los valores de QA: issuer con barra final, JWKS {issuer}.well-known/jwks y sin orígenes de blob", () => {
    expect(leerConfigErp(QA)).toEqual({
      modo: "real",
      origenWeb: QA.ERP_WEB_ORIGEN,
      issuer: QA.ERP_ISSUER,
      jwksUrl: "https://erp-auth-api-qa.casamueble.com.ar/.well-known/jwks",
      apiUrl: QA.ERP_API_URL,
      blobOrigenes: [],
      loginDirecto: false,
      timeoutMs: 8000,
      zipMaxBytes: 20 * 1024 * 1024,
      csvMaxBytes: 5 * 1024 * 1024,
    });
  });

  it("ERP_ISSUER: obligatoria, con barra final, https en producción, sin comodines ni consulta", () => {
    const con = (issuer: string | undefined, extra: Record<string, string> = {}) => () => leerConfigErp({ ...QA, ERP_ISSUER: issuer, ...extra });
    expect(con(undefined)).toThrow(/ERP_ISSUER: falta/);
    expect(con("https://erp-auth-api-qa.casamueble.com.ar")).toThrow(/ERP_ISSUER: tiene que terminar con \//);
    expect(con("http://erp-auth-api-qa.casamueble.com.ar/", { NODE_ENV: "production" })).toThrow(/ERP_ISSUER: en producción tiene que ser https/);
    expect(con("https://*.casamueble.com.ar/")).toThrow(ConfiguracionErpInvalida);
    expect(con("https://erp-auth-api-qa.casamueble.com.ar/?x=1")).toThrow(/sin usuario, consulta ni fragmento/);
  });

  it("ERP_BLOB_ORIGENES: orígenes https exactos, separados por coma; un http o un comodín es error", () => {
    expect(leerConfigErp({ ...QA, ERP_BLOB_ORIGENES: " https://blob.example , https://b2.example:8443,https://blob.example" })?.blobOrigenes).toEqual([
      "https://blob.example",
      "https://b2.example:8443",
    ]);
    expect(() => leerConfigErp({ ...QA, ERP_BLOB_ORIGENES: "http://blob.example" })).toThrow(/ERP_BLOB_ORIGENES inválida \(http-en-produccion\)/);
    expect(() => leerConfigErp({ ...QA, ERP_BLOB_ORIGENES: "https://*.blob.core.windows.net" })).toThrow(/comodin/);
    expect(() => leerConfigErp({ ...QA, ERP_BLOB_ORIGENES: "https://blob.example/contenedor" })).toThrow(/no-es-origen/);
  });

  it("modo simulado: todo sale de ERP_SIMULADO_URL y se ignoran ERP_ISSUER, ERP_API_URL y ERP_BLOB_ORIGENES (nunca el ERP real)", () => {
    const c = leerConfigErp({ ...QA, ERP_MODO: "simulado", ERP_BLOB_ORIGENES: "https://blob.example" });
    expect(c).toMatchObject({
      modo: "simulado",
      issuer: "http://127.0.0.1:4010/",
      jwksUrl: "http://127.0.0.1:4010/.well-known/jwks",
      apiUrl: "http://127.0.0.1:4010",
      blobOrigenes: ["http://127.0.0.1:4010"],
    });
    expect(JSON.stringify(c)).not.toContain("casamueble.com.ar/.well-known");
    expect(JSON.stringify(c)).not.toContain("erp-api-qa");
  });

  it("ERP_LOGIN_DIRECTO=habilitado exige ERP_API_URL; otro valor es error", () => {
    expect(leerConfigErp({ ...QA, ERP_LOGIN_DIRECTO: "habilitado" })?.loginDirecto).toBe(true);
    expect(() => leerConfigErp({ ...QA, ERP_API_URL: "", ERP_LOGIN_DIRECTO: "habilitado" })).toThrow(/ERP_API_URL: falta/);
    expect(() => leerConfigErp({ ...QA, ERP_LOGIN_DIRECTO: "si" })).toThrow(/ERP_LOGIN_DIRECTO/);
    expect(leerConfigErp({ ...QA, ERP_API_URL: "" })?.apiUrl).toBeNull();
  });

  it("límites: enteros positivos", () => {
    expect(leerConfigErp({ ...QA, ERP_TIMEOUT_MS: "1500", ERP_ZIP_MAX_BYTES: "1000", ERP_CSV_MAX_BYTES: "10" })).toMatchObject({ timeoutMs: 1500, zipMaxBytes: 1000, csvMaxBytes: 10 });
    expect(() => leerConfigErp({ ...QA, ERP_TIMEOUT_MS: "0" })).toThrow(/ERP_TIMEOUT_MS/);
    expect(() => leerConfigErp({ ...QA, ERP_ZIP_MAX_BYTES: "1.5" })).toThrow(/ERP_ZIP_MAX_BYTES/);
  });

  it("sin ERP_WEB_ORIGEN: apagada (null), aunque falte todo lo demás", () => {
    expect(leerConfigErp({})).toBeNull();
    expect(validarConfiguracionAlArrancar({})).toEqual({ integracion: false });
    expect(validarConfiguracionAlArrancar(QA)).toEqual({ integracion: true });
  });

  it("los mensajes de error nombran la variable, nunca su valor", () => {
    const valor = "https://erp-auth-api-qa.casamueble.com.ar/?clave=secreta";
    try {
      leerConfigErp({ ...QA, ERP_ISSUER: valor });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain("ERP_ISSUER");
      expect((e as Error).message).not.toContain("secreta");
    }
  });
});

describe("TIE-20: ERP_LOGIN_DIRECTO o ERP_MODO=simulado con NODE_ENV=production: error al arrancar", () => {
  it("aun con la integración apagada", () => {
    expect(() => validarConfiguracionAlArrancar({ NODE_ENV: "production", ERP_MODO: "simulado" })).toThrow(ErpSimuladoEnProduccionError);
    expect(() => validarConfiguracionAlArrancar({ NODE_ENV: "production", ERP_LOGIN_DIRECTO: "habilitado" })).toThrow(LoginDirectoEnProduccionError);
    expect(() => validarConfiguracionAlArrancar({ ...QA, NODE_ENV: "production", ERP_MODO: "simulado" })).toThrow(ErpSimuladoEnProduccionError);
    expect(() => validarConfiguracionAlArrancar({ ...QA, NODE_ENV: "production", ERP_LOGIN_DIRECTO: "habilitado" })).toThrow(LoginDirectoEnProduccionError);
    expect(validarConfiguracionAlArrancar({ ...QA, NODE_ENV: "production" })).toEqual({ integracion: true });
  });

  it("src/instrumentation.ts llama a esa validación al arrancar el servidor de Node", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ERP_MODO", "simulado");
    vi.resetModules();
    const { register } = await import("@/instrumentation");
    await expect(register()).rejects.toThrow(/ERP_MODO=simulado no se permite/);
    vi.stubEnv("ERP_MODO", "");
    vi.stubEnv("ERP_LOGIN_DIRECTO", "habilitado");
    await expect(register()).rejects.toThrow(/ERP_LOGIN_DIRECTO no se permite/);
  });
});
