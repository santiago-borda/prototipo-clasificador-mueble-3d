// TIE-6 y TIE-8 (docs/spec-integracion-erp-minima.md §7), del lado del iframe (IE-5). La parte del servidor de
// TIE-6 y TIE-7 está en servidor.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { conUnaRenovacion, ESPERA_TOKEN_MS, esperarToken, renovarPorElPadre, SinRespuestaDelErpError, type PasosRenovacion } from "@/lib/embebido/renovacion";

afterEach(() => {
  vi.useRealTimers();
});

/** Un "padre" de prueba: guarda los oyentes y permite responder a mano. */
function padreFalso() {
  const oyentes = new Set<(t: string) => void>();
  return {
    pedidos: 0,
    suscribir(fn: (t: string) => void) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    responder(token: string) {
      for (const fn of [...oyentes]) fn(token);
    },
    get oyentes() {
      return oyentes.size;
    },
  };
}

describe("TIE-6: token vencido → renovación por el padre y reintento, una sola vez", () => {
  it("vencido, renueva, vuelve a cargar y sale bien", async () => {
    const cargar = vi.fn<() => Promise<string>>().mockResolvedValueOnce("token-vencido").mockResolvedValueOnce("modelo");
    const pasos: PasosRenovacion = { pedirToken: vi.fn(async () => "nuevo"), renovar: vi.fn(async () => true), revocar: vi.fn(async () => {}) };
    expect(await conUnaRenovacion(cargar, pasos)).toBe("modelo");
    expect(cargar).toHaveBeenCalledTimes(2);
    expect(pasos.pedirToken).toHaveBeenCalledTimes(1);
    expect(pasos.renovar).toHaveBeenCalledWith("nuevo");
    expect(pasos.revocar).not.toHaveBeenCalled();
  });

  it("si después de renovar sigue vencido, no hay un segundo intento: revoca", async () => {
    const cargar = vi.fn(async () => "token-vencido" as const);
    const pasos: PasosRenovacion = { pedirToken: vi.fn(async () => "nuevo"), renovar: vi.fn(async () => true), revocar: vi.fn(async () => {}) };
    expect(await conUnaRenovacion(cargar, pasos)).toBe("fallida");
    expect(cargar).toHaveBeenCalledTimes(2);
    expect(pasos.pedirToken).toHaveBeenCalledTimes(1);
    expect(pasos.revocar).toHaveBeenCalledWith("sigue-vencido");
  });

  it("si la carga sale bien de entrada, no se pide token", async () => {
    const pasos: PasosRenovacion = { pedirToken: vi.fn(), renovar: vi.fn(), revocar: vi.fn() };
    expect(await conUnaRenovacion(async () => 42, pasos)).toBe(42);
    expect(pasos.pedirToken).not.toHaveBeenCalled();
  });

  it("el servidor rechaza la renovación (p. ej. otro usuario, TIE-7): revoca y falla", async () => {
    const pasos: PasosRenovacion = { pedirToken: async () => "ajeno", renovar: vi.fn(async () => false), revocar: vi.fn(async () => {}) };
    expect(await renovarPorElPadre(pasos)).toBe("fallida");
    expect(pasos.revocar).toHaveBeenCalledWith("renovacion-rechazada");
  });

  it("esperarToken: resuelve con el primer token y quita el oyente", async () => {
    const padre = padreFalso();
    const pedir = vi.fn(() => queueMicrotask(() => padre.responder("tok")));
    expect(await esperarToken(pedir, (fn) => padre.suscribir(fn))).toBe("tok");
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(padre.oyentes).toBe(0);
  });
});

describe("TIE-8: el padre no responde en 10 s", () => {
  it("esperarToken rechaza con SinRespuestaDelErpError a los 10 s, no antes", async () => {
    vi.useFakeTimers();
    const padre = padreFalso();
    const espera = esperarToken(() => {}, (fn) => padre.suscribir(fn));
    const resultado = espera.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(ESPERA_TOKEN_MS - 1);
    expect(padre.oyentes).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await resultado).toBeInstanceOf(SinRespuestaDelErpError);
    expect(padre.oyentes).toBe(0);
    // Un token que llega tarde no hace nada.
    padre.responder("tarde");
  });

  it("renovación sin respuesta: se revoca la sesión con motivo sin-respuesta-del-erp y la carga falla", async () => {
    vi.useFakeTimers();
    const padre = padreFalso();
    const pasos: PasosRenovacion = {
      pedirToken: () => esperarToken(() => {}, (fn) => padre.suscribir(fn)),
      renovar: vi.fn(async () => true),
      revocar: vi.fn(async () => {}),
    };
    const cargar = vi.fn(async () => "token-vencido" as const);
    const resultado = conUnaRenovacion(cargar, pasos);
    await vi.advanceTimersByTimeAsync(ESPERA_TOKEN_MS);
    expect(await resultado).toBe("fallida");
    expect(pasos.revocar).toHaveBeenCalledWith("sin-respuesta-del-erp");
    expect(pasos.renovar).not.toHaveBeenCalled();
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it("si pedir lanza (p. ej. sin origen del padre), rechaza enseguida y quita el oyente", async () => {
    const padre = padreFalso();
    await expect(esperarToken(() => { throw new Error("sin padre"); }, (fn) => padre.suscribir(fn))).rejects.toThrow("sin padre");
    expect(padre.oyentes).toBe(0);
  });
});
