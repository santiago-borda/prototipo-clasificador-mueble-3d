// IE-1 e IE-12: configuración del cliente del ERP desde el entorno. Los valores nunca se imprimen.
//   ERP_MODO            "real" (por defecto) o "simulado". Simulado con NODE_ENV=production: error al arrancar.
//   ERP_API_URL         URL base de la API (modo real). Con NODE_ENV=production, https.
//   ERP_SIMULADO_URL    URL del ERP simulado (modo simulado; por defecto http://127.0.0.1:4010). En modo simulado
//                       ERP_API_URL se ignora: el simulado nunca llama al ERP real.
//   ERP_TIMEOUT_MS      tiempo máximo por llamada (por defecto 8000).
//   ERP_ZIP_MAX_BYTES   tope del zip de un Documento (por defecto 20 MB).

import { ConfiguracionErpInvalida, ErpSimuladoEnProduccionError } from "./errores";
import { ZIP_MAX_BYTES_POR_DEFECTO } from "./zip";

export interface ConfigErp {
  modo: "real" | "simulado";
  baseUrl: string;
  timeoutMs: number;
  zipMaxBytes: number;
}

export const ERP_SIMULADO_URL_POR_DEFECTO = "http://127.0.0.1:4010";

type Env = Record<string, string | undefined>;

function enteroPositivo(env: Env, variable: string, porDefecto: number): number {
  const raw = env[variable];
  if (raw === undefined || raw === "") return porDefecto;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ConfiguracionErpInvalida(variable, "tiene que ser un entero positivo");
  return n;
}

function urlBase(env: Env, variable: string, produccion: boolean): string {
  const raw = env[variable];
  if (!raw) throw new ConfiguracionErpInvalida(variable, "falta");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfiguracionErpInvalida(variable, "no es una URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ConfiguracionErpInvalida(variable, "tiene que ser http o https");
  if (produccion && url.protocol !== "https:") throw new ConfiguracionErpInvalida(variable, "en producción tiene que ser https");
  if (url.username || url.password || url.search || url.hash) throw new ConfiguracionErpInvalida(variable, "sin usuario, consulta ni fragmento");
  return raw.replace(/\/+$/, "");
}

/** IE-12: solo el chequeo del modo (lo llama también instrumentation.ts, siempre). */
export function leerModoErp(env: Env = process.env): ConfigErp["modo"] {
  const modo = env.ERP_MODO ?? "real";
  if (modo !== "real" && modo !== "simulado") throw new ConfiguracionErpInvalida("ERP_MODO", 'tiene que ser "real" o "simulado"');
  if (modo === "simulado" && env.NODE_ENV === "production") throw new ErpSimuladoEnProduccionError();
  return modo;
}

export function leerConfigErp(env: Env = process.env): ConfigErp {
  const modo = leerModoErp(env);
  const produccion = env.NODE_ENV === "production";
  const baseUrl =
    modo === "simulado"
      ? urlBase({ ERP_SIMULADO_URL: env.ERP_SIMULADO_URL || ERP_SIMULADO_URL_POR_DEFECTO }, "ERP_SIMULADO_URL", false)
      : urlBase(env, "ERP_API_URL", produccion);
  return {
    modo,
    baseUrl,
    timeoutMs: enteroPositivo(env, "ERP_TIMEOUT_MS", 8000),
    zipMaxBytes: enteroPositivo(env, "ERP_ZIP_MAX_BYTES", ZIP_MAX_BYTES_POR_DEFECTO),
  };
}
