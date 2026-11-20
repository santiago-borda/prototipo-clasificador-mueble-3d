// IE-1: cliente tipado del ERP, de solo lectura (docs/spec-integracion-erp-minima.md). Solo servidor.
// Sin login ni refresh (v0.2 §0): el token lo pasa el frontend del ERP y este cliente solo lo reenvía como Bearer.
// Respuestas validadas con esquema (esquemas.ts), errores con nombre (errores.ts), timeout configurable y un solo
// reintento, únicamente cuando el ERP no respondió (todas las llamadas son lecturas: GET).
// Ningún error ni registro lleva el token.

import { ErpNoDisponible, RecursoErpInexistente, RespuestaErpInvalida, TokenErpInvalido, TokenErpVencido } from "./errores";
import {
  validarProyecto,
  validarProyectos,
  validarUsuario,
  type ProyectoErp,
  type ProyectoResumenErp,
  type UsuarioErp,
} from "./esquemas";
import { RUTAS_ERP } from "./rutas";
import { extraerDae, ZipInvalidoError, type DaeDelZip } from "./zip";
import { createHash } from "node:crypto";

export interface DocumentoDescargado {
  /** sha256 del zip tal como llegó, en hex. */
  sha256: string;
  bytes: number;
  dae: DaeDelZip;
}

export interface ClienteErp {
  whoami(token: string): Promise<UsuarioErp>;
  listarProyectos(token: string): Promise<ProyectoResumenErp[]>;
  leerProyecto(token: string, erpProyectoId: string): Promise<ProyectoErp>;
  /** Descarga el zip del Documento y lo valida (tamaño, rutas, .dae). No guarda nada. */
  descargarDocumento(token: string, erpProyectoId: string, documentoId: string): Promise<DocumentoDescargado>;
}

export interface OpcionesClienteErp {
  baseUrl: string;
  timeoutMs: number;
  zipMaxBytes: number;
  fetchImpl?: typeof fetch;
}

type Contexto = "validar-token" | "sesion";

export function crearClienteErp(opciones: OpcionesClienteErp): ClienteErp {
  const hacerFetch = opciones.fetchImpl ?? fetch;
  const base = opciones.baseUrl.replace(/\/+$/, "");

  /** Una llamada, con timeout. Traduce el estado HTTP a los errores con nombre. */
  async function intento(ruta: string, token: string, contexto: Contexto): Promise<Response> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), opciones.timeoutMs);
    let respuesta: Response;
    try {
      respuesta = await hacerFetch(`${base}${ruta}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}`, accept: "application/json, application/zip" },
        signal: control.signal,
        redirect: "error",
        cache: "no-store",
      });
    } catch (error) {
      throw new ErpNoDisponible(control.signal.aborted ? "tiempo-agotado" : "red", { cause: error });
    } finally {
      clearTimeout(reloj);
    }
    if (respuesta.ok) return respuesta;
    await respuesta.body?.cancel().catch(() => {});
    if (respuesta.status === 401) throw contexto === "validar-token" ? new TokenErpInvalido() : new TokenErpVencido();
    if (respuesta.status === 403) throw new TokenErpInvalido();
    if (respuesta.status === 404) throw new RecursoErpInexistente(ruta);
    if (respuesta.status >= 500) throw new ErpNoDisponible(`http-${respuesta.status}`);
    throw new RespuestaErpInvalida(ruta, `estado ${respuesta.status}`);
  }

  /** IE-1: un reintento solo en lecturas y solo si el ERP no respondió. */
  async function pedir(ruta: string, token: string, contexto: Contexto): Promise<Response> {
    try {
      return await intento(ruta, token, contexto);
    } catch (error) {
      if (!(error instanceof ErpNoDisponible)) throw error;
      return intento(ruta, token, contexto);
    }
  }

  async function pedirJson(ruta: string, token: string, contexto: Contexto): Promise<unknown> {
    const respuesta = await pedir(ruta, token, contexto);
    try {
      return await respuesta.json();
    } catch {
      throw new RespuestaErpInvalida(ruta, "el cuerpo no es JSON");
    }
  }

  /** Lee el cuerpo sin pasarse del tope (aunque el ERP no mande Content-Length o mienta). */
  async function leerConTope(respuesta: Response): Promise<Uint8Array> {
    const declarado = Number(respuesta.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declarado) && declarado > opciones.zipMaxBytes) {
      await respuesta.body?.cancel().catch(() => {});
      throw new ZipInvalidoError("demasiado-grande");
    }
    if (!respuesta.body) return new Uint8Array(await respuesta.arrayBuffer());
    const lector = respuesta.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > opciones.zipMaxBytes) {
        await lector.cancel().catch(() => {});
        throw new ZipInvalidoError("demasiado-grande");
      }
      partes.push(value);
    }
    const bytes = new Uint8Array(total);
    let o = 0;
    for (const p of partes) {
      bytes.set(p, o);
      o += p.length;
    }
    return bytes;
  }

  return {
    async whoami(token) {
      return validarUsuario(RUTAS_ERP.whoami, await pedirJson(RUTAS_ERP.whoami, token, "validar-token"));
    },
    async listarProyectos(token) {
      return validarProyectos(RUTAS_ERP.proyectos, await pedirJson(RUTAS_ERP.proyectos, token, "sesion"));
    },
    async leerProyecto(token, erpProyectoId) {
      const ruta = RUTAS_ERP.proyecto(erpProyectoId);
      const proyecto = validarProyecto(ruta, await pedirJson(ruta, token, "sesion"));
      if (proyecto.id !== erpProyectoId) throw new RespuestaErpInvalida(ruta, "el id del proyecto no coincide");
      return proyecto;
    },
    async descargarDocumento(token, erpProyectoId, documentoId) {
      const ruta = RUTAS_ERP.documento(erpProyectoId, documentoId);
      const bytes = await leerConTope(await pedir(ruta, token, "sesion"));
      const dae = extraerDae(bytes, { maxBytes: opciones.zipMaxBytes });
      return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, dae };
    },
  };
}
