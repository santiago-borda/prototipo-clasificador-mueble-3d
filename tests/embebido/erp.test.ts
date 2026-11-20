// @vitest-environment node
// IE-1 (cliente del ERP), IE-8 / TIE-14 (zip) e IE-13 (ERP simulado y anfitrión). Sin red: fetch inyectado.

import { describe, expect, it, vi } from "vitest";
import { crearClienteErp } from "@/server/erp/cliente";
import { ErpNoDisponible, RecursoErpInexistente, RespuestaErpInvalida, TokenErpInvalido, TokenErpVencido } from "@/server/erp/errores";
import { extraerDae, leerZip, rutaInsegura, ZipInvalidoError, type MotivoZipInvalido } from "@/server/erp/zip";
import { crearZip } from "../../erp-simulado/zip";
import { crearEntorno, DAE_OLMO, PFG } from "../helpers/embebido";

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const usuario = { id: "u-1", nombre: "Ana", tenant: { id: "t-1", nombre: "Carpintería" } };

function cliente(fetchImpl: typeof fetch, extra: Partial<{ timeoutMs: number; zipMaxBytes: number }> = {}) {
  return crearClienteErp({ baseUrl: "http://erp.test/", timeoutMs: 1000, zipMaxBytes: 1024 * 1024, fetchImpl, ...extra });
}

describe("IE-1: cliente tipado del ERP", () => {
  it("manda el token como Bearer, a la URL base sin barra doble, sin seguir redirecciones; valida whoami", async () => {
    const fetchImpl = vi.fn(async () => json({ ...usuario, extra: "se ignora" }));
    expect(await cliente(fetchImpl).whoami("tok")).toEqual(usuario);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://erp.test/api/session/whoami");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
  });

  it("401: en whoami TokenErpInvalido, en una lectura TokenErpVencido; 403 TokenErpInvalido; 404 RecursoErpInexistente", async () => {
    const con = (status: number) => cliente(async () => json({ error: "x" }, status));
    await expect(con(401).whoami("t")).rejects.toThrow(TokenErpInvalido);
    await expect(con(401).leerProyecto("t", "P-1")).rejects.toThrow(TokenErpVencido);
    await expect(con(403).leerProyecto("t", "P-1")).rejects.toThrow(TokenErpInvalido);
    await expect(con(404).leerProyecto("t", "P-1")).rejects.toThrow(RecursoErpInexistente);
    await expect(con(418).leerProyecto("t", "P-1")).rejects.toThrow(RespuestaErpInvalida);
  });

  it("un reintento solo cuando el ERP no respondió (red o 5xx); un 401 no se reintenta", async () => {
    const red = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json(usuario));
    expect(await cliente(red).whoami("t")).toEqual(usuario);
    expect(red).toHaveBeenCalledTimes(2);

    const siempre503 = vi.fn(async () => json({}, 503));
    await expect(cliente(siempre503).listarProyectos("t")).rejects.toThrow(ErpNoDisponible);
    expect(siempre503).toHaveBeenCalledTimes(2);

    const unauthorized = vi.fn(async () => json({}, 401));
    await expect(cliente(unauthorized).listarProyectos("t")).rejects.toThrow(TokenErpVencido);
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("timeout configurable: aborta y da ErpNoDisponible(tiempo-agotado), con un reintento", async () => {
    const colgado = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")))),
    ) as unknown as typeof fetch;
    const error = await cliente(colgado, { timeoutMs: 20 }).whoami("t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErpNoDisponible);
    expect((error as ErpNoDisponible).detalle).toBe("tiempo-agotado");
    expect(colgado).toHaveBeenCalledTimes(2);
  });

  it("TIE-13: formato inesperado → RespuestaErpInvalida (whoami sin tenant, proyecto sin listas, cuerpo no JSON, id distinto)", async () => {
    await expect(cliente(async () => json({ id: "u", nombre: "A" })).whoami("t")).rejects.toThrow(RespuestaErpInvalida);
    await expect(cliente(async () => json({ id: "P-1", nombre: "x", tenantId: "t" })).leerProyecto("t", "P-1")).rejects.toThrow(RespuestaErpInvalida);
    await expect(cliente(async () => new Response("<html>")).listarProyectos("t")).rejects.toThrow(RespuestaErpInvalida);
    await expect(cliente(async () => json({ id: "../x", nombre: "x" })).whoami("t")).rejects.toThrow(RespuestaErpInvalida);
    const otroId = { id: "P-2", nombre: "x", tenantId: "t", muebles: [], documentos: [] };
    await expect(cliente(async () => json(otroId)).leerProyecto("t", "P-1")).rejects.toThrow(RespuestaErpInvalida);
  });

  it("ningún error del cliente lleva el token en el mensaje", async () => {
    const token = "eyJ.secreto.firma";
    for (const status of [401, 403, 404, 418, 503]) {
      const e = (await cliente(async () => json({}, status)).leerProyecto(token, "P-1").catch((x: unknown) => x)) as Error;
      expect(`${e.name} ${e.message}`).not.toContain(token);
    }
  });

  it("descargarDocumento corta un cuerpo más grande que el tope (con y sin Content-Length)", async () => {
    const grande = new Uint8Array(2048);
    const conLargo = cliente(async () => new Response(grande, { headers: { "content-length": "2048" } }), { zipMaxBytes: 1024 });
    await expect(conLargo.descargarDocumento("t", "P-1", "D-1")).rejects.toMatchObject({ name: "ZipInvalidoError", motivo: "demasiado-grande" });
    const sinLargo = cliente(async () => new Response(new Blob([grande]).stream()), { zipMaxBytes: 1024 });
    await expect(sinLargo.descargarDocumento("t", "P-1", "D-1")).rejects.toMatchObject({ motivo: "demasiado-grande" });
  });
});

function motivo(fn: () => unknown): MotivoZipInvalido | "sin-error" {
  try {
    fn();
    return "sin-error";
  } catch (e) {
    if (e instanceof ZipInvalidoError) return e.motivo;
    throw e;
  }
}

describe("TIE-14: zip inválido rechazado con error con nombre", () => {
  const opts = { maxBytes: 1024 * 1024 };

  it("un zip válido (deflate y sin compresión) se lee y el .dae sale igual al original", () => {
    for (const metodo of [0, 8] as const) {
      const zip = crearZip([{ nombre: "Olmo/olmo.dae", datos: DAE_OLMO, metodo }, { nombre: "leeme.txt", datos: "hola" }]);
      const dae = extraerDae(zip, opts);
      expect(dae.nombre).toBe("Olmo/olmo.dae");
      expect(Buffer.from(dae.bytes).equals(Buffer.from(DAE_OLMO))).toBe(true);
    }
  });

  it("con dos .dae se toma el primero por nombre (ASUMIDO)", () => {
    const zip = crearZip([{ nombre: "b.dae", datos: "<b/>" }, { nombre: "a.DAE", datos: "<a/>" }]);
    expect(extraerDae(zip, opts).nombre).toBe("a.DAE");
  });

  it.each([
    ["sin .dae", () => crearZip([{ nombre: "modelo.skp", datos: "x" }]), "sin-dae"],
    ["vacío", () => crearZip([]), "sin-dae"],
    ["con ..", () => crearZip([{ nombre: "../evil.dae", datos: "<a/>" }]), "ruta-insegura"],
    ["con .. en el medio", () => crearZip([{ nombre: "a/../../evil.dae", datos: "<a/>" }]), "ruta-insegura"],
    ["ruta absoluta", () => crearZip([{ nombre: "/etc/evil.dae", datos: "<a/>" }]), "ruta-insegura"],
    ["unidad de Windows", () => crearZip([{ nombre: "C:/evil.dae", datos: "<a/>" }]), "ruta-insegura"],
    ["barra invertida", () => crearZip([{ nombre: "..\\evil.dae", datos: "<a/>" }]), "ruta-insegura"],
    ["cifrado", () => crearZip([{ nombre: "a.dae", datos: "<a/>", cifrada: true }]), "cifrado"],
    ["no es un zip", () => new TextEncoder().encode("esto no es un zip, es texto suelto"), "formato"],
  ])("%s", (_caso, zip, esperado) => {
    expect(motivo(() => extraerDae(zip(), opts))).toBe(esperado);
  });

  it("demasiado grande: el zip, o lo que declara descomprimido (bomba)", () => {
    const zip = crearZip([{ nombre: "a.dae", datos: "x".repeat(5000) }]);
    expect(motivo(() => extraerDae(zip, { maxBytes: 100 }))).toBe("demasiado-grande"); // el zip pesa > 100
    const bomba = crearZip([{ nombre: "a.dae", datos: "x".repeat(200_000) }]); // ~200 bytes comprimido
    expect(bomba.length).toBeLessThan(2000);
    expect(motivo(() => extraerDae(bomba, { maxBytes: 10_000 }))).toBe("demasiado-grande");
  });

  it("CRC o tamaño que no coinciden: formato", () => {
    const zip = crearZip([{ nombre: "a.dae", datos: "<a>hola</a>", metodo: 0 }]);
    const roto = zip.slice();
    roto[30 + "a.dae".length] ^= 0xff; // primer byte de los datos
    expect(motivo(() => leerZip(roto, opts))).toBe("formato");
  });

  it("rutaInsegura", () => {
    expect(rutaInsegura("Olmo/olmo.dae")).toBe(false);
    expect(rutaInsegura("a..b/c.dae")).toBe(false);
    for (const r of ["", "..", "a/..", "/a", "\\a", "C:a", "a\0b"]) expect(rutaInsegura(r), r).toBe(true);
  });

  it("descargarDocumento con un zip sin .dae del ERP: ZipInvalidoError", async () => {
    const zip = crearZip([{ nombre: "presupuesto.pdf", datos: "%PDF" }]);
    const c = cliente(async () => new Response(zip.slice().buffer as ArrayBuffer));
    await expect(c.descargarDocumento("t", "P-1", "D-1")).rejects.toMatchObject({ name: "ZipInvalidoError", motivo: "sin-dae" });
  });
});

describe("IE-13: ERP simulado", () => {
  it("whoami, proyectos del tenant del usuario y 401 con token vencido o inventado", async () => {
    const e = crearEntorno();
    const token = e.sim.emitirToken("u-ana");
    expect(await e.deps.erp.whoami(token)).toEqual({ id: "u-ana", nombre: "Ana (simulada)", tenant: { id: "t-casa-mueble", nombre: "Casa Mueble (simulado)" } });
    expect((await e.deps.erp.listarProyectos(token)).map((p) => p.id)).toEqual(["P-0002", "P-0003"]);
    await expect(e.deps.erp.leerProyecto(token, "P-0101")).rejects.toThrow(RecursoErpInexistente);
    await expect(e.deps.erp.whoami("sim.inventado")).rejects.toThrow(TokenErpInvalido);
    e.sim.vencerTokens();
    await expect(e.deps.erp.leerProyecto(token, "P-0002")).rejects.toThrow(TokenErpVencido);
  });

  it("el zip del Olmo de P-0002 pasa la validación y trae el .dae del repo", async () => {
    const e = crearEntorno();
    const token = e.sim.emitirToken("u-ana");
    const d = await e.deps.erp.descargarDocumento(token, "P-0002", "D-0001");
    expect(Buffer.from(d.dae.bytes).equals(Buffer.from(DAE_OLMO))).toBe(true);
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("/anfitrion embebe /embebido?proyecto=… del origen configurado, tiene los botones y no muestra tokens", async () => {
    const e = crearEntorno();
    const r = await e.sim.manejar(new Request("http://localhost:4010/anfitrion?proyecto=P-0002"));
    const html = await r.text();
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(html).toContain(`const ORIGEN_PFG = ${JSON.stringify(PFG)};`);
    expect(html).toContain('"/embebido?proyecto="');
    expect(html).toContain("ERP SIMULADO");
    for (const id of ["vencer", "otro", "salir", "recargar"]) expect(html).toContain(`id="${id}"`);
    expect(html).not.toMatch(/sim\.[A-Za-z0-9_-]{10}/);
    // El proyecto se escapa (no se puede inyectar HTML ni JS).
    const malo = await (await e.sim.manejar(new Request("http://localhost:4010/anfitrion?proyecto=%3C/script%3E%3Cscript%3Ealert(1)"))).text();
    expect(malo).not.toContain("</script><script>alert(1)");
  });

  it("POST /simulado/token emite tokens de usuarios conocidos; /simulado/vencer los vence", async () => {
    const e = crearEntorno();
    const r = await e.sim.manejar(new Request("http://localhost:4010/simulado/token", { method: "POST", body: JSON.stringify({ usuario: "u-bruno" }) }));
    const { token } = (await r.json()) as { token: string };
    expect((await e.deps.erp.whoami(token)).id).toBe("u-bruno");
    expect((await e.sim.manejar(new Request("http://localhost:4010/simulado/token", { method: "POST", body: "{}" }))).status).toBe(400);
    await e.sim.manejar(new Request("http://localhost:4010/simulado/vencer", { method: "POST" }));
    await expect(e.deps.erp.listarProyectos(token)).rejects.toThrow(TokenErpVencido);
  });
});
