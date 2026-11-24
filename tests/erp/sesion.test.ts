// @vitest-environment node
// TIE-6 (servidor), TIE-7 y TIE-8 (docs/spec-integracion-erp-minima.md v0.3 §6): sesión propia (IE-2) a partir de
// `erp:sesion` y `erp:token`, y login de desarrollo (IE-11). Contra el ERP simulado en proceso, sin red.

import { describe, expect, it } from "vitest";
import { getSesion, postIngresar, postRenovar, postRevocar, postSesion } from "@/server/integracion/api";
import { idDeSesion } from "@/server/integracion/cripto";
import { leerSesion } from "@/server/integracion/sesion";
import { ANA, BRUNO, CARLA, cookieDe, crearEntorno, get, post, type Entorno } from "../helpers/erp";

async function abrirSesion(e: Entorno, sub = ANA.sub, tenantId?: string) {
  const usuario = [ANA, BRUNO, CARLA].find((u) => u.sub === sub)!;
  const accessToken = await e.sim.emitirToken(sub);
  const r = await postSesion(post("/api/erp/sesion", { accessToken, tenantId: tenantId ?? usuario.tenantId }), e.deps);
  return { r, accessToken, cookie: cookieDe(r) };
}

describe("TIE-7: erp:sesion válido crea la sesión", () => {
  it("cookie httpOnly, Secure, SameSite=Lax en /erp y /api/erp, que vence con el token (+60 s); la respuesta no trae el token", async () => {
    const e = crearEntorno();
    const { r, accessToken, cookie } = await abrirSesion(e);
    expect(r.status).toBe(200);
    const cuerpo = await r.clone().text();
    expect(cuerpo).not.toContain(accessToken);
    expect(JSON.parse(cuerpo)).toEqual({ ok: true, vence: Math.floor(e.ahora() / 1000) + 900 });
    const setCookies = r.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    for (const [i, ruta] of ["/erp", "/api/erp"].entries()) {
      expect(setCookies[i]).toMatch(new RegExp(`^ucp_sesion=[A-Za-z0-9_-]{43}; Path=${ruta.replace("/", "\\/")}; Max-Age=960; HttpOnly; Secure; SameSite=Lax$`));
    }
    expect(cookie).toBeDefined();
  });

  it("el token del ERP no queda guardado: la sesión lleva solo sub, tenant_id, carpintería y fechas", async () => {
    const e = crearEntorno();
    const { cookie, accessToken } = await abrirSesion(e);
    const valor = cookie!.split("=")[1];
    const session = await e.deps.persistence.sessions.get(idDeSesion(valor));
    expect(session).toMatchObject({ erpUserId: ANA.sub, erpTenantId: ANA.tenantId, revokedAt: null });
    expect(Object.keys(session!).sort()).toEqual(["createdAt", "erpTenantId", "erpUserId", "expiresAt", "id", "revokedAt", "tenantId"]);
    expect(JSON.stringify(session)).not.toContain(accessToken.split(".")[2]);
    // La base guarda el sha256 del token de la cookie, nunca la cookie.
    expect(session!.id).not.toBe(valor);
    // La carpintería se creó a partir del tenant_id del token.
    expect((await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))?.id).toBe(session!.tenantId);
    expect((await getSesion(get("/api/erp/sesion", { cookie }), e.deps)).status).toBe(200);
  });

  it("Origin ajeno o ausente: 403 y no se valida el token; cuerpo inválido: 400", async () => {
    const e = crearEntorno();
    const accessToken = await e.sim.emitirToken(ANA.sub);
    expect((await postSesion(post("/api/erp/sesion", { accessToken, tenantId: ANA.tenantId }, { origin: "https://evil.example" }), e.deps)).status).toBe(403);
    expect((await postSesion(post("/api/erp/sesion", { accessToken, tenantId: ANA.tenantId }, { origin: null }), e.deps)).status).toBe(403);
    expect(e.sim.pedidos.get("/.well-known/jwks") ?? 0).toBe(0);
    for (const cuerpo of [{}, { accessToken }, { accessToken: "x", tenantId: ANA.tenantId }, { accessToken, tenantId: "t-1" }]) {
      expect((await postSesion(post("/api/erp/sesion", cuerpo), e.deps)).status).toBe(400);
    }
  });

  it("token inválido o vencido: 401 sin cookie; JWKS caído: 503", async () => {
    const e = crearEntorno();
    const vencido = await e.sim.emitirToken(ANA.sub, { venceEnS: -120 });
    const r = await postSesion(post("/api/erp/sesion", { accessToken: vencido, tenantId: ANA.tenantId }), e.deps);
    expect(r.status).toBe(401);
    expect(r.headers.getSetCookie()).toEqual([]);
    const caido = crearEntorno();
    caido.deps.validarToken = async () => {
      const { JwksNoDisponible } = await import("@/server/erp/errores");
      throw new JwksNoDisponible();
    };
    expect((await postSesion(post("/api/erp/sesion", { accessToken: vencido, tenantId: ANA.tenantId }), caido.deps)).status).toBe(503);
  });

  it("una recarga crea otra sesión y revoca la anterior de la misma cookie", async () => {
    const e = crearEntorno();
    const primera = await abrirSesion(e);
    const accessToken = await e.sim.emitirToken(ANA.sub);
    const segunda = await postSesion(post("/api/erp/sesion", { accessToken, tenantId: ANA.tenantId }, { cookie: primera.cookie }), e.deps);
    expect(segunda.status).toBe(200);
    expect(await leerSesion(e.deps, primera.cookie!.split("=")[1])).toBeNull();
    expect(await leerSesion(e.deps, cookieDe(segunda)!.split("=")[1])).not.toBeNull();
  });

  it("la sesión vale hasta vence + 60 s (IE-4) y después la cookie ya no sirve", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    e.avanzar(900_000 + 59_000);
    expect((await getSesion(get("/api/erp/sesion", { cookie }), e.deps)).status).toBe(200);
    e.avanzar(2_000);
    expect((await getSesion(get("/api/erp/sesion", { cookie }), e.deps)).status).toBe(401);
  });
});

describe("TIE-6 (servidor): tenantId del mensaje distinto del tenant_id del token", () => {
  it("se rechaza (401 tenant-distinto), sin sesión ni carpintería nueva", async () => {
    const e = crearEntorno();
    const { r } = await abrirSesion(e, ANA.sub, CARLA.tenantId);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "tenant-distinto" });
    expect(r.headers.getSetCookie()).toEqual([]);
    expect(await e.deps.persistence.tenants.findErpTenant(ANA.tenantId)).toBeNull();
    expect(await e.deps.persistence.tenants.findErpTenant(CARLA.tenantId)).toBeNull();
    expect(e.registros).toContain("ucp:erp sesion-rechazada motivo=tenant-distinto");
  });

  it("mayúsculas distintas del mismo UUID no cuentan como otro tenant", async () => {
    const e = crearEntorno();
    expect((await abrirSesion(e, ANA.sub, ANA.tenantId.toUpperCase())).r.status).toBe(200);
  });
});

describe("TIE-8: erp:token", () => {
  it("del mismo usuario: renueva (corre el vencimiento y la cookie), sin guardar el token", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    e.avanzar(800_000);
    const accessToken = await e.sim.emitirToken(ANA.sub);
    const r = await postRenovar(post("/api/erp/sesion/renovar", { accessToken }, { cookie }), e.deps);
    expect(r.status).toBe(200);
    expect(await r.clone().text()).not.toContain(accessToken);
    expect((await r.json()).vence).toBe(Math.floor(e.ahora() / 1000) + 900);
    expect(r.headers.getSetCookie()[0]).toMatch(/Max-Age=960;/);
    e.avanzar(800_000); // la primera habría vencido
    expect((await getSesion(get("/api/erp/sesion", { cookie }), e.deps)).status).toBe(200);
    expect(e.registros).toContain("ucp:erp sesion-renovada");
  });

  it("de otro usuario: la sesión se revoca y se borra la cookie", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    const r = await postRenovar(post("/api/erp/sesion/renovar", { accessToken: await e.sim.emitirToken(BRUNO.sub) }, { cookie }), e.deps);
    expect(r.status).toBe(401);
    expect(r.headers.getSetCookie().every((c) => c.startsWith("ucp_sesion=;") && c.includes("Max-Age=0"))).toBe(true);
    expect(await leerSesion(e.deps, cookie!.split("=")[1])).toBeNull();
    expect(e.registros).toContain("ucp:erp sesion-revocada motivo=otro-usuario");
    // Ya no se puede renovar ni con el usuario correcto.
    const otra = await postRenovar(post("/api/erp/sesion/renovar", { accessToken: await e.sim.emitirToken(ANA.sub) }, { cookie }), e.deps);
    expect(otra.status).toBe(401);
  });

  it("de otra carpintería, vencido o con firma inválida: revoca; con el JWKS caído: 503 y no revoca", async () => {
    for (const malo of [
      (e: Entorno) => e.sim.emitirToken(CARLA.sub),
      (e: Entorno) => e.sim.emitirToken(ANA.sub, { venceEnS: -100 }),
      async (e: Entorno) => `${(await e.sim.emitirToken(ANA.sub)).slice(0, -4)}AAAA`,
    ]) {
      const e = crearEntorno();
      const { cookie } = await abrirSesion(e);
      expect((await postRenovar(post("/api/erp/sesion/renovar", { accessToken: await malo(e) }, { cookie }), e.deps)).status).toBe(401);
      expect(await leerSesion(e.deps, cookie!.split("=")[1])).toBeNull();
    }
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    const { JwksNoDisponible } = await import("@/server/erp/errores");
    e.deps.validarToken = async () => {
      throw new JwksNoDisponible();
    };
    expect((await postRenovar(post("/api/erp/sesion/renovar", { accessToken: "a.b.c" }, { cookie }), e.deps)).status).toBe(503);
    expect(await leerSesion(e.deps, cookie!.split("=")[1])).not.toBeNull();
  });

  it("sin sesión vigente (o Origin ajeno): no renueva", async () => {
    const e = crearEntorno();
    const accessToken = await e.sim.emitirToken(ANA.sub);
    expect((await postRenovar(post("/api/erp/sesion/renovar", { accessToken }), e.deps)).status).toBe(401);
    const { cookie } = await abrirSesion(e);
    expect((await postRenovar(post("/api/erp/sesion/renovar", { accessToken }, { cookie, origin: "https://evil.example" }), e.deps)).status).toBe(403);
  });

  it("revocar: borra la cookie y la sesión deja de valer", async () => {
    const e = crearEntorno();
    const { cookie } = await abrirSesion(e);
    const r = await postRevocar(post("/api/erp/sesion/revocar", { motivo: "vencida" }, { cookie }), e.deps);
    expect(r.status).toBe(200);
    expect(await leerSesion(e.deps, cookie!.split("=")[1])).toBeNull();
    expect(e.registros).toContain("ucp:erp sesion-revocada motivo=vencida");
  });
});

describe("IE-11: login de desarrollo", () => {
  it("apagado: 404 sin llamar al ERP", async () => {
    const e = crearEntorno();
    const r = await postIngresar(post("/api/erp/ingresar", { usuario: ANA.email, password: "simulado" }), e.deps);
    expect(r.status).toBe(404);
    expect(e.sim.pedidos.get("/api/session/login") ?? 0).toBe(0);
  });

  it("encendido: el servidor hace el login, valida el token y crea la sesión; la contraseña no aparece en ningún registro", async () => {
    const e = crearEntorno({ config: { loginDirecto: true } });
    const r = await postIngresar(post("/api/erp/ingresar", { usuario: ANA.email, password: "simulado" }), e.deps);
    expect(r.status).toBe(200);
    const cookie = cookieDe(r);
    expect((await getSesion(get("/api/erp/sesion", { cookie }), e.deps)).status).toBe(200);
    const session = await leerSesion(e.deps, cookie!.split("=")[1]);
    expect(session).toMatchObject({ erpUserId: ANA.sub, erpTenantId: ANA.tenantId });
    // Con nombre de usuario en vez de email.
    expect((await postIngresar(post("/api/erp/ingresar", { usuario: "bruno", password: "simulado" }), e.deps)).status).toBe(200);
    const mal = await postIngresar(post("/api/erp/ingresar", { usuario: ANA.email, password: "otra-clave-incorrecta" }), e.deps);
    expect(mal.status).toBe(401);
    expect(mal.headers.getSetCookie()).toEqual([]);
    expect(e.registros.join("\n")).not.toMatch(/simulado\b|otra-clave-incorrecta/);
    expect((await postIngresar(post("/api/erp/ingresar", { usuario: ANA.email, password: "simulado" }, { origin: "https://evil.example" }), e.deps)).status).toBe(403);
    expect((await postIngresar(post("/api/erp/ingresar", { usuario: "", password: "x" }), e.deps)).status).toBe(400);
  });
});
