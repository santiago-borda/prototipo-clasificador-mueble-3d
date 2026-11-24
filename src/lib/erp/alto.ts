// IE-3 / TIE-10: `ucp:alto`, el alto del contenido en px para que el ERP ajuste el iframe. Como máximo un envío
// cada 200 ms: el primer cambio sale enseguida y los que llegan dentro de la ventana se juntan en uno solo, al final,
// con el último valor. Un alto igual al último enviado no se manda. Puro: el reloj y el temporizador se inyectan.

export const ALTO_INTERVALO_MS = 200;

export interface Temporizador {
  ahora(): number;
  programar(fn: () => void, ms: number): () => void;
}

export const temporizadorDelNavegador: Temporizador = {
  ahora: () => Date.now(),
  programar: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

export interface EmisorDeAlto {
  /** Un alto medido (p. ej. por un ResizeObserver). Se redondea hacia arriba. */
  medir(alto: number): void;
  cancelar(): void;
}

export function crearEmisorDeAlto(enviar: (alto: number) => void, t: Temporizador = temporizadorDelNavegador, intervaloMs = ALTO_INTERVALO_MS): EmisorDeAlto {
  let ultimoEnviado: number | null = null;
  let ultimoEnvio = -Infinity;
  let pendiente: number | null = null;
  let cancelarProgramado: (() => void) | null = null;

  const emitir = (alto: number) => {
    ultimoEnviado = alto;
    ultimoEnvio = t.ahora();
    enviar(alto);
  };

  return {
    medir(medido) {
      if (!Number.isFinite(medido) || medido < 0) return;
      const alto = Math.ceil(medido);
      if (cancelarProgramado) {
        pendiente = alto;
        return;
      }
      if (alto === ultimoEnviado) return;
      const espera = ultimoEnvio + intervaloMs - t.ahora();
      if (espera <= 0) {
        emitir(alto);
        return;
      }
      pendiente = alto;
      cancelarProgramado = t.programar(() => {
        cancelarProgramado = null;
        const valor = pendiente;
        pendiente = null;
        if (valor !== null && valor !== ultimoEnviado) emitir(valor);
      }, espera);
    },
    cancelar() {
      cancelarProgramado?.();
      cancelarProgramado = null;
      pendiente = null;
    },
  };
}
