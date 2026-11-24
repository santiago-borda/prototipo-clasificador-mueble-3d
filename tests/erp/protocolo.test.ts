// TIE-4, TIE-5, TIE-6 (lado del iframe), TIE-9 y TIE-10 (docs/spec-integracion-erp-minima.md v0.3 §6): protocolo de
// mensajes del contrato UCP v1 §5 (IE-3), vencimiento (IE-4) y `ucp:alto`. Funciones puras, sin navegador.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { crearEmisorDeAlto, type Temporizador } from "@/lib/erp/alto";
import {
  aceptarMensajeDelErp,
  aceptarMensajeDelUcp,
  enviarAlErp,
  parsearMensajeDelErp,
  sesionEsDeLaRuta,
  TargetOriginInvalidoError,
  textoDescarte,
  TOKEN_MAX_LARGO,
  type MensajeErp,
} from "@/lib/erp/protocolo";
import { crearVigiaDeVencimiento, GRACIA_VENCIMIENTO_MS, sesionVencida } from "@/lib/erp/vencimiento";

const ERP = "https://erp-qa.casamueble.com.ar";
const padre = { nombre: "window.parent" };
const JWT = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.firma_base64-url";
const VENCE = 1_795_000_000;
const PROYECTO = { uuid: "5e1a0000-0000-4000-8000-000000000142", codigo: "P-0142", nombre: "Cocina integral" };
const sesion = { tipo: "erp:sesion", version: 1, accessToken: JWT, vence: VENCE, tenantId: "A1C0E001-0000-4000-8000-000000000002", proyecto: PROYECTO, tema: "oscuro" };
const token = { tipo: "erp:token", version: 1, accessToken: JWT, vence: VENCE };

const aceptar = (data: unknown, origin = ERP, source: unknown = padre) => aceptarMensajeDelErp({ origin, source, data }, { origen: ERP, padre });

describe("IE-3: mensajes válidos del ERP", () => {
  it("erp:sesion y erp:token del padre, con ERP_WEB_ORIGEN y esquema válido; el tenantId queda en minúsculas", () => {
    expect(aceptar(sesion)).toEqual({ ok: true, mensaje: { ...sesion, tenantId: sesion.tenantId.toLowerCase() } });
    expect(aceptar(token)).toEqual({ ok: true, mensaje: token });
  });

  it("lector tolerante (ASUMIDO): las claves de más se ignoran y no pasan; sin tema, claro", () => {
    const r = aceptar({ ...sesion, tema: undefined, extra: "x", proyecto: { ...PROYECTO, cliente: "Familia Gómez" } });
    expect(r.ok && r.mensaje).toEqual({ ...sesion, tenantId: sesion.tenantId.toLowerCase(), tema: "claro" });
    expect(JSON.stringify(r)).not.toContain("Gómez");
  });
});

describe("TIE-4: mensajes descartados", () => {
  it.each([
    ["origen ajeno", "https://evil.example", "origen-no-permitido"],
    ["subdominio parecido", "https://erp-qa.casamueble.com.ar.evil.example", "origen-no-permitido"],
    ["mismo host con http", "http://erp-qa.casamueble.com.ar", "origen-no-permitido"],
    ["con barra final", `${ERP}/`, "origen-no-permitido"],
    ["origen null (sandbox o file:)", "null", "origen-no-permitido"],
  ])("%s", (_caso, origin, motivo) => {
    expect(aceptar(sesion, origin)).toEqual({ ok: false, motivo });
  });

  it("source distinto del padre (otra ventana, null, o sin padre)", () => {
    expect(aceptar(sesion, ERP, { nombre: "otra" })).toEqual({ ok: false, motivo: "fuente-no-es-el-padre" });
    expect(aceptar(sesion, ERP, null)).toEqual({ ok: false, motivo: "fuente-no-es-el-padre" });
    expect(aceptarMensajeDelErp({ origin: ERP, source: padre, data: sesion }, { origen: ERP, padre: null })).toEqual({ ok: false, motivo: "fuente-no-es-el-padre" });
  });

  it.each([
    ["versión 2", { ...sesion, version: 2 }],
    ["sin versión", { ...sesion, version: undefined }],
    ["con `v` en vez de `version` (v0.2)", { ...token, version: undefined, v: 1 }],
    ["token vacío", { ...token, accessToken: "" }],
    ["token que no es un JWT", { ...token, accessToken: "abc" }],
    ["token con espacios", { ...token, accessToken: "a.b c.d" }],
    ["token demasiado largo", { ...token, accessToken: `${"a".repeat(TOKEN_MAX_LARGO)}.b.c` }],
    ["vence en milisegundos", { ...token, vence: VENCE * 1000 }],
    ["vence como texto", { ...token, vence: String(VENCE) }],
    ["tenantId que no es UUID", { ...sesion, tenantId: "t-casa-mueble" }],
    ["proyecto sin uuid", { ...sesion, proyecto: { codigo: "P-1", nombre: "x" } }],
    ["proyecto sin nombre", { ...sesion, proyecto: { ...PROYECTO, nombre: " " } }],
    ["tema desconocido", { ...sesion, tema: "azul" }],
    ["array", [sesion]],
    ["texto", JSON.stringify(sesion)],
    ["clase (no objeto plano)", Object.assign(Object.create({ heredado: 1 }), sesion)],
  ])("esquema inválido: %s", (_caso, data) => {
    expect(aceptar(data)).toEqual({ ok: false, motivo: "esquema-invalido" });
  });

  it("tipos que no son del ERP (los del propio iframe, los de la v0.2 o desconocidos)", () => {
    for (const tipo of ["ucp:listo", "ucp:alto", "pfg:token-requerido", "erp:salir-x", undefined]) {
      const r = aceptar({ tipo, version: 1 });
      expect(r.ok).toBe(false);
    }
    expect(aceptar({ tipo: "ucp:listo", version: 1 })).toEqual({ ok: false, motivo: "tipo-no-esperado" });
    expect(aceptar({ tipo: "erp:salir", version: 1 })).toEqual({ ok: false, motivo: "esquema-invalido" });
  });

  it("lo registrado al descartar es solo el motivo", () => {
    expect(textoDescarte("origen-no-permitido")).toBe("ucp:mensaje-descartado origen-no-permitido");
  });

  it("del lado del ERP (anfitrión simulado): solo ucp:* del iframe y del origen de UCP", () => {
    const iframe = { nombre: "iframe" };
    const ctx = { origenUcp: "http://localhost:3000", iframe };
    expect(aceptarMensajeDelUcp({ origin: "http://localhost:3000", source: iframe, data: { tipo: "ucp:alto", version: 1, alto: 812 } }, ctx)).toEqual({
      ok: true,
      mensaje: { tipo: "ucp:alto", version: 1, alto: 812 },
    });
    expect(aceptarMensajeDelUcp({ origin: "http://localhost:3001", source: iframe, data: { tipo: "ucp:listo", version: 1 } }, ctx).ok).toBe(false);
    expect(aceptarMensajeDelUcp({ origin: "http://localhost:3000", source: {}, data: { tipo: "ucp:listo", version: 1 } }, ctx).ok).toBe(false);
    expect(aceptarMensajeDelUcp({ origin: "http://localhost:3000", source: iframe, data: { tipo: "ucp:alto", version: 1, alto: 1.5 } }, ctx).ok).toBe(false);
  });
});

describe("TIE-5: los envíos nunca usan \"*\"", () => {
  it("enviarAlErp usa el origen explícito y lanza con \"*\" o con algo que no es un origen", () => {
    const destino = { postMessage: vi.fn() };
    enviarAlErp(destino, { tipo: "ucp:listo", version: 1 }, ERP);
    expect(destino.postMessage).toHaveBeenCalledWith({ tipo: "ucp:listo", version: 1 }, ERP);
    for (const malo of ["*", "", `${ERP}/`, `${ERP}/proyectos`, "erp-qa.casamueble.com.ar"]) {
      expect(() => enviarAlErp(destino, { tipo: "ucp:alto", version: 1, alto: 1 }, malo), malo).toThrow(TargetOriginInvalidoError);
    }
    expect(destino.postMessage).toHaveBeenCalledTimes(1);
  });

  it('en el código, ningún postMessage usa "*" y en src/ solo protocolo.ts llama a postMessage', () => {
    const raiz = path.resolve(__dirname, "..", "..");
    const archivos = ["src", "erp-simulado"].flatMap((dir) =>
      readdirSync(path.join(raiz, dir), { recursive: true, encoding: "utf8" })
        .filter((f) => /\.(ts|tsx|js|mjs|html)$/.test(f))
        .map((f) => ({ nombre: `${dir}/${f.replaceAll("\\", "/")}`, src: readFileSync(path.join(raiz, dir, f), "utf8") })),
    );
    expect(archivos.filter((a) => /postMessage\([^)]*["'`]\*["'`]/.test(a.src)).map((a) => a.nombre)).toEqual([]);
    expect(archivos.filter((a) => a.nombre.startsWith("src/") && /\.postMessage\(/.test(a.src)).map((a) => a.nombre)).toEqual(["src/lib/erp/protocolo.ts"]);
    // El anfitrión simulado manda mensajes, y siempre con su constante de origen.
    const anfitrion = archivos.filter((a) => a.nombre.startsWith("erp-simulado/") && /\.postMessage\(/.test(a.src));
    expect(anfitrion.length).toBeGreaterThan(0);
    for (const a of anfitrion) for (const m of a.src.matchAll(/\.postMessage\(([^;]*)\)/g)) expect(m[1], a.nombre).toMatch(/ORIGEN_UCP\s*$/);
  });

  it("el token del ERP no va a la URL, a storage ni a la consola en el código del navegador", () => {
    const raiz = path.resolve(__dirname, "..", "..", "src");
    const cliente = readdirSync(raiz, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => readFileSync(path.join(raiz, f), "utf8"))
      .filter((src) => src.startsWith('"use client"') && /accessToken/.test(src));
    expect(cliente.length).toBeGreaterThan(0);
    for (const src of cliente) {
      expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
      expect(src).not.toMatch(/console\.\w+\([^)]*accessToken/);
      expect(src).not.toMatch(/[?&]token=|searchParams\.set\(/);
    }
  });
});

describe("TIE-6 (iframe): erp:sesion de otro proyecto", () => {
  it("se rechaza si proyecto.uuid no es el de la ruta (sin distinguir mayúsculas)", () => {
    const m = parsearMensajeDelErp(sesion) as Extract<MensajeErp, { tipo: "erp:sesion" }>;
    expect(sesionEsDeLaRuta(m, PROYECTO.uuid)).toBe(true);
    expect(sesionEsDeLaRuta(m, PROYECTO.uuid.toUpperCase())).toBe(true);
    expect(sesionEsDeLaRuta(m, "5e1a0000-0000-4000-8000-000000000143")).toBe(false);
    expect(sesionEsDeLaRuta(m, "P-0142")).toBe(false);
  });
  // La otra mitad (tenantId distinto del tenant_id del token) la verifica el servidor: tests/erp/sesion.test.ts.
});

/** Temporizador manual: el reloj solo avanza con `avanzar`. */
function temporizadorManual(inicio = 0): Temporizador & { avanzar(ms: number): void } {
  let ahora = inicio;
  let tareas: { en: number; fn: () => void; id: number }[] = [];
  let siguiente = 0;
  return {
    ahora: () => ahora,
    programar(fn, ms) {
      const id = (siguiente += 1);
      tareas.push({ en: ahora + ms, fn, id });
      return () => {
        tareas = tareas.filter((t) => t.id !== id);
      };
    },
    avanzar(ms) {
      const hasta = ahora + ms;
      for (;;) {
        const proxima = tareas.filter((t) => t.en <= hasta).sort((a, b) => a.en - b.en)[0];
        if (!proxima) break;
        tareas = tareas.filter((t) => t !== proxima);
        ahora = proxima.en;
        proxima.fn();
      }
      ahora = hasta;
    },
  };
}

describe("TIE-9: sin erp:token después del vencimiento, la sesión vence", () => {
  it("se da por vencida a los vence + 60 s; un erp:token aceptado antes corre el plazo", () => {
    const vence = 1_795_000_000;
    const t = temporizadorManual(vence * 1000 - 10_000);
    const alVencer = vi.fn();
    const vigia = crearVigiaDeVencimiento(alVencer, t);
    vigia.actualizar(vence);
    t.avanzar(10_000 + GRACIA_VENCIMIENTO_MS - 1);
    expect(alVencer).not.toHaveBeenCalled();
    vigia.actualizar(vence + 900); // llegó un erp:token
    t.avanzar(600_000);
    expect(alVencer).not.toHaveBeenCalled();
    t.avanzar(900_000);
    expect(alVencer).toHaveBeenCalledTimes(1);
    // Una vez vencida, un token tardío no la revive (hay que volver a abrir desde el ERP).
    vigia.actualizar(vence + 99_999);
    t.avanzar(10 ** 9);
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it("un vence ya pasado (más la gracia) vence enseguida; sesionVencida usa la misma regla", () => {
    const t = temporizadorManual(2_000_000_000_000);
    const alVencer = vi.fn();
    crearVigiaDeVencimiento(alVencer, t).actualizar(1_000_000_000);
    expect(alVencer).toHaveBeenCalledTimes(1);
    expect(sesionVencida(1000, 1000 * 1000 + GRACIA_VENCIMIENTO_MS - 1)).toBe(false);
    expect(sesionVencida(1000, 1000 * 1000 + GRACIA_VENCIMIENTO_MS)).toBe(true);
  });
});

describe("TIE-10: ucp:alto al cambiar el contenido, con límite de frecuencia", () => {
  it("el primero sale enseguida; dentro de 200 ms se juntan y sale el último; igual al anterior no se manda", () => {
    const t = temporizadorManual();
    const enviados: number[] = [];
    const e = crearEmisorDeAlto((alto) => enviados.push(alto), t);
    e.medir(500.2);
    expect(enviados).toEqual([501]);
    t.avanzar(50);
    e.medir(600);
    e.medir(650);
    e.medir(700);
    expect(enviados).toEqual([501]);
    t.avanzar(149);
    expect(enviados).toEqual([501]);
    t.avanzar(1);
    expect(enviados).toEqual([501, 700]);
    t.avanzar(1000);
    e.medir(700);
    expect(enviados).toEqual([501, 700]);
    e.medir(720);
    expect(enviados).toEqual([501, 700, 720]);
  });

  it("como máximo uno cada 200 ms aunque cambie todo el tiempo; cancelar descarta el pendiente", () => {
    const t = temporizadorManual();
    const enviados: { alto: number; en: number }[] = [];
    const e = crearEmisorDeAlto((alto) => enviados.push({ alto, en: t.ahora() }), t);
    for (let i = 0; i < 100; i += 1) {
      e.medir(300 + i);
      t.avanzar(10);
    }
    t.avanzar(500);
    for (let i = 1; i < enviados.length; i += 1) expect(enviados[i].en - enviados[i - 1].en).toBeGreaterThanOrEqual(200);
    expect(enviados.at(-1)?.alto).toBe(399);
    expect(enviados.length).toBeLessThanOrEqual(6);
    e.medir(1000);
    e.medir(1100);
    e.cancelar();
    t.avanzar(1000);
    expect(enviados.at(-1)?.alto).toBe(1000);
  });

  it("valores inválidos no se mandan", () => {
    const enviados: number[] = [];
    const e = crearEmisorDeAlto((a) => enviados.push(a), temporizadorManual());
    e.medir(Number.NaN);
    e.medir(-1);
    e.medir(Number.POSITIVE_INFINITY);
    expect(enviados).toEqual([]);
  });
});
