// @vitest-environment node
// TIE-3 a TIE-5, TIE-7, TIE-9, TIE-10, TIE-13, TIE-15 y TIE-16 (docs/spec-integracion-erp-minima.md §7), contra el
// ERP simulado en proceso (sin red, nunca el ERP real). TIE-6 y TIE-8 (lado del iframe) están en renovacion.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getModelo, postRenovar, postRevocar, postSesion } from "@/server/embebido/api";
import { validarConfiguracionAlArrancar } from "@/server/embebido/config";
import { idDeSesion } from "@/server/embebido/cripto";
import { cargarProyecto } from "@/server/embebido/proyecto";
import { leerSesion } from "@/server/embebido/sesion";
import { leerConfigErp } from "@/server/erp/config";
import { ConfiguracionErpInvalida, ErpSimuladoEnProduccionError } from "@/server/erp/errores";
import { cookieDe, crearEntorno, get, post, type Entorno } from "../helpers/embebido";

async function abrirSesion(e: Entorno, usuario = "u-ana", proyecto = "P-0002") {
  const tokenErp = e.sim.emitirToken(usuario);
  const r = await postSesion(post("/api/embebido/sesion", { token: tokenErp, proyecto }), e.deps);
  return { r, tokenErp, cookie: cookieDe(r) };
}

const valorCookie = (cookie: string | undefined) => cookie?.split("=")[1];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("TIE-3: intercambio válido", () => {
  it("crea la sesión, manda la cookie httpOnly bajo /embebido y /api/embebido y la respuesta no lleva el token del ERP", async () => {
    const e = crearEntorno();
    const { r, tokenErp, cookie } = await abrirSesion(e);
    expect(r.status).toBe(200);
    const texto = await r.clone().text();
    expect(JSON.parse(texto)).toEqual({ destino: "/embebido/proyectos/P-0002" });
    expect(texto).not.toContain(tokenErp);
    const setCookies = r.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    for (const [i, ruta] of ["/embebido", "/api/embebido"].entries()) {
      expect(setCookies[i]).toMatch(new RegExp(`^pfg_sesion=[A-Za-z0-9_-]{43}; Path=${ruta}; Max-Age=28800; HttpOnly; Secure; SameSite=Lax$`));
      expect(setCookies[i]).not.toContain(tokenErp);
    }
    // En la base: id = sha256 de la cookie, token del ERP cifrado (no en claro), tenant de whoami.
    const id = idDeSesion(valorCookie(cookie)!);
    const guardada = await e.deps.persistence.sessions.get(id);
    expect(guardada?.erpUserId).toBe("u-ana");
    expect(guardada?.erpTenantId).toBe("t-casa-mueble");
    expect(guardada?.erpTokenEncrypted).toMatch(/^v1\./);
    expect(guardada?.erpTokenEncrypted).not.toContain(tokenErp);
    expect((await leerSesion(e.deps, valorCookie(cookie)))?.tokenErp).toBe(tokenErp);
  });

  it("IE-6: el tenant sale de whoami; la carpintería se crea una vez", async () => {
    const e = crearEntorno();
    const a = await abrirSesion(e, "u-ana");
    const b = await abrirSesion(e, "u-bruno");
    const sa = await e.deps.persistence.sessions.get(idDeSesion(valorCookie(a.cookie)!));
    const sb = await e.deps.persistence.sessions.get(idDeSesion(valorCookie(b.cookie)!));
    expect(sa?.tenantId).toBe(sb?.tenantId);
    expect((await e.deps.persistence.tenants.get(sa!.tenantId))?.erpTenantId).toBe("t-casa-mueble");
  });

  it("pedido mal formado: 400 sin sesión", async () => {
    const e = crearEntorno();
    const token = e.sim.emitirToken("u-ana");
    for (const cuerpo of [{ token }, { token, proyecto: "../x" }, { token: "", proyecto: "P-0002" }, { token: "a b", proyecto: "P-0002" }]) {
      const r = await postSesion(post("/api/embebido/sesion", cuerpo), e.deps);
      expect(r.status).toBe(400);
      expect(r.headers.getSetCookie()).toEqual([]);
    }
  });
});

describe("TIE-4: token rechazado por whoami", () => {
  it("401 genérico, sin sesión ni cookie (token inventado, vencido o ERP caído)", async () => {
    const e = crearEntorno();
    const vencido = e.sim.emitirToken("u-ana");
    e.sim.vencerTokens();
    for (const token of ["sim.inventado", vencido]) {
      const r = await postSesion(post("/api/embebido/sesion", { token, proyecto: "P-0002" }), e.deps);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "no-autenticada" });
      expect(r.headers.getSetCookie()).toEqual([]);
    }
    const caido = crearEntorno({ erp: (base) => ({ ...base, whoami: async () => Promise.reject(new TypeError("fetch failed")) }) });
    const r = await postSesion(post("/api/embebido/sesion", { token: "x", proyecto: "P-0002" }), caido.deps);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "no-autenticada" });
  });
});

describe("TIE-5: Origin ajeno", () => {
  it.each([
    ["otro origen", "https://evil.example"],
    ["el del ERP", "http://localhost:4010"],
    ["sin Origin", null],
    ["mismo host, otro puerto", "http://localhost:3001"],
  ])("POST /api/embebido/sesion con %s: 403, y no llama a whoami", async (_caso, origin) => {
    const e = crearEntorno();
    const token = e.sim.emitirToken("u-ana");
    const r = await postSesion(post("/api/embebido/sesion", { token, proyecto: "P-0002" }, { origin }), e.deps);
    expect(r.status).toBe(403);
    expect(r.headers.getSetCookie()).toEqual([]);
    expect(e.sim.pedidos.get("/api/session/whoami") ?? 0).toBe(0);
  });

  it("también renovar y revocar exigen el mismo origen", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    const otro = e.sim.emitirToken("u-ana");
    expect((await postRenovar(post("/api/embebido/sesion/renovar", { token: otro }, { cookie, origin: "https://evil.example" }), e.deps)).status).toBe(403);
    expect((await postRevocar(post("/api/embebido/sesion/revocar", {}, { cookie, origin: "https://evil.example" }), e.deps)).status).toBe(403);
    expect(await leerSesion(e.deps, valorCookie(cookie))).not.toBeNull();
  });
});

describe("TIE-6 (servidor) y TIE-7: renovación", () => {
  it("TIE-6: con el token vencido la página pide renovar; con el token nuevo del mismo usuario vuelve a leer", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    expect((await cargarProyecto(e.deps, valorCookie(cookie), "P-0002")).estado).toBe("ok");
    e.sim.vencerTokens();
    expect(await cargarProyecto(e.deps, valorCookie(cookie), "P-0002")).toEqual({ estado: "token-vencido" });
    const nuevo = e.sim.emitirToken("u-ana");
    const r = await postRenovar(post("/api/embebido/sesion/renovar", { token: nuevo }, { cookie }), e.deps);
    expect(r.status).toBe(200);
    expect(await r.text()).not.toContain(nuevo);
    expect((await cargarProyecto(e.deps, valorCookie(cookie), "P-0002")).estado).toBe("ok");
  });

  it("TIE-7: token de otro usuario (mismo tenant o de otro): sesión revocada y cookie borrada", async () => {
    for (const otro of ["u-bruno", "u-carla"]) {
      const e = crearEntorno();
      const { cookie } = await abrirSesion(e);
      const r = await postRenovar(post("/api/embebido/sesion/renovar", { token: e.sim.emitirToken(otro) }, { cookie }), e.deps);
      expect(r.status).toBe(401);
      expect(r.headers.getSetCookie().every((c) => c.includes("Max-Age=0"))).toBe(true);
      const guardada = await e.deps.persistence.sessions.get(idDeSesion(valorCookie(cookie)!));
      expect(guardada?.revokedAt).not.toBeNull();
      expect(await leerSesion(e.deps, valorCookie(cookie))).toBeNull();
      expect(e.registros).toContain("pfg:embebido sesion-revocada motivo=otro-usuario");
    }
  });

  it("renovar con un token que whoami rechaza también revoca; sin sesión, 401 sin tocar nada", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    expect((await postRenovar(post("/api/embebido/sesion/renovar", { token: "sim.inventado" }, { cookie }), e.deps)).status).toBe(401);
    expect(await leerSesion(e.deps, valorCookie(cookie))).toBeNull();
    const sinSesion = await postRenovar(post("/api/embebido/sesion/renovar", { token: e.sim.emitirToken("u-ana") }), e.deps);
    expect(sinSesion.status).toBe(401);
  });

  it("revocar (erp:salir o espera vencida): la sesión deja de valer y se borra la cookie", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    const r = await postRevocar(post("/api/embebido/sesion/revocar", { motivo: "erp-salir" }, { cookie }), e.deps);
    expect(r.status).toBe(200);
    expect(r.headers.getSetCookie()).toHaveLength(2);
    expect(await cargarProyecto(e.deps, valorCookie(cookie), "P-0002")).toEqual({ estado: "no-autenticada" });
  });
});

describe("TIE-9: cookie adulterada o sesión inexistente", () => {
  it("no autenticada en todos los casos", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    const valor = valorCookie(cookie)!;
    const adulterada = `${valor.slice(0, -1)}${valor.endsWith("A") ? "B" : "A"}`;
    for (const c of [undefined, "", "corta", adulterada, "x".repeat(43), `${valor}x`, "a".repeat(64)]) {
      expect(await cargarProyecto(e.deps, c, "P-0002"), String(c)).toEqual({ estado: "no-autenticada" });
    }
    // Vencida por tiempo.
    e.avanzar(8 * 60 * 60 * 1000);
    expect(await cargarProyecto(e.deps, valor, "P-0002")).toEqual({ estado: "no-autenticada" });
  });

  it("un token cifrado copiado a otra sesión no se descifra (dato asociado = id de la sesión)", async () => {
    const e = crearEntorno();
    const a = await abrirSesion(e, "u-ana");
    const b = await abrirSesion(e, "u-bruno");
    const sa = (await e.deps.persistence.sessions.get(idDeSesion(valorCookie(a.cookie)!)))!;
    const sb = (await e.deps.persistence.sessions.get(idDeSesion(valorCookie(b.cookie)!)))!;
    await e.deps.persistence.sessions.replaceToken(sb.tenantId, sb.id, sa.erpTokenEncrypted);
    expect(await leerSesion(e.deps, valorCookie(b.cookie))).toBeNull();
  });

  it("la ruta del modelo sin sesión: 401", async () => {
    const e = crearEntorno();
    const r = await getModelo(get("/api/embebido/proyectos/P-0002/documentos/D-0001/modelo"), e.deps, "P-0002", "D-0001");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "no-autenticada" });
  });
});

describe("TIE-10: aislamiento entre tenants (con PB-6 a PB-8)", () => {
  it("un usuario del tenant A no ve el proyecto del tenant B aunque mande el id", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e, "u-ana");
    expect(await cargarProyecto(e.deps, valorCookie(cookie), "P-0101")).toEqual({ estado: "no-encontrado" });
    const r = await getModelo(get("/x", cookie), e.deps, "P-0101", "D-0001");
    expect(r.status).toBe(404);
  });

  it("aunque el ERP devolviera un proyecto de otro tenant, no se muestra ni se vincula", async () => {
    const e = crearEntorno({
      erp: (base) => ({ ...base, leerProyecto: async (t, id) => ({ ...(await base.leerProyecto(t, id)), tenantId: "t-otra" }) }),
    });
    const { cookie } = await abrirSesion(e, "u-ana");
    expect(await cargarProyecto(e.deps, valorCookie(cookie), "P-0002")).toEqual({ estado: "no-encontrado" });
    expect(e.registros).toContain("pfg:embebido lectura-erp erpProyectoId=P-0002 estado=otro-tenant");
  });

  it("el mismo id de proyecto del ERP en dos carpinterías es un vínculo distinto en cada una", async () => {
    const e = crearEntorno();
    const a = await abrirSesion(e, "u-ana");
    const c = await abrirSesion(e, "u-carla");
    const ra = await cargarProyecto(e.deps, valorCookie(a.cookie), "P-0002");
    const rc = await cargarProyecto(e.deps, valorCookie(c.cookie), "P-0101");
    expect(ra.estado).toBe("ok");
    expect(rc.estado).toBe("ok");
    const sa = (await e.deps.persistence.sessions.get(idDeSesion(valorCookie(a.cookie)!)))!;
    const sc = (await e.deps.persistence.sessions.get(idDeSesion(valorCookie(c.cookie)!)))!;
    expect(sa.tenantId).not.toBe(sc.tenantId);
  });

  it("ids con formato raro: no encontrado, sin llamar al ERP", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    for (const id of ["../P-0002", "P 0002", "", "a".repeat(65)]) {
      expect(await cargarProyecto(e.deps, valorCookie(cookie), id)).toEqual({ estado: "no-encontrado" });
    }
  });
});

describe("IE-7 / IE-8 / IE-9: proyecto y modelo", () => {
  it("el proyecto trae muebles y Documentos; queda vinculado; el modelo devuelve el .dae del Olmo y registra el sha256", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    const p = await cargarProyecto(e.deps, valorCookie(cookie), "P-0002");
    if (p.estado !== "ok") throw new Error(p.estado);
    expect(p.proyecto.muebles.map((m) => m.nombre)).toEqual(["Escritorio Olmo"]);
    expect(p.proyecto.documentos.map((d) => d.id)).toEqual(["D-0001", "D-0002"]);
    expect(await cargarProyecto(e.deps, valorCookie(cookie), "P-0002")).toMatchObject({ projectId: p.projectId });

    const r = await getModelo(get("/x", cookie), e.deps, "P-0002", "D-0001");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const dae = new TextDecoder().decode(await r.arrayBuffer());
    expect(dae).toContain("<COLLADA");
    const s = (await e.deps.persistence.sessions.get(idDeSesion(valorCookie(cookie)!)))!;
    const vistos = await e.deps.persistence.erpDocuments.list(s.tenantId, p.projectId);
    expect(vistos).toHaveLength(1);
    expect(vistos[0]).toMatchObject({ erpDocumentId: "D-0001" });
    expect(vistos[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un Documento que no es zip o que no existe: 404; con el token vencido: 401 token-erp-vencido", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    expect((await getModelo(get("/x", cookie), e.deps, "P-0002", "D-0002")).status).toBe(404);
    expect((await getModelo(get("/x", cookie), e.deps, "P-0002", "D-9999")).status).toBe(404);
    e.sim.vencerTokens();
    const r = await getModelo(get("/x", cookie), e.deps, "P-0002", "D-0001");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "token-erp-vencido" });
  });
});

describe("TIE-13: respuesta del ERP con formato inesperado", () => {
  it("RespuestaErpInvalida → estado «respuesta-invalida», sin romper la página", async () => {
    const e = crearEntorno({
      erp: (_base, fetchSim) => {
        const raro: typeof fetch = async (input, init) => {
          const url = String(input);
          if (url.includes("/api/proyectos/")) return new Response(JSON.stringify({ id: "P-0002", nombre: 7 }), { status: 200 });
          return fetchSim(input, init);
        };
        return { ..._base, leerProyecto: (t, id) => crearClienteRaro(raro).leerProyecto(t, id) };
      },
    });
    const { cookie } = await abrirSesion(e);
    expect(await cargarProyecto(e.deps, valorCookie(cookie), "P-0002")).toEqual({ estado: "respuesta-invalida" });
    expect((await getModelo(get("/x", cookie), e.deps, "P-0002", "D-0001")).status).toBe(502);
  });
});

describe("TIE-15: los logs de un flujo completo no tienen tokens ni cookies", () => {
  it("abrir, leer, abrir el modelo, vencer, renovar, otro usuario, revocar", async () => {
    const consola: string[] = [];
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void consola.push(args.map(String).join(" ")));
    }
    const e = crearEntorno();
    const secretos: string[] = [];
    const { tokenErp, cookie } = await abrirSesion(e);
    secretos.push(tokenErp, valorCookie(cookie)!);
    await cargarProyecto(e.deps, valorCookie(cookie), "P-0002");
    await getModelo(get("/x", cookie), e.deps, "P-0002", "D-0001");
    e.sim.vencerTokens();
    await cargarProyecto(e.deps, valorCookie(cookie), "P-0002");
    const nuevo = e.sim.emitirToken("u-ana");
    secretos.push(nuevo);
    await postRenovar(post("/api/embebido/sesion/renovar", { token: nuevo }, { cookie }), e.deps);
    const ajeno = e.sim.emitirToken("u-bruno");
    secretos.push(ajeno);
    await postRenovar(post("/api/embebido/sesion/renovar", { token: ajeno }, { cookie }), e.deps);
    await postSesion(post("/api/embebido/sesion", { token: "sim.inventado", proyecto: "P-0002" }), e.deps);
    const otra = await abrirSesion(e);
    secretos.push(otra.tokenErp, valorCookie(otra.cookie)!);
    await postRevocar(post("/api/embebido/sesion/revocar", { motivo: "erp-salir" }, { cookie: otra.cookie }), e.deps);

    const todo = [...e.registros, ...consola].join("\n");
    expect(e.registros.length).toBeGreaterThan(5);
    for (const s of secretos) expect(todo).not.toContain(s);
    expect(todo).not.toMatch(/sim\.[A-Za-z0-9_-]{10}/);
    expect(todo).not.toMatch(/pfg_sesion=/);
    expect(todo).not.toMatch(/Bearer/i);
  });
});

describe("TIE-16: ERP_MODO=simulado con NODE_ENV=production", () => {
  it("leerConfigErp y la validación al arrancar lanzan ErpSimuladoEnProduccionError", () => {
    expect(() => leerConfigErp({ ERP_MODO: "simulado", NODE_ENV: "production" })).toThrow(ErpSimuladoEnProduccionError);
    expect(() => validarConfiguracionAlArrancar({ ERP_MODO: "simulado", NODE_ENV: "production" })).toThrow(ErpSimuladoEnProduccionError);
    // Aun con el embebido apagado y con ERP_API_URL definida.
    expect(() =>
      validarConfiguracionAlArrancar({ ERP_MODO: "simulado", NODE_ENV: "production", ERP_API_URL: "https://erp-api-qa.casamueble.com.ar" }),
    ).toThrow(ErpSimuladoEnProduccionError);
  });

  it("instrumentation.register no deja arrancar", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ERP_MODO", "simulado");
    const { register } = await import("@/instrumentation");
    await expect(register()).rejects.toThrow(/ERP_MODO=simulado/);
  });

  it("en desarrollo, simulado apunta al ERP simulado e ignora ERP_API_URL", () => {
    expect(leerConfigErp({ ERP_MODO: "simulado", ERP_API_URL: "https://erp-api-qa.casamueble.com.ar" }).baseUrl).toBe("http://127.0.0.1:4010");
    expect(leerConfigErp({ ERP_MODO: "simulado", ERP_SIMULADO_URL: "http://localhost:4999" }).baseUrl).toBe("http://localhost:4999");
  });

  it("otras validaciones al arrancar: ERP_MODO desconocido; embebido encendido sin ERP_API_URL o sin SESION_CLAVE en producción", () => {
    expect(() => validarConfiguracionAlArrancar({ ERP_MODO: "otro" })).toThrow(ConfiguracionErpInvalida);
    const prod = { NODE_ENV: "production", ERP_FRONT_ORIGENES: "https://erp-qa.casamueble.com.ar" };
    expect(() => validarConfiguracionAlArrancar(prod)).toThrow(/ERP_API_URL: falta/);
    expect(() => validarConfiguracionAlArrancar({ ...prod, ERP_API_URL: "http://erp-api-qa.casamueble.com.ar" })).toThrow(/https/);
    expect(() => validarConfiguracionAlArrancar({ ...prod, ERP_API_URL: "https://erp-api-qa.casamueble.com.ar" })).toThrow(/SESION_CLAVE: falta/);
    expect(() =>
      validarConfiguracionAlArrancar({ ...prod, ERP_API_URL: "https://erp-api-qa.casamueble.com.ar", SESION_CLAVE: "corta" }),
    ).toThrow(/SESION_CLAVE/);
    expect(
      validarConfiguracionAlArrancar({ ...prod, ERP_API_URL: "https://erp-api-qa.casamueble.com.ar", SESION_CLAVE: Buffer.alloc(32, 7).toString("base64") }),
    ).toEqual({ embebido: true });
    expect(validarConfiguracionAlArrancar({ NODE_ENV: "production" })).toEqual({ embebido: false });
  });
});

// Cliente con un fetch arbitrario (para TIE-13).
import { crearClienteErp } from "@/server/erp/cliente";
function crearClienteRaro(fetchImpl: typeof fetch) {
  return crearClienteErp({ baseUrl: "http://erp-simulado.test", timeoutMs: 1000, zipMaxBytes: 1024 * 1024, fetchImpl });
}
