// IE-7 e IE-8: POST /api/trabajos y GET /api/trabajos/{trabajoUuid} (contrato UCP v1 §3). Funciones de Request a
// Response con las dependencias inyectadas. Los llama el servidor del ERP con `Authorization: Bearer <token del
// usuario>`; el tenant sale del token, nunca del cuerpo ni de la URL (TIE-16).
//
// Códigos (spec v0.3 IE-7; estados según las respuestas del 20/11; reintento de `failed`: IE-I2 enmendada):
//   201 trabajo nuevo `success` · 200 mismo envioUuid ya `success` o `inProgress` (sin descargar de nuevo), o reintento
//   de uno `failed` sobre el mismo trabajoUuid · 400 esquema o URL
//   rechazada (sin descargar) · 401 token · 422 sha256 que no coincide, zip inválido o URL que respondió 4xx (queda un
//   trabajo `failed` con la causa) · 503 descarga o JWKS no disponibles (reintentable; no queda trabajo).
// Todo error lleva `mensaje`, legible para el usuario del ERP. Ninguna respuesta ni registro lleva las URLs.
//
// Importador del CSV (docs/spec-importador-csv-envio.md IC-1 a IC-5): con los archivos verificados, el CSV se lee
// con el parser de OpenCutList. Un CSV ilegible o con filas con problemas deja el trabajo `failed` (422) con la
// causa; los archivos se guardan solo si el trabajo queda `success`.

import type { Job, JobFile } from "@/persistence/ports";
import { DescargaFallida, JwksNoDisponible, TokenErpInvalido, TokenErpVencido } from "@/server/erp/errores";
import { descargar, motivoUrlRechazada, sha256Hex, type MotivoUrlRechazada } from "@/server/erp/descarga";
import type { IdentidadErp } from "@/server/erp/token";
import { extraerDae, ZipInvalidoError, type MotivoZipInvalido } from "@/server/erp/zip";
import { acotar, leerCsvDelEnvio, mensajeListadoLeido } from "@/lib/csv-ocl/envio";
import { normalizarUuid, UUID } from "@/lib/erp/protocolo";
import { parsearEnvio, type ArchivoDelEnvio, type Envio } from "./envio";
import { bearer, cuerpoJson, respuestaJson } from "./http";
import { nombreDeCarpinteria, type DepsIntegracion } from "./sesion";

export const CUERPO_TRABAJO_MAX_BYTES = 64 * 1024;
/** Un trabajo `inProgress` que no se toca desde hace tantos timeouts se considera abandonado (el proceso murió) y se puede retomar. */
export const ESPERA_ABANDONADO_VECES_TIMEOUT = 4;

const error = (status: number, codigo: string, mensaje: string) => respuestaJson({ error: codigo, mensaje }, status);

type Autenticado = { ok: true; identidad: IdentidadErp } | { ok: false; respuesta: Response };

async function autenticar(request: Request, deps: DepsIntegracion): Promise<Autenticado> {
  const token = bearer(request);
  if (!token) return { ok: false, respuesta: error(401, "no-autenticado", "Falta el token del usuario (Authorization: Bearer).") };
  try {
    return { ok: true, identidad: await deps.validarToken(token) };
  } catch (e) {
    if (e instanceof JwksNoDisponible) {
      deps.registrar("trabajo-rechazado", { motivo: "jwks-no-disponible" });
      return { ok: false, respuesta: error(503, "jwks-no-disponible", "No se pudo validar el token en este momento. Reintentá en unos minutos.") };
    }
    if (e instanceof TokenErpVencido || e instanceof TokenErpInvalido) {
      deps.registrar("trabajo-rechazado", { motivo: "token", error: e.name });
      const mensaje = e instanceof TokenErpVencido ? "El token del usuario venció." : "El token del usuario no es válido.";
      return { ok: false, respuesta: error(401, "token-invalido", mensaje) };
    }
    throw e;
  }
}

const TEXTO_URL: Record<MotivoUrlRechazada, string> = {
  "no-es-url": "no es una URL",
  "no-es-https": "tiene que ser https",
  "con-credenciales": "no puede llevar usuario ni clave",
  "sin-origenes-configurados": "este sistema todavía no tiene configurado el origen de las URLs firmadas",
  "origen-no-permitido": "no es de un origen permitido",
};

const TEXTO_ZIP: Record<MotivoZipInvalido, string> = {
  "demasiado-grande": "El zip del modelo es demasiado grande.",
  formato: "El modelo no es un zip válido o está dañado.",
  "sin-dae": "El zip del modelo no trae ningún archivo .dae.",
  "ruta-insegura": "El zip del modelo tiene rutas no permitidas (por ejemplo con «..»).",
  "metodo-no-soportado": "El zip del modelo usa una compresión no soportada.",
  cifrado: "El zip del modelo está cifrado.",
  "demasiadas-entradas": "El zip del modelo tiene demasiados archivos.",
};

const nombreArchivo = (cual: "modelo" | "csv") => (cual === "modelo" ? "el modelo" : "el CSV");

function textoDescarga(e: DescargaFallida): string {
  if (e.detalle === "demasiado-grande") return `${e.archivo === "modelo" ? "El modelo" : "El CSV"} supera el tamaño máximo permitido.`;
  if (e.reintentable) return `No se pudo descargar ${nombreArchivo(e.archivo)}. Reintentá el envío.`;
  return `No se pudo descargar ${nombreArchivo(e.archivo)}: la URL respondió ${e.detalle.replace("http-", "HTTP ")} (¿venció?). Volvé a enviar el proyecto.`;
}

const aJobFile = (a: ArchivoDelEnvio): JobFile => ({ sha256: a.sha256, version: a.version, name: a.nombre });

function respuestaDeTrabajo(job: Job, status: number): Response {
  if (job.status === "failed") return respuestaJson({ trabajoUuid: job.id, estado: job.status, error: "envio-invalido", mensaje: job.message }, 422);
  return respuestaJson({ trabajoUuid: job.id, estado: job.status }, status);
}

/** Descarga y verifica los dos archivos. Devuelve los bytes o la causa del fallo (sin guardar nada). */
async function descargarYVerificar(
  deps: DepsIntegracion,
  envio: Envio,
): Promise<{ ok: true; modelo: Uint8Array; csv: Uint8Array } | { ok: false; reintentable: boolean; mensaje: string; motivo: string }> {
  const { config } = deps;
  const bajar = (cual: "modelo" | "csv") =>
    descargar(envio[cual].url, {
      archivo: cual,
      maxBytes: cual === "modelo" ? config.zipMaxBytes : config.csvMaxBytes,
      timeoutMs: config.timeoutMs,
      fetchImpl: deps.fetchImpl,
    });
  let modelo: Uint8Array;
  let csv: Uint8Array;
  try {
    [modelo, csv] = await Promise.all([bajar("modelo"), bajar("csv")]);
  } catch (e) {
    if (!(e instanceof DescargaFallida)) throw e;
    return { ok: false, reintentable: e.reintentable, mensaje: textoDescarga(e), motivo: `descarga-${e.archivo}-${e.detalle}` };
  }
  for (const [cual, datos] of [["modelo", modelo], ["csv", csv]] as const) {
    if (sha256Hex(datos) !== envio[cual].sha256) {
      return {
        ok: false,
        reintentable: false,
        mensaje: `${cual === "modelo" ? "El modelo" : "El CSV"} descargado no coincide con su sha256: el archivo cambió o se dañó. Volvé a enviar el proyecto.`,
        motivo: `sha256-${cual}`,
      };
    }
  }
  try {
    extraerDae(modelo, { maxBytes: config.zipMaxBytes });
  } catch (e) {
    if (!(e instanceof ZipInvalidoError)) throw e;
    return { ok: false, reintentable: false, mensaje: TEXTO_ZIP[e.motivo], motivo: `zip-${e.motivo}` };
  }
  return { ok: true, modelo, csv };
}

/** IC-2 a IC-5: el CSV ya verificado → mensaje del trabajo `success`, o la causa del `failed`. */
function resultadoDelCsv(csv: Uint8Array): { ok: true; mensaje: string } | { ok: false; mensaje: string; motivo: string } {
  const lectura = leerCsvDelEnvio(csv);
  return lectura.ok ? { ok: true, mensaje: mensajeListadoLeido(lectura.listado) } : { ok: false, mensaje: lectura.mensaje, motivo: lectura.motivo };
}

/** IE-7: POST /api/trabajos. */
export async function postTrabajo(request: Request, deps: DepsIntegracion): Promise<Response> {
  const auth = await autenticar(request, deps);
  if (!auth.ok) return auth.respuesta;
  const cuerpo = await cuerpoJson(request, CUERPO_TRABAJO_MAX_BYTES);
  if (!cuerpo) return error(400, "esquema-invalido", "El cuerpo tiene que ser un JSON (application/json) de hasta 64 KB.");
  const parseado = parsearEnvio(cuerpo);
  if (!parseado.ok) {
    deps.registrar("trabajo-rechazado", { motivo: "esquema" });
    return error(400, "esquema-invalido", parseado.mensaje);
  }
  const { envio } = parseado;
  // TIE-15: antes de cualquier descarga.
  for (const cual of ["modelo", "csv"] as const) {
    const motivo = motivoUrlRechazada(envio[cual].url, deps.config.blobOrigenes, { permitirHttp: deps.config.modo === "simulado" });
    if (motivo) {
      deps.registrar("trabajo-rechazado", { motivo: `url-${motivo}`, archivo: cual });
      return error(400, "url-rechazada", `La URL ${cual === "modelo" ? "del modelo" : "del CSV"} ${TEXTO_URL[motivo]}.`);
    }
  }

  const { persistence } = deps;
  const tenant = await persistence.tenants.ensureErpTenant({ erpTenantId: auth.identidad.erpTenant, name: nombreDeCarpinteria(auth.identidad.erpTenant) });
  const projectId = await persistence.projects.upsertErpProject(tenant.id, {
    erpProjectId: envio.proyecto.uuid,
    code: envio.proyecto.codigo,
    name: envio.proyecto.nombre,
    deliveryDate: envio.proyecto.fechaEntrega,
  });
  // TIE-13: se reserva el envío antes de descargar (atómico, también entre dos pedidos a la vez).
  //  - mismo envioUuid ya `success` o `inProgress` vigente → el mismo trabajo, sin descargar (200);
  //  - ya `failed` (o `inProgress` abandonado) → se reintenta sobre el MISMO trabajoUuid: descarga, verifica y actualiza
  //    estado, mensaje y actualizado (200; si falla de nuevo, 422);
  //  - nuevo → 201.
  const reserva = await persistence.jobs.claim(
    tenant.id,
    { id: deps.nuevoUuid(), envioUuid: envio.envioUuid, projectId, model: aJobFile(envio.modelo), csv: aJobFile(envio.csv) },
    new Date(deps.ahora().getTime() - ESPERA_ABANDONADO_VECES_TIMEOUT * deps.config.timeoutMs),
  );
  if (reserva.outcome === "existing") {
    deps.registrar("trabajo-repetido", { estado: reserva.job.status });
    return respuestaDeTrabajo(reserva.job, 200);
  }
  const previous = reserva.outcome === "retry" ? reserva.previous : null;
  const jobId = reserva.job.id;

  try {
    const verificado = await descargarYVerificar(deps, envio);
    if (!verificado.ok && verificado.reintentable) {
      // 503: no queda rastro (trabajo nuevo) o vuelve a su `failed` anterior (reintento).
      await persistence.jobs.abandon(tenant.id, jobId, previous);
      deps.registrar("trabajo-no-disponible", { motivo: verificado.motivo });
      return error(503, "descarga-no-disponible", verificado.mensaje);
    }
    // IC-1 a IC-5: con los archivos verificados, se lee el CSV.
    const resultado = verificado.ok ? resultadoDelCsv(verificado.csv) : verificado;
    if (resultado.ok && verificado.ok) {
      await persistence.almacen.guardar(tenant.id, envio.modelo.sha256, verificado.modelo, "modelo");
      await persistence.almacen.guardar(tenant.id, envio.csv.sha256, verificado.csv, "csv");
    }
    const job = await persistence.jobs.settle(tenant.id, jobId, { status: resultado.ok ? "success" : "failed", message: acotar(resultado.mensaje, 1900) } /* IC-I7: job.message es varchar(2000) */);
    deps.registrar(reserva.outcome === "created" ? "trabajo-creado" : "trabajo-reintentado", { estado: job.status, ...(resultado.ok ? {} : { motivo: resultado.motivo }) });
    return respuestaDeTrabajo(job, reserva.outcome === "created" ? 201 : 200);
  } catch (e) {
    // Un error inesperado (p. ej. la base) no deja el envío trabado en `inProgress`.
    await persistence.jobs.abandon(tenant.id, jobId, previous ?? null).catch(() => undefined);
    throw e;
  }
}

/** IE-8: GET /api/trabajos/{trabajoUuid}. Un trabajo de otra carpintería (o inexistente) da 404 (TIE-17). */
export async function getTrabajo(request: Request, deps: DepsIntegracion, trabajoUuid: string): Promise<Response> {
  const auth = await autenticar(request, deps);
  if (!auth.ok) return auth.respuesta;
  const noEncontrado = () => error(404, "no-encontrado", "No existe ese trabajo.");
  if (!UUID.test(trabajoUuid)) return noEncontrado();
  const tenant = await deps.persistence.tenants.findErpTenant(auth.identidad.erpTenant);
  if (!tenant) return noEncontrado();
  const job = await deps.persistence.jobs.get(tenant.id, normalizarUuid(trabajoUuid));
  if (!job) return noEncontrado();
  return respuestaJson({
    trabajoUuid: job.id,
    envioUuid: job.envioUuid,
    estado: job.status,
    mensaje: job.message,
    actualizadoEn: job.updatedAt.toISOString(),
  });
}
