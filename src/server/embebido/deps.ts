// Raíz de composición del embebido: arma las dependencias desde el entorno. Solo servidor (ningún módulo
// "use client" importa src/server/, PB-13). La persistencia es la misma de la app (src/server/datos.ts): con
// DATABASE_URL, la base; sin ella, la memoria del proceso (las sesiones no sobreviven a un reinicio).

import { getPersistence } from "@/server/datos";
import { crearClienteErp } from "@/server/erp/cliente";
import { leerConfigErp } from "@/server/erp/config";
import { leerConfigEmbebido } from "./config";
import { registrarEnConsola } from "./registro";
import type { DepsEmbebido } from "./sesion";

export class EmbebidoApagadoError extends Error {
  constructor() {
    super("El embebido está apagado: ERP_FRONT_ORIGENES no está definida.");
    this.name = "EmbebidoApagadoError";
  }
}

/** Dependencias del embebido. Lanza `EmbebidoApagadoError` si no hay orígenes configurados. */
export async function depsEmbebido(env: Record<string, string | undefined> = process.env): Promise<DepsEmbebido> {
  const config = leerConfigEmbebido(env);
  if (config.origenes.length === 0) throw new EmbebidoApagadoError();
  const erp = leerConfigErp(env);
  return {
    persistence: await getPersistence(),
    erp: crearClienteErp(erp),
    clave: config.clave,
    duracionSesionMs: config.duracionSesionMs,
    origenes: config.origenes,
    ahora: () => new Date(),
    registrar: registrarEnConsola,
  };
}

/** Para las rutas: con el embebido apagado, 404 (como si la ruta no existiera). */
export async function conDeps(manejar: (deps: DepsEmbebido) => Promise<Response>): Promise<Response> {
  let deps: DepsEmbebido;
  try {
    deps = await depsEmbebido();
  } catch (error) {
    if (error instanceof EmbebidoApagadoError) return new Response(null, { status: 404 });
    throw error;
  }
  return manejar(deps);
}

/** Para las páginas: null con el embebido apagado (la página responde 404). */
export async function conDepsDePagina(): Promise<DepsEmbebido | null> {
  try {
    return await depsEmbebido();
  } catch (error) {
    if (error instanceof EmbebidoApagadoError) return null;
    throw error;
  }
}
