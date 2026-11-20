// Entorno de prueba del embebido: ERP simulado en proceso (sin red: el cliente recibe un fetch que llama directo al
// manejador), persistencia en memoria y un reloj controlado. Nunca se llama al ERP real.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createMemoryPersistence } from "@/persistence/memory";
import { crearClienteErp, type ClienteErp } from "@/server/erp/cliente";
import { formatearRegistro } from "@/server/embebido/registro";
import type { DepsEmbebido } from "@/server/embebido/sesion";
import { crearErpSimulado, type ErpSimulado } from "../../erp-simulado/erp";

export const PFG = "http://localhost:3000";
export const ANFITRION = "http://localhost:4010";
export const BASE_ERP = "http://erp-simulado.test";

export const DAE_OLMO = new Uint8Array(readFileSync(path.resolve(__dirname, "..", "..", "public", "models", "Olmo", "olmo.dae")));

export interface Entorno {
  sim: ErpSimulado;
  deps: DepsEmbebido;
  registros: string[];
  /** Avanza el reloj (del ERP simulado y de la app). */
  avanzar(ms: number): void;
  fetchSim: typeof fetch;
}

export function crearEntorno(opciones: { erp?: (base: ClienteErp, fetchSim: typeof fetch) => ClienteErp } = {}): Entorno {
  let reloj = Date.parse("2026-11-20T12:00:00.000Z");
  const sim = crearErpSimulado({ daeOlmo: DAE_OLMO, origenPfg: PFG, ahora: () => reloj });
  const fetchSim: typeof fetch = async (input, init) => sim.manejar(new Request(input as string, init));
  const base = crearClienteErp({ baseUrl: BASE_ERP, timeoutMs: 1000, zipMaxBytes: 20 * 1024 * 1024, fetchImpl: fetchSim });
  const registros: string[] = [];
  const deps: DepsEmbebido = {
    persistence: createMemoryPersistence(),
    erp: opciones.erp ? opciones.erp(base, fetchSim) : base,
    clave: randomBytes(32),
    duracionSesionMs: 8 * 60 * 60 * 1000,
    origenes: [ANFITRION],
    ahora: () => new Date(reloj),
    registrar: (evento, campos) => registros.push(formatearRegistro(evento, campos)),
  };
  return { sim, deps, registros, fetchSim, avanzar: (ms) => (reloj += ms) };
}

export function post(ruta: string, cuerpo: unknown, opciones: { cookie?: string; origin?: string | null } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (opciones.origin !== null) headers.set("origin", opciones.origin ?? PFG);
  if (opciones.cookie) headers.set("cookie", opciones.cookie);
  return new Request(`${PFG}${ruta}`, { method: "POST", headers, body: JSON.stringify(cuerpo) });
}

export function get(ruta: string, cookie?: string): Request {
  return new Request(`${PFG}${ruta}`, { headers: cookie ? { cookie } : {} });
}

/** `pfg_sesion=<valor>` de las Set-Cookie de una respuesta (para mandarla en el pedido siguiente). */
export function cookieDe(respuesta: Response): string | undefined {
  const sc = respuesta.headers.getSetCookie().find((c) => c.startsWith("pfg_sesion=") && !c.startsWith("pfg_sesion=;"));
  return sc?.split(";")[0];
}
