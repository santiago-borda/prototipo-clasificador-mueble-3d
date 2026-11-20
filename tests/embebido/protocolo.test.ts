// TIE-1 y TIE-2 (docs/spec-integracion-erp-minima.md §7): protocolo de mensajes del iframe (IE-2).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  aceptarMensajeDelErp,
  aceptarMensajeDelPfg,
  enviarAlErp,
  origenDelPadre,
  parsearMensaje,
  TargetOriginInvalidoError,
  textoDescarte,
  TOKEN_MAX_LARGO,
} from "@/lib/embebido/protocolo";

const ERP = "https://erp-qa.casamueble.com.ar";
const ORIGENES = [ERP, "http://localhost:4010"];
const padre = { nombre: "window.parent" };
const otraVentana = { nombre: "otra" };
const token = { tipo: "erp:token", v: 1, token: "eyJhbGciOi.payload.firma" };

describe("TIE-1: mensajes que se descartan", () => {
  it("acepta erp:token y erp:salir del padre, con origen de la lista y esquema válido", () => {
    expect(aceptarMensajeDelErp({ origin: ERP, source: padre, data: token }, { origenes: ORIGENES, padre })).toEqual({ ok: true, mensaje: token });
    expect(aceptarMensajeDelErp({ origin: ERP, source: padre, data: { tipo: "erp:salir", v: 1 } }, { origenes: ORIGENES, padre })).toEqual({
      ok: true,
      mensaje: { tipo: "erp:salir", v: 1 },
    });
  });

  it.each([
    ["origen fuera de la lista", "https://evil.example", "origen-no-permitido"],
    ["subdominio parecido", "https://erp-qa.casamueble.com.ar.evil.example", "origen-no-permitido"],
    ["mismo host con otro esquema", "http://erp-qa.casamueble.com.ar", "origen-no-permitido"],
    ["con barra final", `${ERP}/`, "origen-no-permitido"],
    ["origen null (sandbox o file:)", "null", "origen-no-permitido"],
  ])("%s", (_caso, origin, motivo) => {
    expect(aceptarMensajeDelErp({ origin, source: padre, data: token }, { origenes: ORIGENES, padre })).toEqual({ ok: false, motivo });
  });

  it("source distinto del padre (otra ventana, null, o sin padre)", () => {
    expect(aceptarMensajeDelErp({ origin: ERP, source: otraVentana, data: token }, { origenes: ORIGENES, padre })).toEqual({
      ok: false,
      motivo: "fuente-no-es-el-padre",
    });
    expect(aceptarMensajeDelErp({ origin: ERP, source: null, data: token }, { origenes: ORIGENES, padre: null })).toEqual({
      ok: false,
      motivo: "fuente-no-es-el-padre",
    });
  });

  it.each([
    ["no es objeto", "erp:token"],
    ["null", null],
    ["array", [token]],
    ["sin versión", { tipo: "erp:token", token: "abc" }],
    ["versión 2", { ...token, v: 2 }],
    ["versión como texto", { ...token, v: "1" }],
    ["tipo desconocido", { tipo: "erp:otra-cosa", v: 1 }],
    ["token vacío", { ...token, token: "" }],
    ["token no texto", { ...token, token: 123 }],
    ["token con espacios", { ...token, token: "a b" }],
    ["token demasiado largo", { ...token, token: "a".repeat(TOKEN_MAX_LARGO + 1) }],
    ["clave de más", { ...token, extra: true }],
    ["erp:salir con token", { tipo: "erp:salir", v: 1, token: "x" }],
    ["objeto con prototipo propio", Object.assign(Object.create({ heredado: 1 }), token)],
  ])("esquema inválido: %s", (_caso, data) => {
    expect(aceptarMensajeDelErp({ origin: ERP, source: padre, data }, { origenes: ORIGENES, padre })).toEqual({ ok: false, motivo: "esquema-invalido" });
  });

  it("un pfg:* que llega al iframe no se acepta (solo erp:*)", () => {
    expect(aceptarMensajeDelErp({ origin: ERP, source: padre, data: { tipo: "pfg:listo", v: 1 } }, { origenes: ORIGENES, padre })).toEqual({
      ok: false,
      motivo: "tipo-no-esperado",
    });
  });

  it("del lado del anfitrión: solo pfg:* del origen del sistema y de la ventana del iframe", () => {
    const iframe = { nombre: "iframe" };
    const ctx = { origenPfg: "http://localhost:3000", iframe };
    expect(aceptarMensajeDelPfg({ origin: "http://localhost:3000", source: iframe, data: { tipo: "pfg:listo", v: 1 } }, ctx).ok).toBe(true);
    expect(aceptarMensajeDelPfg({ origin: "http://localhost:3001", source: iframe, data: { tipo: "pfg:listo", v: 1 } }, ctx).ok).toBe(false);
    expect(aceptarMensajeDelPfg({ origin: "http://localhost:3000", source: padre, data: { tipo: "pfg:listo", v: 1 } }, ctx).ok).toBe(false);
    expect(aceptarMensajeDelPfg({ origin: "http://localhost:3000", source: iframe, data: token }, ctx).ok).toBe(false);
  });

  it("el texto que se registra al descartar no lleva el cuerpo ni el origen", () => {
    const resultado = aceptarMensajeDelErp({ origin: "https://evil.example", source: padre, data: token }, { origenes: ORIGENES, padre });
    if (resultado.ok) throw new Error("no debía aceptarse");
    const texto = textoDescarte(resultado.motivo);
    expect(texto).toBe("pfg:mensaje-descartado origen-no-permitido");
    expect(texto).not.toContain(token.token);
    expect(texto).not.toContain("evil");
  });

  it("origen del padre por el referrer: solo si está en la lista", () => {
    expect(origenDelPadre(`${ERP}/proyectos/P-0002?tab=3`, ORIGENES)).toBe(ERP);
    expect(origenDelPadre("http://localhost:4010/anfitrion?proyecto=P-0002", ORIGENES)).toBe("http://localhost:4010");
    expect(origenDelPadre("https://evil.example/", ORIGENES)).toBeNull();
    expect(origenDelPadre("", ORIGENES)).toBeNull();
    expect(origenDelPadre("no es una url", ORIGENES)).toBeNull();
    expect(origenDelPadre(`${ERP}/x`, [])).toBeNull();
  });

  it("parsearMensaje normaliza: devuelve un objeto nuevo, sin referencias al recibido", () => {
    const recibido = { ...token };
    const parsed = parsearMensaje(recibido);
    expect(parsed).toEqual(token);
    expect(parsed).not.toBe(recibido);
  });
});

describe("TIE-2: los envíos nunca usan \"*\"", () => {
  it("enviarAlErp usa el origen explícito y lanza con \"*\" o con un origen fuera de la lista", () => {
    const destino = { postMessage: vi.fn() };
    enviarAlErp(destino, { tipo: "pfg:listo", v: 1 }, ERP, ORIGENES);
    expect(destino.postMessage).toHaveBeenCalledWith({ tipo: "pfg:listo", v: 1 }, ERP);
    expect(() => enviarAlErp(destino, { tipo: "pfg:listo", v: 1 }, "*", ORIGENES)).toThrow(TargetOriginInvalidoError);
    expect(() => enviarAlErp(destino, { tipo: "pfg:listo", v: 1 }, "*", ["*"])).toThrow(TargetOriginInvalidoError);
    expect(() => enviarAlErp(destino, { tipo: "pfg:token-requerido", v: 1 }, "https://evil.example", ORIGENES)).toThrow(TargetOriginInvalidoError);
    expect(destino.postMessage).toHaveBeenCalledTimes(1);
  });

  it('en el código, ningún postMessage usa "*" y en src/ solo protocolo.ts llama a postMessage', () => {
    const raiz = path.resolve(__dirname, "..", "..");
    const archivos = ["src", "erp-simulado"].flatMap((dir) =>
      readdirSync(path.join(raiz, dir), { recursive: true, encoding: "utf8" })
        .filter((f) => /\.(ts|tsx|js|mjs|html)$/.test(f))
        .map((f) => ({ nombre: `${dir}/${f.replaceAll("\\", "/")}`, src: readFileSync(path.join(raiz, dir, f), "utf8") })),
    );
    const conAsterisco = archivos.filter((a) => /postMessage\([^)]*["'`]\*["'`]/.test(a.src)).map((a) => a.nombre);
    expect(conAsterisco).toEqual([]);
    const llamanEnSrc = archivos.filter((a) => a.nombre.startsWith("src/") && /\.postMessage\(/.test(a.src)).map((a) => a.nombre);
    expect(llamanEnSrc).toEqual(["src/lib/embebido/protocolo.ts"]);
    // El anfitrión simulado manda mensajes, y siempre con su constante de origen.
    const anfitrion = archivos.filter((a) => a.nombre.startsWith("erp-simulado/") && /\.postMessage\(/.test(a.src));
    expect(anfitrion.length).toBeGreaterThan(0);
    for (const a of anfitrion) {
      for (const m of a.src.matchAll(/\.postMessage\(([^;]*)\)/g)) expect(m[1], a.nombre).toMatch(/ORIGEN_PFG\s*$/);
    }
  });
});
