// IE-5: renovación del token por el padre, del lado del iframe. Funciones puras (sin window ni fetch): el marco
// embebido (src/components/embebido/) les pasa cómo pedir el token, cómo renovar y cómo revocar.
//
//   - se pide `pfg:token-requerido` y se espera `erp:token` hasta 10 s;
//   - con el token se llama a /api/embebido/sesion/renovar;
//   - si algo falla o no llega a tiempo, se revoca la sesión y se muestra «Volvé a abrir desde el ERP»;
//   - la lectura se reintenta una sola vez después de renovar.

export const ESPERA_TOKEN_MS = 10_000;

export class SinRespuestaDelErpError extends Error {
  constructor() {
    super("El ERP no mandó el token a tiempo.");
    this.name = "SinRespuestaDelErpError";
  }
}

/** Reloj inyectable (las pruebas usan los temporizadores falsos de vitest). */
export interface Reloj {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const relojReal: Reloj = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Manda el pedido y espera el primer token que llegue. `suscribir` registra un oyente y devuelve cómo quitarlo.
 * Rechaza con `SinRespuestaDelErpError` si pasan `ms` sin respuesta.
 */
export function esperarToken(
  pedir: () => void,
  suscribir: (alRecibir: (token: string) => void) => () => void,
  ms: number = ESPERA_TOKEN_MS,
  reloj: Reloj = relojReal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let quitar: () => void = () => {};
    const id = reloj.setTimeout(() => {
      quitar();
      reject(new SinRespuestaDelErpError());
    }, ms);
    quitar = suscribir((token) => {
      reloj.clearTimeout(id);
      quitar();
      resolve(token);
    });
    try {
      pedir();
    } catch (error) {
      reloj.clearTimeout(id);
      quitar();
      reject(error);
    }
  });
}

export interface PasosRenovacion {
  /** Pide `pfg:token-requerido` y espera `erp:token` (con `esperarToken`). */
  pedirToken(): Promise<string>;
  /** POST /api/embebido/sesion/renovar. true si el servidor aceptó. */
  renovar(token: string): Promise<boolean>;
  /** POST /api/embebido/sesion/revocar. */
  revocar(motivo: string): Promise<void>;
}

export type ResultadoRenovacion = "renovada" | "fallida";

/** Un intento de renovación. Si falla por cualquier motivo, revoca la sesión. */
export async function renovarPorElPadre(pasos: PasosRenovacion): Promise<ResultadoRenovacion> {
  let motivo = "renovacion-rechazada";
  try {
    const token = await pasos.pedirToken();
    if (await pasos.renovar(token)) return "renovada";
  } catch (error) {
    motivo = error instanceof SinRespuestaDelErpError ? "sin-respuesta-del-erp" : "renovacion-fallida";
  }
  await pasos.revocar(motivo).catch(() => {});
  return "fallida";
}

/**
 * Carga algo que puede responder «token vencido»; si pasa, renueva y vuelve a cargar **una sola vez**. Si después
 * de renovar sigue vencido, revoca. Devuelve lo cargado o "fallida".
 */
export async function conUnaRenovacion<T>(
  cargar: () => Promise<T | "token-vencido">,
  pasos: PasosRenovacion,
): Promise<T | "fallida"> {
  const primero = await cargar();
  if (primero !== "token-vencido") return primero;
  if ((await renovarPorElPadre(pasos)) === "fallida") return "fallida";
  const segundo = await cargar();
  if (segundo !== "token-vencido") return segundo;
  await pasos.revocar("sigue-vencido").catch(() => {});
  return "fallida";
}
