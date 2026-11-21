// S2B PB-1 a PB-3 (docs/spec-s2b-base-remota-neon.md): guarda de la base remota de la demo. Pura, sin red ni base.

import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "@/persistence/localGuard";
import { BaseNoLocalError, BaseRemotaNoConfirmadaError } from "@/persistence/ports";
import { assertConfirmedRemoteDatabase } from "@/persistence/remoteGuard";

const HOST = "ep-ejemplo-123456-pooler.sa-east-1.aws.neon.tech";
const URL_OK = `postgresql://usuario:secreto@${HOST}/neondb?sslmode=require&channel_binding=require`;

const motivo = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof BaseRemotaNoConfirmadaError) return e.motivo;
    throw e;
  }
  return "aceptada";
};

describe("S2B PB-1: assertConfirmedRemoteDatabase", () => {
  it("acepta una base remota con TLS y el host confirmado exacto (sin distinguir mayúsculas ni espacios)", () => {
    expect(assertConfirmedRemoteDatabase(URL_OK, HOST)).toEqual({ host: HOST });
    expect(assertConfirmedRemoteDatabase(URL_OK, ` ${HOST.toUpperCase()} `)).toEqual({ host: HOST });
    for (const modo of ["verify-ca", "verify-full"]) {
      expect(motivo(() => assertConfirmedRemoteDatabase(URL_OK.replace("sslmode=require", `sslmode=${modo}`), HOST))).toBe("aceptada");
    }
  });

  it.each([
    ["URL ilegible", "no es una url", HOST, "url-ilegible"],
    ["base local", "postgres://pfg:clave@127.0.0.1:5432/pfg?sslmode=require", "127.0.0.1", "es-local"],
    ["localhost", "postgres://pfg:clave@localhost/pfg?sslmode=require", "localhost", "es-local"],
    ["sin confirmar", URL_OK, undefined, "sin-confirmar"],
    ["confirmación vacía", URL_OK, "  ", "sin-confirmar"],
    ["otro host", URL_OK, "ep-otro.neon.tech", "host-distinto"],
    ["host parecido", URL_OK, HOST.replace("-pooler", ""), "host-distinto"],
    ["sin sslmode", URL_OK.replace("?sslmode=require&", "?"), HOST, "sin-tls"],
    ["sslmode=prefer", URL_OK.replace("sslmode=require", "sslmode=prefer"), HOST, "sin-tls"],
    ["sslmode=disable", URL_OK.replace("sslmode=require", "sslmode=disable"), HOST, "sin-tls"],
  ] as const)("%s → %s", (_caso, url, confirmado, esperado) => {
    expect(motivo(() => assertConfirmedRemoteDatabase(url, confirmado))).toBe(esperado);
  });
});

describe("S2B PB-2: los errores nunca llevan la URL (trae la clave)", () => {
  it("ni usuario ni clave en el mensaje", () => {
    for (const confirmado of [undefined, "otro.neon.tech", HOST]) {
      const url = confirmado === HOST ? URL_OK.replace("sslmode=require", "sslmode=disable") : URL_OK;
      try {
        assertConfirmedRemoteDatabase(url, confirmado);
        throw new Error("no lanzó");
      } catch (e) {
        expect(e).toBeInstanceOf(BaseRemotaNoConfirmadaError);
        expect((e as Error).message).not.toMatch(/usuario|secreto/);
        expect((e as Error).message).toContain(HOST);
      }
    }
  });
});

describe("S2B PB-3: la guarda local no cambia (PB-14 de S2)", () => {
  it("db:migrate y db:seed siguen rechazando la base remota, aunque esté confirmada", () => {
    expect(() => assertLocalDatabase(URL_OK)).toThrow(BaseNoLocalError);
  });
});
