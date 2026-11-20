// Raíz de composición de la integración con el ERP: arma las dependencias desde el entorno. Solo servidor (ningún
// módulo "use client" importa src/server/, PB-13). La persistencia es la misma de la app (src/server/datos.ts): con
// DATABASE_URL, la base; sin ella, la memoria del proceso (sesiones, trabajos y archivos no sobreviven a un reinicio).

import { randomUUID } from "node:crypto";
import { getPersistence } from "@/server/datos";
import { leerConfigErp, type ConfigErp } from "@/server/erp/config";
import { crearValidadorToken, type ValidarToken } from "@/server/erp/token";
import { registrarEnConsola } from "./registro";
import type { DepsIntegracion } from "./sesion";

export class IntegracionApagadaError extends Error {
  constructor() {
    super("La integración con el ERP está apagada: ERP_WEB_ORIGEN no está definida.");
    this.name = "IntegracionApagadaError";
  }
}

// El validador guarda en memoria las claves del JWKS: uno por proceso (y por issuer), no uno por pedido.
const SLOT = Symbol.for("ucp.erp.validadores");
type Slot = { [SLOT]?: Map<string, ValidarToken> };

function validadorPara(config: ConfigErp): ValidarToken {
  const slot = globalThis as Slot;
  const mapa = (slot[SLOT] ??= new Map());
  const clave = `${config.issuer} ${config.jwksUrl} ${config.timeoutMs}`;
  let v = mapa.get(clave);
  if (!v) {
    v = crearValidadorToken({ issuer: config.issuer, jwksUrl: config.jwksUrl, timeoutMs: config.timeoutMs });
    mapa.set(clave, v);
  }
  return v;
}

/** Dependencias de la integración. Lanza `IntegracionApagadaError` si `ERP_WEB_ORIGEN` está vacía. */
export async function depsIntegracion(env: Record<string, string | undefined> = process.env): Promise<DepsIntegracion> {
  const config = leerConfigErp(env);
  if (!config) throw new IntegracionApagadaError();
  return {
    persistence: await getPersistence(),
    config,
    validarToken: validadorPara(config),
    fetchImpl: fetch,
    ahora: () => new Date(),
    registrar: registrarEnConsola,
    nuevoUuid: randomUUID,
  };
}

/** Para las rutas: con la integración apagada, 404 (como si la ruta no existiera). */
export async function conDeps(manejar: (deps: DepsIntegracion) => Promise<Response>): Promise<Response> {
  let deps: DepsIntegracion;
  try {
    deps = await depsIntegracion();
  } catch (error) {
    if (error instanceof IntegracionApagadaError) return new Response(null, { status: 404 });
    throw error;
  }
  return manejar(deps);
}
