// IE-12: configuración de la integración con el ERP desde el entorno (docs/spec-integracion-erp-minima.md v0.3). Solo
// servidor. Los valores nunca se imprimen: los errores nombran la variable.
//
//   ERP_WEB_ORIGEN      origen exacto del frontend del ERP (frame-ancestors y mensajes). Vacía = integración apagada.
//   ERP_ISSUER          issuer del Auth del ERP, con barra final. El JWKS es `{ERP_ISSUER}.well-known/jwks`.
//   ERP_API_URL         API del ERP. Hoy solo la usa el login de desarrollo (IE-11).
//   ERP_BLOB_ORIGENES   orígenes https de las URLs firmadas del modelo y del CSV, separados por coma. **Vacía = se
//                       rechaza toda descarga** (Casa Mueble todavía no informó el host; respuestas del 20/11).
//   ERP_LOGIN_DIRECTO   "habilitado" enciende /ingresar (solo desarrollo; con NODE_ENV=production, error al arrancar).
//   ERP_MODO            "real" (por defecto) o "simulado" (con NODE_ENV=production, error al arrancar). En simulado,
//                       ERP_ISSUER, ERP_API_URL y ERP_BLOB_ORIGENES se ignoran y todo sale de ERP_SIMULADO_URL
//                       (por defecto http://127.0.0.1:4010): el simulado nunca llama al ERP real.
//   ERP_TIMEOUT_MS      tiempo máximo de cada llamada saliente (JWKS, descargas, login). Por defecto 8000.
//   ERP_ZIP_MAX_BYTES   tope del zip del modelo (por defecto 20 MB) y de lo que descomprime.
//   ERP_CSV_MAX_BYTES   tope del CSV (por defecto 5 MB).

import { origenWebDelEntorno, parsearOrigen } from "@/lib/erp/origenes";
import { ConfiguracionErpInvalida, ErpSimuladoEnProduccionError, LoginDirectoEnProduccionError } from "./errores";
import { ZIP_MAX_BYTES_POR_DEFECTO } from "./zip";

export interface ConfigErp {
  modo: "real" | "simulado";
  origenWeb: string;
  issuer: string;
  jwksUrl: string;
  /** null si no está definida (solo hace falta para el login de desarrollo). */
  apiUrl: string | null;
  /** Vacía = toda descarga se rechaza. */
  blobOrigenes: string[];
  loginDirecto: boolean;
  timeoutMs: number;
  zipMaxBytes: number;
  csvMaxBytes: number;
}

export const ERP_SIMULADO_URL_POR_DEFECTO = "http://127.0.0.1:4010";
export const CSV_MAX_BYTES_POR_DEFECTO = 5 * 1024 * 1024;

type Env = Record<string, string | undefined>;

function enteroPositivo(env: Env, variable: string, porDefecto: number): number {
  const raw = env[variable];
  if (raw === undefined || raw === "") return porDefecto;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ConfiguracionErpInvalida(variable, "tiene que ser un entero positivo");
  return n;
}

function url(raw: string | undefined, variable: string, opciones: { produccion: boolean; barraFinal?: boolean }): string {
  if (!raw) throw new ConfiguracionErpInvalida(variable, "falta");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ConfiguracionErpInvalida(variable, "no es una URL");
  }
  if (raw.includes("*")) throw new ConfiguracionErpInvalida(variable, "sin comodines");
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ConfiguracionErpInvalida(variable, "tiene que ser http o https");
  if (opciones.produccion && u.protocol !== "https:") throw new ConfiguracionErpInvalida(variable, "en producción tiene que ser https");
  if (u.username || u.password || u.search || u.hash) throw new ConfiguracionErpInvalida(variable, "sin usuario, consulta ni fragmento");
  if (opciones.barraFinal && !raw.endsWith("/")) throw new ConfiguracionErpInvalida(variable, "tiene que terminar con /");
  return opciones.barraFinal ? raw : raw.replace(/\/+$/, "");
}

/** IE-12: el modo, que también se valida con la integración apagada. */
export function leerModoErp(env: Env = process.env): ConfigErp["modo"] {
  const modo = env.ERP_MODO || "real";
  if (modo !== "real" && modo !== "simulado") throw new ConfiguracionErpInvalida("ERP_MODO", 'tiene que ser "real" o "simulado"');
  if (modo === "simulado" && env.NODE_ENV === "production") throw new ErpSimuladoEnProduccionError();
  return modo;
}

/** IE-11: el login directo, que también se valida con la integración apagada. */
export function leerLoginDirecto(env: Env = process.env): boolean {
  const raw = env.ERP_LOGIN_DIRECTO ?? "";
  if (raw === "") return false;
  if (raw !== "habilitado") throw new ConfiguracionErpInvalida("ERP_LOGIN_DIRECTO", 'vacía o "habilitado"');
  if (env.NODE_ENV === "production") throw new LoginDirectoEnProduccionError();
  return true;
}

function blobOrigenes(raw: string | undefined): string[] {
  const lista: string[] = [];
  for (const v of (raw ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "")) {
    const origen = parsearOrigen(v, { variable: "ERP_BLOB_ORIGENES", produccion: true, soloHttps: true });
    if (!lista.includes(origen)) lista.push(origen);
  }
  return lista;
}

/** La configuración completa, o null si la integración está apagada (`ERP_WEB_ORIGEN` vacía). */
export function leerConfigErp(env: Env = process.env): ConfigErp | null {
  const modo = leerModoErp(env);
  const loginDirecto = leerLoginDirecto(env);
  const origenWeb = origenWebDelEntorno(env);
  if (origenWeb === null) return null;
  const produccion = env.NODE_ENV === "production";
  const limites = {
    timeoutMs: enteroPositivo(env, "ERP_TIMEOUT_MS", 8000),
    zipMaxBytes: enteroPositivo(env, "ERP_ZIP_MAX_BYTES", ZIP_MAX_BYTES_POR_DEFECTO),
    csvMaxBytes: enteroPositivo(env, "ERP_CSV_MAX_BYTES", CSV_MAX_BYTES_POR_DEFECTO),
  };

  if (modo === "simulado") {
    const base = url(env.ERP_SIMULADO_URL || ERP_SIMULADO_URL_POR_DEFECTO, "ERP_SIMULADO_URL", { produccion: false });
    return {
      modo,
      origenWeb,
      issuer: `${base}/`,
      jwksUrl: `${base}/.well-known/jwks`,
      apiUrl: base,
      blobOrigenes: [new URL(base).origin],
      loginDirecto,
      ...limites,
    };
  }

  const issuer = url(env.ERP_ISSUER, "ERP_ISSUER", { produccion, barraFinal: true });
  const apiUrl = env.ERP_API_URL || loginDirecto ? url(env.ERP_API_URL, "ERP_API_URL", { produccion }) : null;
  return {
    modo,
    origenWeb,
    issuer,
    jwksUrl: new URL(".well-known/jwks", issuer).toString(),
    apiUrl,
    blobOrigenes: blobOrigenes(env.ERP_BLOB_ORIGENES),
    loginDirecto,
    ...limites,
  };
}

/**
 * IE-12 / TIE-20: lo que se valida al arrancar el servidor (src/instrumentation.ts). Siempre el modo y el login
 * directo (los dos prohibidos en producción); con la integración encendida, todo lo demás.
 */
export function validarConfiguracionAlArrancar(env: Env = process.env): { integracion: boolean } {
  return { integracion: leerConfigErp(env) !== null };
}
