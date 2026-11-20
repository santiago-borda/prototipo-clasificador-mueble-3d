// IE-6 a IE-9: lectura del proyecto del ERP y de su modelo 3D para la pantalla embebida. Solo servidor.
// Toda lectura usa la carpintería y el token de la sesión; nunca un tenant que mande el navegador.
// Un proyecto que no es del tenant de la sesión (lo diga el ERP con un 404 o lo detectemos acá) es «no encontrado».

import { ErpNoDisponible, RecursoErpInexistente, RespuestaErpInvalida, TokenErpInvalido, TokenErpVencido } from "@/server/erp/errores";
import { esZip, ID_ERP, type ProyectoErp } from "@/server/erp/esquemas";
import { ZipInvalidoError, type MotivoZipInvalido } from "@/server/erp/zip";
import { leerSesion, type DepsEmbebido, type SesionActiva } from "./sesion";

export type FallaEmbebido =
  | { estado: "no-autenticada" }
  | { estado: "token-vencido" }
  | { estado: "no-encontrado" }
  | { estado: "erp-no-disponible" }
  | { estado: "respuesta-invalida" };

export type ProyectoCargado = FallaEmbebido | { estado: "ok"; proyecto: ProyectoErp; projectId: string };

/** Traduce un error del cliente del ERP a un estado de la pantalla. Lo demás se propaga (error de la app). */
function falla(error: unknown): FallaEmbebido {
  if (error instanceof TokenErpVencido || error instanceof TokenErpInvalido) return { estado: "token-vencido" };
  if (error instanceof RecursoErpInexistente) return { estado: "no-encontrado" };
  if (error instanceof ErpNoDisponible) return { estado: "erp-no-disponible" };
  if (error instanceof RespuestaErpInvalida) return { estado: "respuesta-invalida" };
  throw error;
}

async function proyectoDeLaSesion(deps: DepsEmbebido, activa: SesionActiva, erpProyectoId: string): Promise<ProyectoCargado> {
  if (!ID_ERP.test(erpProyectoId)) return { estado: "no-encontrado" };
  let proyecto: ProyectoErp;
  try {
    proyecto = await deps.erp.leerProyecto(activa.tokenErp, erpProyectoId);
  } catch (error) {
    const f = falla(error);
    deps.registrar("lectura-erp", { estado: f.estado, erpProyectoId });
    return f;
  }
  // TIE-10: aunque el ERP lo devuelva, un proyecto de otro tenant no se muestra.
  if (proyecto.tenantId !== activa.session.erpTenantId) {
    deps.registrar("lectura-erp", { estado: "otro-tenant", erpProyectoId });
    return { estado: "no-encontrado" };
  }
  const projectId = await deps.persistence.projects.linkErpProject(activa.session.tenantId, { erpProjectId: proyecto.id, name: proyecto.nombre });
  return { estado: "ok", proyecto, projectId };
}

/** IE-7: lo que muestra /embebido/proyectos/<erpId>. */
export async function cargarProyecto(deps: DepsEmbebido, tokenDeSesion: string | undefined, erpProyectoId: string): Promise<ProyectoCargado> {
  const activa = await leerSesion(deps, tokenDeSesion);
  if (!activa) return { estado: "no-autenticada" };
  return proyectoDeLaSesion(deps, activa, erpProyectoId);
}

export type ModeloCargado =
  | FallaEmbebido
  | { estado: "zip-invalido"; motivo: MotivoZipInvalido }
  | { estado: "ok"; dae: Uint8Array; sha256: string };

/**
 * IE-8: el .dae del zip de un Documento del proyecto. Valida el zip, registra su sha256 en la base y devuelve el
 * .dae para el visor; el archivo no se guarda en ningún lado.
 */
export async function cargarModelo(
  deps: DepsEmbebido,
  tokenDeSesion: string | undefined,
  erpProyectoId: string,
  documentoId: string,
): Promise<ModeloCargado> {
  const activa = await leerSesion(deps, tokenDeSesion);
  if (!activa) return { estado: "no-autenticada" };
  const cargado = await proyectoDeLaSesion(deps, activa, erpProyectoId);
  if (cargado.estado !== "ok") return cargado;
  const documento = cargado.proyecto.documentos.find((d) => d.id === documentoId);
  if (!documento || !esZip(documento)) return { estado: "no-encontrado" };
  try {
    const descargado = await deps.erp.descargarDocumento(activa.tokenErp, erpProyectoId, documentoId);
    await deps.persistence.erpDocuments.record(activa.session.tenantId, cargado.projectId, {
      erpDocumentId: documentoId,
      sha256: descargado.sha256,
      bytes: descargado.bytes,
    });
    deps.registrar("modelo-abierto", { erpProyectoId });
    return { estado: "ok", dae: descargado.dae.bytes, sha256: descargado.sha256 };
  } catch (error) {
    if (error instanceof ZipInvalidoError) {
      deps.registrar("modelo-rechazado", { motivo: error.motivo, erpProyectoId });
      return { estado: "zip-invalido", motivo: error.motivo };
    }
    const f = falla(error);
    deps.registrar("lectura-erp", { estado: f.estado, erpProyectoId });
    return f;
  }
}
