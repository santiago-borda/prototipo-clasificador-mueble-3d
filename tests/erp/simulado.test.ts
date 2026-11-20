// @vitest-environment node
// IE-7 / TIE-14 (lectura del zip, node:zlib), IE-7 (descarga con tope) e IE-13 (ERP simulado y anfitrión).
// Sin red: el fetch se inyecta.

import { describe, expect, it } from "vitest";
import { DescargaFallida } from "@/server/erp/errores";
import { descargar, motivoUrlRechazada } from "@/server/erp/descarga";
import { extraerDae, leerZip, rutaInsegura, ZipInvalidoError, type MotivoZipInvalido } from "@/server/erp/zip";
import { crearZip } from "../../erp-simulado/zip";
import { ANA, BASE_ERP, CARLA, crearEntorno, DAE_OLMO, P_OLMO, UCP } from "../helpers/erp";

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

});

describe("IE-7: descarga de las URLs firmadas", () => {
  it("motivoUrlRechazada: https, sin credenciales y de un origen de la lista (http solo en el simulado)", () => {
    const lista = ["https://blob.example"];
    expect(motivoUrlRechazada("https://blob.example/a/modelo.zip?sig=x", lista)).toBeNull();
    expect(motivoUrlRechazada("https://blob.example:8443/a.zip", lista)).toBe("origen-no-permitido");
    expect(motivoUrlRechazada("https://blob.example.evil.example/a.zip", lista)).toBe("origen-no-permitido");
    expect(motivoUrlRechazada("http://blob.example/a.zip", lista)).toBe("no-es-https");
    expect(motivoUrlRechazada("https://blob.example/a.zip", [])).toBe("sin-origenes-configurados");
    expect(motivoUrlRechazada("file:///etc/passwd", lista)).toBe("no-es-https");
    expect(motivoUrlRechazada("http://127.0.0.1:4010/blob/x", ["http://127.0.0.1:4010"], { permitirHttp: true })).toBeNull();
  });

  it("corta un cuerpo más grande que el tope (aunque no declare Content-Length) y clasifica los fallos", async () => {
    const grande = () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < 10; i += 1) c.enqueue(new Uint8Array(1000));
            c.close();
          },
        }),
      );
    await expect(descargar("https://b.example/x", { archivo: "modelo", maxBytes: 5000, timeoutMs: 1000, fetchImpl: async () => grande() })).rejects.toMatchObject({
      detalle: "demasiado-grande",
    });
    expect(await descargar("https://b.example/x", { archivo: "csv", maxBytes: 20_000, timeoutMs: 1000, fetchImpl: async () => grande() })).toHaveLength(10_000);
    const fallo = (fetchImpl: typeof fetch) => descargar("https://b.example/x", { archivo: "csv", maxBytes: 10, timeoutMs: 50, fetchImpl }).catch((e: DescargaFallida) => e);
    expect(await fallo(async () => Promise.reject(new TypeError("fetch failed")))).toMatchObject({ detalle: "red", reintentable: true });
    const http = await fallo(async () => new Response("", { status: 403 }));
    expect(http).toMatchObject({ detalle: "http-403", reintentable: false });
    expect(await fallo(async () => new Response("", { status: 503 }))).toMatchObject({ reintentable: true });
    const lento = await fallo(
      (_u, init) => new Promise((_ok, mal) => (init?.signal as AbortSignal).addEventListener("abort", () => mal(new Error("abort")))),
    );
    expect(lento).toMatchObject({ detalle: "tiempo-agotado", reintentable: true });
    // El mensaje no lleva la URL (su query es una credencial).
    expect((http as Error).message).not.toContain("b.example");
  });
});

describe("IE-13: ERP simulado", () => {
  it("sirve el descubrimiento y el JWKS (RS256, sin clave privada)", async () => {
    const { sim } = crearEntorno();
    const desc = await (await sim.manejar(new Request(`${BASE_ERP}/.well-known/openid-configuration`))).json();
    expect(desc).toMatchObject({ issuer: `${BASE_ERP}/`, jwks_uri: `${BASE_ERP}/.well-known/jwks` });
    const { keys } = (await (await sim.manejar(new Request(`${BASE_ERP}/.well-known/jwks`))).json()) as { keys: Record<string, unknown>[] };
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: "RSA", alg: "RS256", use: "sig" });
    expect(keys[0]).not.toHaveProperty("d");
  });

  it("login (guía §1): data.accessToken con email o nombre de usuario; credenciales malas, 401 sin token", async () => {
    const { sim, deps } = crearEntorno();
    const login = (cuerpo: unknown) => sim.manejar(new Request(`${BASE_ERP}/api/session/login`, { method: "POST", body: JSON.stringify(cuerpo) }));
    const ok = (await (await login({ email: ANA.email, password: "simulado" })).json()) as { data: { accessToken: string } };
    expect(await deps.validarToken(ok.data.accessToken)).toMatchObject({ erpUsuario: ANA.sub, erpTenant: ANA.tenantId });
    expect((await login({ nombreUsuario: "carla", password: "simulado" })).status).toBe(200);
    const mal = await login({ email: ANA.email, password: "no" });
    expect(mal.status).toBe(401);
    expect(((await mal.json()) as { data: unknown }).data).toBeNull();
  });

  it("URLs firmadas: el zip del Olmo trae el .dae del repo; firma alterada o vencida, 403", async () => {
    const { sim, avanzar } = crearEntorno();
    const cuerpo = sim.cuerpoEnvio(P_OLMO.uuid) as { modelo: { url: string } };
    const url = cuerpo.modelo.url;
    expect(url.startsWith(`${BASE_ERP}/blob/olmo.zip?exp=`)).toBe(true);
    expect(url).toContain("&sig=");
    const zip = new Uint8Array(await (await sim.manejar(new Request(url))).arrayBuffer());
    expect(Buffer.from(extraerDae(zip, { maxBytes: 20 * 1024 * 1024 }).bytes).equals(Buffer.from(DAE_OLMO))).toBe(true);
    expect((await sim.manejar(new Request(url.replace(/sig=./, "sig=X")))).status).toBe(403);
    avanzar(15 * 60 * 1000 + 1000);
    expect((await sim.manejar(new Request(url))).status).toBe(403);
  });

  it("«Enviar a UCP»: llama a POST /api/trabajos con el Bearer del usuario y devuelve la respuesta", async () => {
    const { sim } = crearEntorno();
    const enviar = (cuerpo: unknown) => sim.manejar(new Request(`${BASE_ERP}/simulado/enviar`, { method: "POST", body: JSON.stringify(cuerpo) }));
    const r = (await (await enviar({ usuario: ANA.sub, proyecto: P_OLMO.uuid })).json()) as { status: number; cuerpo: { estado: string } };
    expect(r.status).toBe(201);
    expect(r.cuerpo.estado).toBe("success");
    const malo = (await (await enviar({ usuario: ANA.sub, proyecto: P_OLMO.uuid, variante: "sha256-malo" })).json()) as { status: number };
    expect(malo.status).toBe(422);
  });

  it("/anfitrion embebe /erp/proyectos/{uuid} del origen de UCP, manda erp:sesion y erp:token y no muestra tokens", async () => {
    const { sim } = crearEntorno();
    const html = await (await sim.manejar(new Request(`${BASE_ERP}/anfitrion?proyecto=${P_OLMO.uuid}`))).text();
    expect(html).toContain("ERP SIMULADO");
    expect(html).toContain(`const ORIGEN_UCP = ${JSON.stringify(UCP)}`);
    expect(html).toContain(`"/erp/proyectos/"`);
    for (const tipo of ["erp:sesion", "erp:token", "ucp:listo", "ucp:alto"]) expect(html).toContain(tipo);
    for (const boton of ["Enviar a UCP", "Mandar el token de otro usuario", "Reabrir con un tenant distinto", "Dejar de renovar"]) expect(html).toContain(boton);
    expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    // Los usuarios que ofrece son los de la carpintería del proyecto.
    expect(html).toContain(ANA.sub);
    expect(html).not.toContain(`<option value="${CARLA.sub}"`);
  });
});
