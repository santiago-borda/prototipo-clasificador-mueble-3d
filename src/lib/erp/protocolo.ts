// IE-3: protocolo de mensajes entre este sistema (UCP, en un iframe) y el frontend del ERP, según el contrato UCP v1
// §5 (docs/casa-mueble/contrato-ucp-v1.md; docs/spec-integracion-erp-minima.md v0.3). Funciones puras: sin window,
// sin React, sin red. El navegador las usa desde src/components/erp/ y el anfitrión simulado desde erp-simulado/.
//
// Reglas:
//   - un mensaje se acepta solo si `event.origin === ERP_WEB_ORIGEN`, `event.source` es la ventana padre y el cuerpo
//     cumple el esquema; lo demás se descarta sin error visible y se registra solo el motivo (nunca el cuerpo);
//   - los envíos usan `ERP_WEB_ORIGEN` como `targetOrigin`, nunca "*";
//   - el token vive solo en memoria el tiempo de mandarlo a la API propia: nunca en la URL, en storage ni en logs.
//
// ASUMIDO (el contrato no lo define; lo generó una IA, se valida en U-erp-front):
//   - `vence` es epoch en **segundos** (como `exp` del JWT);
//   - las claves de más se ignoran (lector tolerante: el ERP puede sumar campos sin romper la v1);
//   - sin `tema`, se usa "claro";
//   - los UUID se comparan sin distinguir mayúsculas (la carpintería de QA viene en mayúsculas).

export const VERSION_PROTOCOLO = 1 as const;

export type Tema = "claro" | "oscuro";

export interface ProyectoDelErp {
  uuid: string;
  codigo: string;
  nombre: string;
}

/** Mensajes que manda este sistema (el iframe) al ERP. `ucp:navegar` existe en el contrato pero no se usa en v1. */
export type MensajeUcp =
  | { tipo: "ucp:listo"; version: 1 }
  | { tipo: "ucp:alto"; version: 1; alto: number }
  | { tipo: "ucp:navegar"; version: 1; ruta: string };

/** Mensajes que manda el ERP al iframe. */
export type MensajeErp =
  | { tipo: "erp:sesion"; version: 1; accessToken: string; vence: number; tenantId: string; proyecto: ProyectoDelErp; tema: Tema }
  | { tipo: "erp:token"; version: 1; accessToken: string; vence: number };

/** Tope del token (un JWT RS256 razonable mide menos de 2 KB). ASUMIDO hasta U-erp-real. */
export const TOKEN_MAX_LARGO = 8192;
/** Tope de un texto del proyecto (código, nombre). */
export const TEXTO_MAX_LARGO = 200;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Forma única de un UUID para comparar y guardar: minúsculas. */
export function normalizarUuid(uuid: string): string {
  return uuid.toLowerCase();
}

/** Por qué se descartó un mensaje. Es lo único que se registra: nunca el cuerpo. */
export type MotivoDescarte = "origen-no-permitido" | "fuente-no-es-el-padre" | "esquema-invalido" | "tipo-no-esperado";

function esObjetoPlano(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
}

/** Forma de un JWT compacto: tres partes base64url (la firma la valida el servidor, IE-1). */
export function esTokenBienFormado(t: unknown): t is string {
  return typeof t === "string" && t.length > 0 && t.length <= TOKEN_MAX_LARGO && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t);
}

/** Epoch en segundos plausible (2001 a 5138). */
function esEpochSegundos(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x > 1e9 && x < 1e11;
}

function esTexto(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0 && x.length <= TEXTO_MAX_LARGO;
}

function parsearProyecto(x: unknown): ProyectoDelErp | null {
  if (!esObjetoPlano(x)) return null;
  const { uuid, codigo, nombre } = x;
  if (typeof uuid !== "string" || !UUID.test(uuid) || !esTexto(codigo) || !esTexto(nombre)) return null;
  return { uuid: normalizarUuid(uuid), codigo, nombre };
}

/** Valida un mensaje del ERP contra el esquema. null si no cumple (tipo, versión, campos y sus tipos). */
export function parsearMensajeDelErp(data: unknown): MensajeErp | null {
  if (!esObjetoPlano(data) || data.version !== VERSION_PROTOCOLO) return null;
  if (!esTokenBienFormado(data.accessToken) || !esEpochSegundos(data.vence)) return null;
  if (data.tipo === "erp:token") return { tipo: "erp:token", version: 1, accessToken: data.accessToken, vence: data.vence };
  if (data.tipo !== "erp:sesion") return null;
  const proyecto = parsearProyecto(data.proyecto);
  const { tenantId } = data;
  if (!proyecto || typeof tenantId !== "string" || !UUID.test(tenantId)) return null;
  const tema = data.tema === undefined ? "claro" : data.tema;
  if (tema !== "claro" && tema !== "oscuro") return null;
  return { tipo: "erp:sesion", version: 1, accessToken: data.accessToken, vence: data.vence, tenantId: normalizarUuid(tenantId), proyecto, tema };
}

/** Valida un mensaje de este sistema (lo usa el anfitrión simulado, IE-13). */
export function parsearMensajeDelUcp(data: unknown): MensajeUcp | null {
  if (!esObjetoPlano(data) || data.version !== VERSION_PROTOCOLO) return null;
  switch (data.tipo) {
    case "ucp:listo":
      return { tipo: "ucp:listo", version: 1 };
    case "ucp:alto":
      return typeof data.alto === "number" && Number.isInteger(data.alto) && data.alto >= 0 && data.alto <= 100_000
        ? { tipo: "ucp:alto", version: 1, alto: data.alto }
        : null;
    case "ucp:navegar":
      return typeof data.ruta === "string" && data.ruta.startsWith("/") && data.ruta.length <= 2000 ? { tipo: "ucp:navegar", version: 1, ruta: data.ruta } : null;
    default:
      return null;
  }
}

/** Lo que importa de un `MessageEvent` (así se prueba sin navegador). */
export interface EventoMensaje {
  origin: string;
  source: unknown;
  data: unknown;
}

export type Resultado<T> = { ok: true; mensaje: T } | { ok: false; motivo: MotivoDescarte };

/** Un objeto plano cuyo `tipo` no es de la otra parte (lo que no es un objeto plano es «esquema inválido»). */
function sinTipoConocido(data: unknown, prefijo: string): boolean {
  return esObjetoPlano(data) && !(typeof data.tipo === "string" && data.tipo.startsWith(prefijo));
}

/** IE-3 / TIE-4: decide si el iframe acepta un mensaje. `padre` es `window.parent`; `origen`, `ERP_WEB_ORIGEN`. */
export function aceptarMensajeDelErp(evento: EventoMensaje, contexto: { origen: string; padre: unknown }): Resultado<MensajeErp> {
  if (evento.origin !== contexto.origen) return { ok: false, motivo: "origen-no-permitido" };
  if (contexto.padre === null || contexto.padre === undefined || evento.source !== contexto.padre) {
    return { ok: false, motivo: "fuente-no-es-el-padre" };
  }
  if (sinTipoConocido(evento.data, "erp:")) return { ok: false, motivo: "tipo-no-esperado" };
  const mensaje = parsearMensajeDelErp(evento.data);
  return mensaje ? { ok: true, mensaje } : { ok: false, motivo: "esquema-invalido" };
}

/** Lo mismo del lado del ERP (anfitrión simulado): solo `ucp:*`, del origen de este sistema y del iframe. */
export function aceptarMensajeDelUcp(evento: EventoMensaje, contexto: { origenUcp: string; iframe: unknown }): Resultado<MensajeUcp> {
  if (evento.origin !== contexto.origenUcp) return { ok: false, motivo: "origen-no-permitido" };
  if (contexto.iframe === null || contexto.iframe === undefined || evento.source !== contexto.iframe) {
    return { ok: false, motivo: "fuente-no-es-el-padre" };
  }
  if (sinTipoConocido(evento.data, "ucp:")) return { ok: false, motivo: "tipo-no-esperado" };
  const mensaje = parsearMensajeDelUcp(evento.data);
  return mensaje ? { ok: true, mensaje } : { ok: false, motivo: "esquema-invalido" };
}

/**
 * IE-3 / TIE-6 (lado del iframe): `erp:sesion` tiene que ser del proyecto de la ruta. La otra mitad de TIE-6
 * (`tenantId` igual al `tenant_id` del token) la verifica el servidor, que es el único que valida el token.
 */
export function sesionEsDeLaRuta(mensaje: Extract<MensajeErp, { tipo: "erp:sesion" }>, proyectoDeLaRuta: string): boolean {
  return UUID.test(proyectoDeLaRuta) && mensaje.proyecto.uuid === normalizarUuid(proyectoDeLaRuta);
}

/** Lo mínimo de una ventana para mandarle un mensaje. */
export interface Destino {
  postMessage(mensaje: unknown, targetOrigin: string): void;
}

export class TargetOriginInvalidoError extends Error {
  constructor() {
    super('El targetOrigin tiene que ser el origen exacto del ERP, nunca "*".');
    this.name = "TargetOriginInvalidoError";
  }
}

/** Único punto por el que este sistema manda mensajes al ERP (TIE-5). Lanza con "*" o con algo que no es un origen. */
export function enviarAlErp(destino: Destino, mensaje: MensajeUcp, origenErp: string): void {
  let valido = false;
  try {
    valido = origenErp !== "*" && new URL(origenErp).origin === origenErp;
  } catch {
    valido = false;
  }
  if (!valido) throw new TargetOriginInvalidoError();
  destino.postMessage(mensaje, origenErp);
}

/** Texto fijo que se registra al descartar un mensaje: el motivo y nada del cuerpo ni del origen. */
export function textoDescarte(motivo: MotivoDescarte): string {
  return `ucp:mensaje-descartado ${motivo}`;
}
