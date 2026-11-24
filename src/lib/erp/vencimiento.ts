// IE-4 / TIE-9: vencimiento de la sesión del iframe. El ERP empuja cada renovación (`erp:token`); este sistema no
// pide token (el contrato no tiene ese mensaje). Si pasa `vence` + 60 s sin un `erp:token` nuevo, la sesión se da
// por vencida y la pantalla dice «La sesión venció. Volvé a abrir desde el ERP». Los 60 s son ASUMIDOS (spec v0.3).
// El servidor usa la misma gracia para aceptar la cookie (src/server/integracion/sesion.ts).

import { temporizadorDelNavegador, type Temporizador } from "./alto";

export const GRACIA_VENCIMIENTO_MS = 60_000;

/** Instante (ms) en que la sesión se da por vencida si no llega otro token. `vence` en segundos epoch. */
export function venceConGracia(venceSegundos: number): number {
  return venceSegundos * 1000 + GRACIA_VENCIMIENTO_MS;
}

export function sesionVencida(venceSegundos: number, ahoraMs: number): boolean {
  return ahoraMs >= venceConGracia(venceSegundos);
}

export interface VigiaDeVencimiento {
  /** Un `vence` nuevo (de `erp:sesion` o de un `erp:token` aceptado por el servidor). Reemplaza al anterior. */
  actualizar(venceSegundos: number): void;
  cancelar(): void;
}

export function crearVigiaDeVencimiento(alVencer: () => void, t: Temporizador = temporizadorDelNavegador): VigiaDeVencimiento {
  let cancelar: (() => void) | null = null;
  let vencida = false;
  return {
    actualizar(venceSegundos) {
      if (vencida) return;
      cancelar?.();
      const espera = venceConGracia(venceSegundos) - t.ahora();
      const disparar = () => {
        cancelar = null;
        vencida = true;
        alVencer();
      };
      if (espera <= 0) disparar();
      else cancelar = t.programar(disparar, espera);
    },
    cancelar() {
      cancelar?.();
      cancelar = null;
    },
  };
}
