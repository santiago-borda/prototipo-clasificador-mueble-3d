// IE-2: protocolo de mensajes entre este sistema (en un iframe) y el frontend del ERP (docs/spec-integracion-erp-minima.md §5).
// Funciones puras: sin window, sin React, sin red. El navegador las usa desde src/components/embebido/.
//
// Reglas:
//   - un mensaje se acepta solo si `event.origin` está en la lista (coincidencia exacta), `event.source` es la
//     ventana padre y el cuerpo cumple el esquema; lo demás se descarta sin error visible y se registra sin contenido;
//   - los envíos usan un `targetOrigin` explícito de la lista, nunca "*";
//   - el origen del padre sale del `document.referrer` y se valida contra la lista.

export const VERSION_PROTOCOLO = 1 as const;

/** Mensajes que manda este sistema (el iframe) al ERP. */
export type MensajePfg = { tipo: "pfg:listo"; v: 1 } | { tipo: "pfg:token-requerido"; v: 1 };

/** Mensajes que manda el ERP al iframe. */
export type MensajeErp = { tipo: "erp:token"; v: 1; token: string } | { tipo: "erp:salir"; v: 1 };

export type Mensaje = MensajePfg | MensajeErp;

export const TIPOS_PFG = ["pfg:listo", "pfg:token-requerido"] as const;
export const TIPOS_ERP = ["erp:token", "erp:salir"] as const;

/** Tope del token (un JWT razonable mide menos de 2 KB). ASUMIDO hasta U-erp-real. */
export const TOKEN_MAX_LARGO = 8192;

/** Por qué se descartó un mensaje. Es lo único que se registra: nunca el cuerpo. */
export type MotivoDescarte = "origen-no-permitido" | "fuente-no-es-el-padre" | "esquema-invalido" | "tipo-no-esperado";

function esObjetoPlano(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
}

function clavesExactas(o: Record<string, unknown>, claves: readonly string[]): boolean {
  const propias = Object.keys(o);
  return propias.length === claves.length && claves.every((c) => propias.includes(c));
}

/** Valida el cuerpo de un mensaje contra el esquema. null si no cumple (claves de más o de menos, tipos, versión). */
export function parsearMensaje(data: unknown): Mensaje | null {
  if (!esObjetoPlano(data) || data.v !== VERSION_PROTOCOLO || typeof data.tipo !== "string") return null;
  switch (data.tipo) {
    case "pfg:listo":
    case "pfg:token-requerido":
    case "erp:salir":
      return clavesExactas(data, ["tipo", "v"]) ? { tipo: data.tipo, v: 1 } : null;
    case "erp:token": {
      const { token } = data;
      if (!clavesExactas(data, ["tipo", "v", "token"])) return null;
      if (typeof token !== "string" || token.length === 0 || token.length > TOKEN_MAX_LARGO) return null;
      if (/\s/.test(token)) return null;
      return { tipo: "erp:token", v: 1, token };
    }
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

/**
 * Decide si el iframe acepta un mensaje del ERP. `padre` es `window.parent`; `origenes`, la lista de
 * `ERP_FRONT_ORIGENES` ya validada. Solo acepta `erp:*`.
 */
export function aceptarMensajeDelErp(
  evento: EventoMensaje,
  contexto: { origenes: readonly string[]; padre: unknown },
): Resultado<MensajeErp> {
  if (!contexto.origenes.includes(evento.origin)) return { ok: false, motivo: "origen-no-permitido" };
  if (contexto.padre === null || contexto.padre === undefined || evento.source !== contexto.padre) {
    return { ok: false, motivo: "fuente-no-es-el-padre" };
  }
  const mensaje = parsearMensaje(evento.data);
  if (!mensaje) return { ok: false, motivo: "esquema-invalido" };
  if (mensaje.tipo !== "erp:token" && mensaje.tipo !== "erp:salir") return { ok: false, motivo: "tipo-no-esperado" };
  return { ok: true, mensaje };
}

/**
 * Lo mismo del lado del ERP (lo usa el anfitrión simulado, IE-13): acepta solo `pfg:*`, del origen de este sistema
 * y de la ventana del iframe.
 */
export function aceptarMensajeDelPfg(
  evento: EventoMensaje,
  contexto: { origenPfg: string; iframe: unknown },
): Resultado<MensajePfg> {
  if (evento.origin !== contexto.origenPfg) return { ok: false, motivo: "origen-no-permitido" };
  if (contexto.iframe === null || contexto.iframe === undefined || evento.source !== contexto.iframe) {
    return { ok: false, motivo: "fuente-no-es-el-padre" };
  }
  const mensaje = parsearMensaje(evento.data);
  if (!mensaje) return { ok: false, motivo: "esquema-invalido" };
  if (mensaje.tipo !== "pfg:listo" && mensaje.tipo !== "pfg:token-requerido") return { ok: false, motivo: "tipo-no-esperado" };
  return { ok: true, mensaje };
}

/**
 * Origen del padre a partir del `document.referrer`, solo si está en la lista. null si no hay referrer, si no se
 * puede leer o si su origen no está permitido (la pantalla muestra «Abrí esta pantalla desde el ERP»).
 */
export function origenDelPadre(referrer: string, origenes: readonly string[]): string | null {
  if (!referrer) return null;
  let origen: string;
  try {
    origen = new URL(referrer).origin;
  } catch {
    return null;
  }
  return origenes.includes(origen) ? origen : null;
}

/** Lo mínimo de una ventana para mandarle un mensaje. */
export interface Destino {
  postMessage(mensaje: unknown, targetOrigin: string): void;
}

export class TargetOriginInvalidoError extends Error {
  constructor() {
    super('El targetOrigin tiene que ser un origen de la lista, nunca "*".');
    this.name = "TargetOriginInvalidoError";
  }
}

/**
 * Único punto por el que este sistema manda mensajes al ERP. Lanza si el origen no es uno de la lista
 * (en particular "*"): un mensaje nunca sale sin destino explícito.
 */
export function enviarAlErp(destino: Destino, mensaje: MensajePfg, origen: string, origenes: readonly string[]): void {
  if (origen === "*" || !origenes.includes(origen)) throw new TargetOriginInvalidoError();
  destino.postMessage(mensaje, origen);
}

/** Texto fijo que se registra al descartar un mensaje: el motivo y nada del cuerpo ni del origen. */
export function textoDescarte(motivo: MotivoDescarte): string {
  return `pfg:mensaje-descartado ${motivo}`;
}
