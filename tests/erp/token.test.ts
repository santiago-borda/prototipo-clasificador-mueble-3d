// @vitest-environment node
// TIE-1 a TIE-3 (docs/spec-integracion-erp-minima.md v0.3 §6): validación local del token del ERP (IE-1), con el JWKS
// del ERP simulado. Sin red: el fetch del JWKS va directo al simulado.

import { createHmac } from "node:crypto";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JwksNoDisponible, TokenErpInvalido, TokenErpVencido } from "@/server/erp/errores";
import { crearValidadorToken, ESPERA_ENTRE_PEDIDOS_JWKS_MS } from "@/server/erp/token";
import { ANA, BASE_ERP, crearEntorno } from "../helpers/erp";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

afterEach(() => {
  vi.useRealTimers();
});

describe("TIE-1: token válido", () => {
  it("devuelve sub, tenant_id y exp; acepta un token con 25 s de reloj adelantado (tolerancia de 30 s)", async () => {
    const { sim, deps, ahora } = crearEntorno();
    const token = await sim.emitirToken(ANA.sub);
    expect(await deps.validarToken(token)).toEqual({ erpUsuario: ANA.sub, erpTenant: ANA.tenantId, exp: Math.floor(ahora() / 1000) + 900 });
    // Vencido hace 25 s: dentro de la tolerancia.
    const casi = await sim.emitirToken(ANA.sub, { venceEnS: -25 });
    await expect(deps.validarToken(casi)).resolves.toMatchObject({ erpUsuario: ANA.sub });
  });

  it("los UUID quedan en minúsculas (la carpintería de QA viene en mayúsculas); la audiencia no se valida", async () => {
    const { sim, deps } = crearEntorno();
    const token = await sim.emitirToken(ANA.sub, { tenantId: "A1C0E001-0000-4000-8000-000000000002" });
    expect((await deps.validarToken(token)).erpTenant).toBe("a1c0e001-0000-4000-8000-000000000002");
  });
});

describe("TIE-2: tokens rechazados", () => {
  it("vencido (más allá de la tolerancia): TokenErpVencido", async () => {
    const { sim, deps } = crearEntorno();
    await expect(deps.validarToken(await sim.emitirToken(ANA.sub, { venceEnS: -31 }))).rejects.toThrow(TokenErpVencido);
  });

  it("firma alterada, otro issuer o sin tenant_id: TokenErpInvalido", async () => {
    const { sim, deps } = crearEntorno();
    const bueno = await sim.emitirToken(ANA.sub);
    const [h, p, firma] = bueno.split(".");
    const alterada = `${h}.${p}.${firma.slice(0, -2)}${firma.endsWith("A") ? "BB" : "AA"}`;
    await expect(deps.validarToken(alterada)).rejects.toThrow(TokenErpInvalido);
    // Payload cambiado con la firma original.
    const otroPayload = b64({ ...JSON.parse(Buffer.from(p, "base64url").toString()), tenant_id: "5e1a0000-0000-4000-8000-0000000c0002" });
    await expect(deps.validarToken(`${h}.${otroPayload}.${firma}`)).rejects.toThrow(TokenErpInvalido);
    await expect(deps.validarToken(await sim.emitirToken(ANA.sub, { issuer: "https://otro-issuer.example/" }))).rejects.toThrow(TokenErpInvalido);
    // Mismo issuer sin la barra final: tampoco (iss exacto).
    await expect(deps.validarToken(await sim.emitirToken(ANA.sub, { issuer: BASE_ERP }))).rejects.toThrow(TokenErpInvalido);
    await expect(deps.validarToken(await sim.emitirToken(ANA.sub, { tenantId: null }))).rejects.toThrow(/sin-tenant_id/);
  });

  it("alg none y HS256 (incluso con la clave pública como secreto): TokenErpInvalido", async () => {
    const { sim, deps, ahora } = crearEntorno();
    const iat = Math.floor(ahora() / 1000);
    const claims = { iss: sim.issuer, sub: ANA.sub, tenant_id: ANA.tenantId, iat, exp: iat + 900 };
    await expect(deps.validarToken(`${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`)).rejects.toThrow(TokenErpInvalido);
    const jwks = (await (await sim.manejar(new Request(`${BASE_ERP}/.well-known/jwks`))).json()) as { keys: { kid: string; n: string }[] };
    const hs = await new SignJWT(claims).setProtectedHeader({ alg: "HS256", kid: jwks.keys[0].kid }).sign(new TextEncoder().encode(jwks.keys[0].n));
    await expect(deps.validarToken(hs)).rejects.toThrow(TokenErpInvalido);
    // HS256 armado a mano con el JWK serializado como secreto (confusión de algoritmo clásica).
    const header = b64({ alg: "HS256", kid: jwks.keys[0].kid });
    const firma = createHmac("sha256", JSON.stringify(jwks.keys[0])).update(`${header}.${b64(claims)}`).digest("base64url");
    await expect(deps.validarToken(`${header}.${b64(claims)}.${firma}`)).rejects.toThrow(TokenErpInvalido);
  });

  it("nbf en el futuro (más de 30 s), forma inválida o demasiado largo: TokenErpInvalido", async () => {
    const { sim, deps, avanzar } = crearEntorno();
    const token = await sim.emitirToken(ANA.sub);
    avanzar(-60_000);
    await expect(deps.validarToken(token)).rejects.toThrow(/claim-nbf/);
    for (const raro of ["", "no-es-un-jwt", "a.b", "a.b.c.d", `${"a".repeat(9000)}.b.c`, "a b.c.d"]) {
      await expect(deps.validarToken(raro)).rejects.toThrow(TokenErpInvalido);
    }
  });

  it("ningún error lleva el token en el mensaje", async () => {
    const { sim, deps } = crearEntorno();
    const token = await sim.emitirToken(ANA.sub, { venceEnS: -100 });
    const error = await deps.validarToken(token).catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain(token);
    expect(String((error as Error).message)).not.toContain(token.split(".")[2]);
  });
});

describe("TIE-3: kid desconocido", () => {
  it("vuelve a pedir el JWKS una sola vez y valida; dentro de los 30 s no lo vuelve a pedir", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00.000Z"));
    const { sim, deps } = crearEntorno();
    const jwks = () => sim.pedidos.get("/.well-known/jwks") ?? 0;

    await deps.validarToken(await sim.emitirToken(ANA.sub));
    await deps.validarToken(await sim.emitirToken(ANA.sub));
    expect(jwks()).toBe(1); // en caché

    sim.rotarClave();
    const nuevo = await sim.emitirToken(ANA.sub);
    // Recién pedido: no se vuelve a pedir antes de los 30 s, aunque el kid no se conozca.
    await expect(deps.validarToken(nuevo)).rejects.toThrow(/kid-desconocido/);
    expect(jwks()).toBe(1);

    vi.setSystemTime(Date.now() + ESPERA_ENTRE_PEDIDOS_JWKS_MS + 1000);
    await expect(deps.validarToken(nuevo)).resolves.toMatchObject({ erpUsuario: ANA.sub });
    expect(jwks()).toBe(2);
    await deps.validarToken(await sim.emitirToken(ANA.sub));
    expect(jwks()).toBe(2);
  });

  it("JWKS caído (red, 500 o no-JSON): JwksNoDisponible, que es reintentable (no es un token inválido)", async () => {
    const { sim } = crearEntorno();
    const token = await sim.emitirToken(ANA.sub);
    const con = (fetchImpl: typeof fetch) => crearValidadorToken({ issuer: sim.issuer, jwksUrl: `${BASE_ERP}/.well-known/jwks`, timeoutMs: 500, fetchImpl });
    await expect(con(async () => Promise.reject(new TypeError("fetch failed")))(token)).rejects.toThrow(JwksNoDisponible);
    await expect(con(async () => new Response("caído", { status: 500 }))(token)).rejects.toThrow(JwksNoDisponible);
    await expect(con(async () => new Response("<html>", { status: 200 }))(token)).rejects.toThrow(JwksNoDisponible);
  });
});
