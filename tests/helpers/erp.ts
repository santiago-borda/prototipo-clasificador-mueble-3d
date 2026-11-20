// Entorno de prueba de la integración con el ERP: ERP simulado en proceso (sin red: los fetch salientes de la app
// llaman directo a su manejador y «Enviar a UCP» llama directo a postTrabajo), persistencia en memoria y un reloj
// controlado. Nunca se llama al ERP real.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createMemoryPersistence } from "@/persistence/memory";
import type { ConfigErp } from "@/server/erp/config";
import { crearValidadorToken } from "@/server/erp/token";
import { formatearRegistro } from "@/server/integracion/registro";
import type { DepsIntegracion } from "@/server/integracion/sesion";
import { postTrabajo } from "@/server/integracion/trabajos";
import { crearErpSimulado, PROYECTOS, USUARIOS, type ErpSimulado } from "../../erp-simulado/erp";

export const UCP = "http://localhost:3000";
export const ANFITRION = "http://localhost:4010";
/** URL propia del simulado en las pruebas (issuer, JWKS, blobs). */
export const BASE_ERP = "http://erp-simulado.test";

export const DAE_OLMO = new Uint8Array(readFileSync(path.resolve(__dirname, "..", "..", "public", "models", "Olmo", "olmo.dae")));

export const [ANA, BRUNO, CARLA] = USUARIOS;
export const [P_OLMO, P_SIN_ENVIAR, P_OTRA] = PROYECTOS;

export interface Entorno {
  sim: ErpSimulado;
  deps: DepsIntegracion;
  registros: string[];
  /** Avanza el reloj (del ERP simulado y de la app). */
  avanzar(ms: number): void;
  ahora(): number;
  /** Fetch al simulado (lo que usa la app para el JWKS, las descargas y el login). */
  fetchSim: typeof fetch;
}

export function configDePrueba(extra: Partial<ConfigErp> = {}): ConfigErp {
  return {
    modo: "simulado",
    origenWeb: ANFITRION,
    issuer: `${BASE_ERP}/`,
    jwksUrl: `${BASE_ERP}/.well-known/jwks`,
    apiUrl: BASE_ERP,
    blobOrigenes: [BASE_ERP],
    loginDirecto: false,
    timeoutMs: 1000,
    zipMaxBytes: 20 * 1024 * 1024,
    csvMaxBytes: 1024 * 1024,
    ...extra,
  };
}

export function crearEntorno(opciones: { config?: Partial<ConfigErp>; fetchApp?: (fetchSim: typeof fetch) => typeof fetch } = {}): Entorno {
  let reloj = Date.parse("2026-11-20T12:00:00.000Z");
  const ahora = () => reloj;
  const sim = crearErpSimulado({ daeOlmo: DAE_OLMO, origenUcp: UCP, base: BASE_ERP, ahora, enviarAUcp: (r) => postTrabajo(r, deps) });
  const fetchSim: typeof fetch = async (input, init) => sim.manejar(new Request(input instanceof Request ? input : String(input), init));
  const registros: string[] = [];
  const config = configDePrueba(opciones.config);
  const deps: DepsIntegracion = {
    persistence: createMemoryPersistence({ now: () => new Date(reloj) }),
    config,
    validarToken: crearValidadorToken({ issuer: config.issuer, jwksUrl: config.jwksUrl, timeoutMs: 1000, fetchImpl: fetchSim, ahora: () => new Date(reloj) }),
    fetchImpl: opciones.fetchApp ? opciones.fetchApp(fetchSim) : fetchSim,
    ahora: () => new Date(reloj),
    registrar: (evento, campos) => registros.push(formatearRegistro(evento, campos)),
    nuevoUuid: randomUUID,
  };
  return { sim, deps, registros, fetchSim, ahora, avanzar: (ms) => (reloj += ms) };
}

export function post(ruta: string, cuerpo: unknown, opciones: { cookie?: string; origin?: string | null; bearer?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (opciones.origin !== null) headers.set("origin", opciones.origin ?? UCP);
  if (opciones.cookie) headers.set("cookie", opciones.cookie);
  if (opciones.bearer) headers.set("authorization", `Bearer ${opciones.bearer}`);
  return new Request(`${UCP}${ruta}`, { method: "POST", headers, body: JSON.stringify(cuerpo) });
}

export function get(ruta: string, opciones: { cookie?: string; bearer?: string } = {}): Request {
  const headers = new Headers();
  if (opciones.cookie) headers.set("cookie", opciones.cookie);
  if (opciones.bearer) headers.set("authorization", `Bearer ${opciones.bearer}`);
  return new Request(`${UCP}${ruta}`, { headers });
}

/** `ucp_sesion=<valor>` de las Set-Cookie de una respuesta (para mandarla en el pedido siguiente). */
export function cookieDe(respuesta: Response): string | undefined {
  const sc = respuesta.headers.getSetCookie().find((c) => c.startsWith("ucp_sesion=") && !c.startsWith("ucp_sesion=;"));
  return sc?.split(";")[0];
}
