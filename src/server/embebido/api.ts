// IE-3, IE-5, IE-8: lógica de las rutas /api/embebido/*. Funciones de Request a Response con las dependencias
// inyectadas (las rutas de src/app/api/embebido/ solo las arman). Ninguna respuesta lleva el token del ERP.

import { ID_ERP } from "@/server/erp/esquemas";
import { TOKEN_MAX_LARGO } from "@/lib/embebido/protocolo";
import { cookieDeSesion, cookiesBorradas, cookiesDeSesion, cuerpoJson, mismoOrigen, respuestaJson } from "./http";
import { cargarModelo, type ModeloCargado } from "./proyecto";
import { crearSesion, renovarSesion, revocarSesion, type DepsEmbebido } from "./sesion";

const tokenValido = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t.length <= TOKEN_MAX_LARGO && !/\s/.test(t);

/** IE-3: POST /api/embebido/sesion {token, proyecto}. */
export async function postSesion(request: Request, deps: DepsEmbebido): Promise<Response> {
  if (!mismoOrigen(request)) {
    deps.registrar("intercambio-rechazado", { motivo: "origen" });
    return respuestaJson({ error: "origen" }, 403);
  }
  const cuerpo = await cuerpoJson(request);
  const proyecto = cuerpo?.proyecto;
  if (!cuerpo || !tokenValido(cuerpo.token) || typeof proyecto !== "string" || !ID_ERP.test(proyecto)) {
    return respuestaJson({ error: "pedido-invalido" }, 400);
  }
  try {
    const { tokenDeSesion } = await crearSesion(deps, cuerpo.token);
    return respuestaJson({ destino: `/embebido/proyectos/${encodeURIComponent(proyecto)}` }, 200, cookiesDeSesion(tokenDeSesion, deps.duracionSesionMs));
  } catch (error) {
    // 401 genérico: no se dice si el ERP rechazó el token, no respondió o devolvió otra cosa.
    deps.registrar("intercambio-rechazado", { motivo: "whoami", error: error instanceof Error ? error.name : "desconocido" });
    return respuestaJson({ error: "no-autenticada" }, 401);
  }
}

/** IE-5: POST /api/embebido/sesion/renovar {token}. Exige sesión vigente y el mismo usuario del ERP. */
export async function postRenovar(request: Request, deps: DepsEmbebido): Promise<Response> {
  if (!mismoOrigen(request)) return respuestaJson({ error: "origen" }, 403);
  const cuerpo = await cuerpoJson(request);
  if (!cuerpo || !tokenValido(cuerpo.token)) return respuestaJson({ error: "pedido-invalido" }, 400);
  const resultado = await renovarSesion(deps, cookieDeSesion(request.headers.get("cookie")), cuerpo.token);
  if (resultado === "renovada") return respuestaJson({ ok: true });
  return respuestaJson({ error: "no-autenticada" }, 401, resultado === "no-autenticada" ? [] : cookiesBorradas());
}

/** POST /api/embebido/sesion/revocar: erp:salir, renovación fallida o vencida la espera de 10 s. */
export async function postRevocar(request: Request, deps: DepsEmbebido): Promise<Response> {
  if (!mismoOrigen(request)) return respuestaJson({ error: "origen" }, 403);
  const cuerpo = await cuerpoJson(request);
  const motivo = typeof cuerpo?.motivo === "string" && /^[a-z-]{1,40}$/.test(cuerpo.motivo) ? cuerpo.motivo : "pedido";
  await revocarSesion(deps, cookieDeSesion(request.headers.get("cookie")), motivo);
  return respuestaJson({ ok: true }, 200, cookiesBorradas());
}

const ESTADO_HTTP: Record<Exclude<ModeloCargado["estado"], "ok">, number> = {
  "no-autenticada": 401,
  "token-vencido": 401,
  "no-encontrado": 404,
  "erp-no-disponible": 502,
  "respuesta-invalida": 502,
  "zip-invalido": 422,
};

/** IE-8: GET /api/embebido/proyectos/<erpId>/documentos/<docId>/modelo → el .dae, sin guardarlo. */
export async function getModelo(request: Request, deps: DepsEmbebido, erpProyectoId: string, documentoId: string): Promise<Response> {
  const r = await cargarModelo(deps, cookieDeSesion(request.headers.get("cookie")), erpProyectoId, documentoId);
  if (r.estado === "ok") {
    return new Response(r.dae.slice().buffer as ArrayBuffer, {
      headers: { "content-type": "model/vnd.collada+xml", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  const error = r.estado === "token-vencido" ? "token-erp-vencido" : r.estado;
  return respuestaJson(r.estado === "zip-invalido" ? { error, motivo: r.motivo } : { error }, ESTADO_HTTP[r.estado]);
}
