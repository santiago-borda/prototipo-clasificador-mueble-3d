// IE-2, IE-5, IE-11: lógica de las rutas /api/erp/* que usa la pantalla embebida (cookie de sesión). Funciones de
// Request a Response con las dependencias inyectadas (las rutas de src/app/api/erp/ solo las arman). Ninguna
// respuesta lleva el token del ERP; ningún registro lleva el token, la contraseña ni la cookie.

import { listadoId } from "@/engine/hash";
import { leerCsvDelEnvio } from "@/lib/csv-ocl/envio";
import { esTokenBienFormado, normalizarUuid, UUID } from "@/lib/erp/protocolo";
import type { ErpSession, Job } from "@/persistence/ports";
import { JwksNoDisponible, LoginErpRechazado, TokenErpInvalido, TokenErpVencido } from "@/server/erp/errores";
import { loginDirecto } from "@/server/erp/login";
import { extraerDae, ZipInvalidoError } from "@/server/erp/zip";
import { cookieDeSesion, cookiesBorradas, cookiesDeSesion, cuerpoJson, mismoOrigen, respuestaJson } from "./http";
import { crearSesion, leerSesion, renovarSesion, revocarSesion, TenantDistintoError, vigenteHasta, type DepsIntegracion, type SesionCreada } from "./sesion";

const cookieDe = (request: Request) => cookieDeSesion(request.headers.get("cookie"));

function respuestaSesion(deps: DepsIntegracion, creada: SesionCreada, status = 200): Response {
  const vigenciaMs = vigenteHasta(creada.session) - deps.ahora().getTime();
  return respuestaJson({ ok: true, vence: Math.floor(creada.session.expiresAt.getTime() / 1000) }, status, cookiesDeSesion(creada.tokenDeSesion, vigenciaMs));
}

/** Errores de IE-1 al crear una sesión → respuesta (401 genérico salvo el JWKS caído, 503). */
function rechazoDeToken(deps: DepsIntegracion, error: unknown, evento: string): Response {
  if (error instanceof JwksNoDisponible) {
    deps.registrar(evento, { motivo: "jwks-no-disponible" });
    return respuestaJson({ error: "jwks-no-disponible" }, 503);
  }
  if (error instanceof TenantDistintoError) {
    deps.registrar(evento, { motivo: "tenant-distinto" });
    return respuestaJson({ error: "tenant-distinto" }, 401);
  }
  if (error instanceof TokenErpInvalido || error instanceof TokenErpVencido) {
    deps.registrar(evento, { motivo: "token", error: error.name });
    return respuestaJson({ error: "no-autenticada" }, 401);
  }
  throw error;
}

/** IE-2: POST /api/erp/sesion {accessToken, tenantId}, con el contenido de `erp:sesion`. Solo Origin propio. */
export async function postSesion(request: Request, deps: DepsIntegracion): Promise<Response> {
  if (!mismoOrigen(request)) {
    deps.registrar("sesion-rechazada", { motivo: "origen" });
    return respuestaJson({ error: "origen" }, 403);
  }
  const cuerpo = await cuerpoJson(request);
  if (!cuerpo || !esTokenBienFormado(cuerpo.accessToken) || typeof cuerpo.tenantId !== "string" || !UUID.test(cuerpo.tenantId)) {
    return respuestaJson({ error: "pedido-invalido" }, 400);
  }
  let creada: SesionCreada;
  try {
    creada = await crearSesion(deps, cuerpo.accessToken, { tenantIdDeclarado: cuerpo.tenantId });
  } catch (error) {
    return rechazoDeToken(deps, error, "sesion-rechazada");
  }
  // Una recarga dentro del iframe crea otra sesión: la anterior de esta cookie se revoca.
  await revocarSesion(deps, cookieDe(request), "reemplazada");
  return respuestaSesion(deps, creada);
}

/** Para la pantalla abierta fuera del iframe (login de desarrollo): ¿hay sesión? GET /api/erp/sesion. */
export async function getSesion(request: Request, deps: DepsIntegracion): Promise<Response> {
  const session = await leerSesion(deps, cookieDe(request));
  if (!session) return respuestaJson({ vigente: false }, 401);
  return respuestaJson({ vigente: true, vence: Math.floor(session.expiresAt.getTime() / 1000) });
}

/** IE-2 / TIE-8: POST /api/erp/sesion/renovar {accessToken}, con el contenido de `erp:token`. */
export async function postRenovar(request: Request, deps: DepsIntegracion): Promise<Response> {
  if (!mismoOrigen(request)) return respuestaJson({ error: "origen" }, 403);
  const cuerpo = await cuerpoJson(request);
  if (!cuerpo || !esTokenBienFormado(cuerpo.accessToken)) return respuestaJson({ error: "pedido-invalido" }, 400);
  const tokenDeSesion = cookieDe(request);
  const r = await renovarSesion(deps, tokenDeSesion, cuerpo.accessToken);
  if (r.resultado === "renovada") {
    return respuestaSesion(deps, { tokenDeSesion: tokenDeSesion as string, session: r.session });
  }
  if (r.resultado === "jwks-no-disponible") return respuestaJson({ error: "jwks-no-disponible" }, 503);
  return respuestaJson({ error: "no-autenticada" }, 401, r.resultado === "no-autenticada" ? [] : cookiesBorradas());
}

/** POST /api/erp/sesion/revocar: sesión vencida en el iframe (IE-4), `erp:sesion` rechazado o «salir». */
export async function postRevocar(request: Request, deps: DepsIntegracion): Promise<Response> {
  if (!mismoOrigen(request)) return respuestaJson({ error: "origen" }, 403);
  const cuerpo = await cuerpoJson(request);
  const motivo = typeof cuerpo?.motivo === "string" && /^[a-z-]{1,40}$/.test(cuerpo.motivo) ? cuerpo.motivo : "pedido";
  await revocarSesion(deps, cookieDe(request), motivo);
  return respuestaJson({ ok: true }, 200, cookiesBorradas());
}

/** IE-11: POST /api/erp/ingresar {usuario, password}. Solo con ERP_LOGIN_DIRECTO=habilitado (si no, 404). */
export async function postIngresar(request: Request, deps: DepsIntegracion): Promise<Response> {
  if (!deps.config.loginDirecto || deps.config.apiUrl === null) return new Response(null, { status: 404 });
  if (!mismoOrigen(request)) return respuestaJson({ error: "origen" }, 403);
  const cuerpo = await cuerpoJson(request);
  const usuario = cuerpo?.usuario;
  const password = cuerpo?.password;
  if (typeof usuario !== "string" || usuario.trim() === "" || usuario.length > 200 || typeof password !== "string" || password === "" || password.length > 500) {
    return respuestaJson({ error: "pedido-invalido" }, 400);
  }
  let accessToken: string;
  try {
    accessToken = await loginDirecto({ apiUrl: deps.config.apiUrl, timeoutMs: deps.config.timeoutMs, fetchImpl: deps.fetchImpl }, { usuario: usuario.trim(), password });
  } catch (error) {
    if (!(error instanceof LoginErpRechazado)) throw error;
    deps.registrar("ingreso-rechazado", { motivo: error.detalle });
    return respuestaJson({ error: "credenciales" }, 401);
  }
  let creada: SesionCreada;
  try {
    creada = await crearSesion(deps, accessToken);
  } catch (error) {
    return rechazoDeToken(deps, error, "ingreso-rechazado");
  }
  await revocarSesion(deps, cookieDe(request), "reemplazada");
  deps.registrar("ingreso-directo");
  return respuestaSesion(deps, creada);
}

type ConSesion = { ok: true; session: ErpSession } | { ok: false; respuesta: Response };

async function exigirSesion(request: Request, deps: DepsIntegracion): Promise<ConSesion> {
  const session = await leerSesion(deps, cookieDe(request));
  return session ? { ok: true, session } : { ok: false, respuesta: respuestaJson({ error: "no-autenticada" }, 401) };
}

/** IE-5: GET /api/erp/proyectos: los proyectos de la carpintería de la sesión, con el estado del último trabajo. */
export async function getProyectos(request: Request, deps: DepsIntegracion): Promise<Response> {
  const s = await exigirSesion(request, deps);
  if (!s.ok) return s.respuesta;
  const { tenantId } = s.session;
  const proyectos = await deps.persistence.projects.listErpProjects(tenantId);
  const filas = await Promise.all(
    proyectos.map(async (p) => {
      const ultimo = await deps.persistence.jobs.latestForProject(tenantId, p.id);
      return { uuid: p.erpProjectId, codigo: p.code, nombre: p.name, estado: ultimo?.status ?? null };
    }),
  );
  return respuestaJson({ proyectos: filas });
}

/**
 * IE-5: GET /api/erp/proyectos/{uuid}: código, nombre, el último trabajo (estado y mensaje) y si hay un modelo
 * guardado (el último trabajo `success`). Un proyecto de otra carpintería, o que no se envió, da 404 (TIE-18).
 */
export async function getProyecto(request: Request, deps: DepsIntegracion, proyectoUuid: string): Promise<Response> {
  const s = await exigirSesion(request, deps);
  if (!s.ok) return s.respuesta;
  if (!UUID.test(proyectoUuid)) return respuestaJson({ error: "no-encontrado" }, 404);
  const { tenantId } = s.session;
  const proyecto = await deps.persistence.projects.getErpProject(tenantId, normalizarUuid(proyectoUuid));
  if (!proyecto) return respuestaJson({ error: "no-encontrado" }, 404);
  const ultimo = await deps.persistence.jobs.latestForProject(tenantId, proyecto.id);
  const conModelo = ultimo?.status === "success" ? ultimo : await deps.persistence.jobs.latestForProject(tenantId, proyecto.id, "success");
  return respuestaJson({
    proyecto: { uuid: proyecto.erpProjectId, codigo: proyecto.code, nombre: proyecto.name, fechaEntrega: proyecto.deliveryDate },
    trabajo: ultimo ? { uuid: ultimo.id, estado: ultimo.status, mensaje: ultimo.message, actualizadoEn: ultimo.updatedAt.toISOString() } : null,
    modelo: conModelo ? { trabajoUuid: conModelo.id, nombre: conModelo.model.name, version: conModelo.model.version } : null,
  });
}

type TrabajoConModelo = { ok: true; tenantId: string; job: Job } | { ok: false; respuesta: Response };

/** Sesión + proyecto de su carpintería + su último trabajo `success` (el que sirven /modelo y /listado). */
async function trabajoConModelo(request: Request, deps: DepsIntegracion, proyectoUuid: string): Promise<TrabajoConModelo> {
  const s = await exigirSesion(request, deps);
  if (!s.ok) return s;
  const noEncontrado = { ok: false as const, respuesta: respuestaJson({ error: "no-encontrado" }, 404) };
  if (!UUID.test(proyectoUuid)) return noEncontrado;
  const { tenantId } = s.session;
  const proyecto = await deps.persistence.projects.getErpProject(tenantId, normalizarUuid(proyectoUuid));
  if (!proyecto) return noEncontrado;
  const job = await deps.persistence.jobs.latestForProject(tenantId, proyecto.id, "success");
  if (!job) return noEncontrado;
  return { ok: true, tenantId, job };
}

/** IE-5: GET /api/erp/proyectos/{uuid}/modelo: el .dae del último trabajo `success`, sacado del zip guardado. */
export async function getModelo(request: Request, deps: DepsIntegracion, proyectoUuid: string): Promise<Response> {
  const t = await trabajoConModelo(request, deps, proyectoUuid);
  if (!t.ok) return t.respuesta;
  const { tenantId, job } = t;
  const noEncontrado = () => respuestaJson({ error: "no-encontrado" }, 404);
  const zip = await deps.persistence.almacen.leer(tenantId, job.model.sha256);
  if (!zip) return noEncontrado();
  let dae: Uint8Array;
  try {
    dae = extraerDae(zip, { maxBytes: deps.config.zipMaxBytes }).bytes;
  } catch (error) {
    if (!(error instanceof ZipInvalidoError)) throw error;
    return respuestaJson({ error: "zip-invalido", motivo: error.motivo }, 422);
  }
  return new Response(dae.slice().buffer as ArrayBuffer, {
    headers: { "content-type": "model/vnd.collada+xml", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-ucp-trabajo": job.id },
  });
}

/**
 * IC-6 (docs/spec-importador-csv-envio.md): GET /api/erp/proyectos/{uuid}/listado: el listado de piezas del mismo
 * trabajo que sirve /modelo, recalculado desde los bytes del CSV guardados (el parser es puro y determinista). Un CSV
 * guardado que no da un listado publicable (trabajos aceptados antes del importador) da 404 `sin-listado`.
 */
export async function getListado(request: Request, deps: DepsIntegracion, proyectoUuid: string): Promise<Response> {
  const t = await trabajoConModelo(request, deps, proyectoUuid);
  if (!t.ok) return t.respuesta;
  const { tenantId, job } = t;
  const csv = await deps.persistence.almacen.leer(tenantId, job.csv.sha256);
  if (!csv) return respuestaJson({ error: "no-encontrado" }, 404);
  const lectura = leerCsvDelEnvio(csv);
  if (!lectura.ok) return respuestaJson({ error: "sin-listado", trabajoUuid: job.id }, 404);
  const { listado } = lectura;
  return respuestaJson({
    trabajoUuid: job.id,
    listadoId: listadoId(listado.pieces),
    piezas: listado.piezas,
    tipos: listado.tipos,
    piezasTotales: listado.piezasTotales,
    metrosCanto: listado.metrosCanto,
    avisos: listado.avisos,
  });
}
