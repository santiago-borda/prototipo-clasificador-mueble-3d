// IE-10, IE-11, IE-12: configuración del embebido desde el entorno. Solo servidor. Los valores nunca se imprimen.
//   ERP_FRONT_ORIGENES   orígenes del frontend del ERP que pueden embeber /embebido/* (vacía = embebido apagado).
//   SESION_CLAVE         32 bytes en base64 para cifrar el token del ERP (AES-256-GCM). Obligatoria con
//                        NODE_ENV=production si el embebido está encendido. En desarrollo, si falta, se usa una
//                        clave al azar por proceso (las sesiones no sobreviven a un reinicio) y se avisa una vez.
//   SESION_DURACION_MIN  vida de la sesión propia, en minutos (por defecto 480 = 8 h; ASUMIDO).

import { randomBytes } from "node:crypto";
import { origenesDelEntorno } from "@/lib/embebido/origenes";
import { leerConfigErp, leerModoErp } from "@/server/erp/config";
import { ConfiguracionErpInvalida } from "@/server/erp/errores";
import { leerClave } from "./cripto";

type Env = Record<string, string | undefined>;

export interface ConfigEmbebido {
  origenes: string[];
  clave: Buffer;
  duracionSesionMs: number;
}

const SLOT = Symbol.for("pfg.embebido.claveEfimera");
type Slot = { [SLOT]?: Buffer };

function claveDe(env: Env): Buffer {
  const raw = env.SESION_CLAVE;
  if (raw) return leerClave(raw);
  if (env.NODE_ENV === "production") throw new ConfiguracionErpInvalida("SESION_CLAVE", "falta");
  const slot = globalThis as Slot;
  if (!slot[SLOT]) {
    slot[SLOT] = randomBytes(32);
    console.warn("pfg:embebido SESION_CLAVE sin definir: se usa una clave al azar de este proceso (solo desarrollo).");
  }
  return slot[SLOT];
}

export function leerConfigEmbebido(env: Env = process.env): ConfigEmbebido {
  const minutos = env.SESION_DURACION_MIN ? Number(env.SESION_DURACION_MIN) : 480;
  if (!Number.isInteger(minutos) || minutos <= 0 || minutos > 24 * 60) {
    throw new ConfiguracionErpInvalida("SESION_DURACION_MIN", "tiene que ser un entero entre 1 y 1440");
  }
  return { origenes: origenesDelEntorno(env), clave: claveDe(env), duracionSesionMs: minutos * 60 * 1000 };
}

/**
 * Lo que se valida al arrancar el servidor (src/instrumentation.ts). Siempre: ERP_MODO (IE-12) y la lista de
 * orígenes (IE-10). Si el embebido está encendido, además la configuración del ERP y la de la sesión.
 */
export function validarConfiguracionAlArrancar(env: Env = process.env): { embebido: boolean } {
  leerModoErp(env);
  const origenes = origenesDelEntorno(env);
  if (origenes.length === 0) return { embebido: false };
  leerConfigErp(env);
  leerConfigEmbebido(env);
  return { embebido: true };
}
