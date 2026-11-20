// IE-1: esquemas de las respuestas del ERP, validados a mano (sin dependencias). Solo `whoami` está relevado
// (16/11: id, nombre y tenant activo); su forma exacta y la de las lecturas son **ASUMIDAS** hasta U-erp-real.
// Cada validador devuelve un objeto nuevo con solo los campos conocidos: lo demás que mande el ERP se ignora.

import { ID_ERP } from "@/lib/embebido/ids";
import { RespuestaErpInvalida } from "./errores";

export { ID_ERP };

export interface UsuarioErp {
  id: string;
  nombre: string;
  tenant: { id: string; nombre: string };
}

export interface ProyectoResumenErp {
  id: string;
  nombre: string;
}

export interface MuebleErp {
  id: string;
  nombre: string;
  /** Lo que el ERP dice que tiene; el PFG no usa su lista de piezas (CLAUDE.md, relevamiento del 16/11). */
  cantidadPiezas: number | null;
}

export interface DocumentoErp {
  id: string;
  nombre: string;
  contentType: string;
  bytes: number | null;
}

export interface ProyectoErp {
  id: string;
  nombre: string;
  tenantId: string;
  muebles: MuebleErp[];
  documentos: DocumentoErp[];
}


type Obj = Record<string, unknown>;

function obj(ruta: string, x: unknown, donde: string): Obj {
  if (typeof x !== "object" || x === null || Array.isArray(x)) throw new RespuestaErpInvalida(ruta, `${donde} no es un objeto`);
  return x as Obj;
}

function texto(ruta: string, o: Obj, campo: string, donde: string, max = 500): string {
  const v = o[campo];
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new RespuestaErpInvalida(ruta, `${donde}.${campo} no es texto`);
  return v;
}

function id(ruta: string, o: Obj, campo: string, donde: string): string {
  const v = texto(ruta, o, campo, donde, 64);
  if (!ID_ERP.test(v)) throw new RespuestaErpInvalida(ruta, `${donde}.${campo} no tiene formato de id`);
  return v;
}

function entero(ruta: string, o: Obj, campo: string, donde: string): number | null {
  const v = o[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new RespuestaErpInvalida(ruta, `${donde}.${campo} no es un entero`);
  return v;
}

function lista(ruta: string, o: Obj, campo: string, donde: string, max = 500): unknown[] {
  const v = o[campo];
  if (!Array.isArray(v) || v.length > max) throw new RespuestaErpInvalida(ruta, `${donde}.${campo} no es una lista`);
  return v;
}

export function validarUsuario(ruta: string, x: unknown): UsuarioErp {
  const o = obj(ruta, x, "usuario");
  const tenant = obj(ruta, o.tenant, "usuario.tenant");
  return {
    id: id(ruta, o, "id", "usuario"),
    nombre: texto(ruta, o, "nombre", "usuario"),
    tenant: { id: id(ruta, tenant, "id", "tenant"), nombre: texto(ruta, tenant, "nombre", "tenant") },
  };
}

export function validarProyectos(ruta: string, x: unknown): ProyectoResumenErp[] {
  if (!Array.isArray(x) || x.length > 5000) throw new RespuestaErpInvalida(ruta, "la lista de proyectos no es una lista");
  return x.map((p, i) => {
    const o = obj(ruta, p, `proyectos[${i}]`);
    return { id: id(ruta, o, "id", `proyectos[${i}]`), nombre: texto(ruta, o, "nombre", `proyectos[${i}]`) };
  });
}

export function validarProyecto(ruta: string, x: unknown): ProyectoErp {
  const o = obj(ruta, x, "proyecto");
  return {
    id: id(ruta, o, "id", "proyecto"),
    nombre: texto(ruta, o, "nombre", "proyecto"),
    tenantId: id(ruta, o, "tenantId", "proyecto"),
    muebles: lista(ruta, o, "muebles", "proyecto").map((m, i) => {
      const mo = obj(ruta, m, `muebles[${i}]`);
      return { id: id(ruta, mo, "id", `muebles[${i}]`), nombre: texto(ruta, mo, "nombre", `muebles[${i}]`), cantidadPiezas: entero(ruta, mo, "cantidadPiezas", `muebles[${i}]`) };
    }),
    documentos: lista(ruta, o, "documentos", "proyecto").map((d, i) => {
      const dobj = obj(ruta, d, `documentos[${i}]`);
      return {
        id: id(ruta, dobj, "id", `documentos[${i}]`),
        nombre: texto(ruta, dobj, "nombre", `documentos[${i}]`),
        contentType: texto(ruta, dobj, "contentType", `documentos[${i}]`, 200),
        bytes: entero(ruta, dobj, "bytes", `documentos[${i}]`),
      };
    }),
  };
}

/** ¿Es un zip (el que lleva el modelo 3D)? Por tipo o por extensión. ASUMIDO. */
export function esZip(doc: DocumentoErp): boolean {
  return /zip/i.test(doc.contentType) || /\.zip$/i.test(doc.nombre);
}
