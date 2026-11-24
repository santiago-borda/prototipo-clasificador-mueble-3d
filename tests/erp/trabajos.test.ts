// @vitest-environment node
// TIE-12 a TIE-19 (docs/spec-integracion-erp-minima.md v0.3 §6, con los estados de las respuestas del 20/11):
// POST y GET /api/trabajos (IE-7, IE-8), almacén (IE-10), pantalla embebida (IE-5) y logs (IE-15).
// Contra el ERP simulado en proceso: «Enviar a UCP» llama directo a postTrabajo y las descargas van al simulado.

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getModelo, getProyecto, getProyectos, postIngresar, postRenovar, postSesion } from "@/server/integracion/api";
import { mensajeListadoLeido } from "@/lib/csv-ocl/envio";
import { postTrabajo, getTrabajo } from "@/server/integracion/trabajos";

import { crearZip } from "../../erp-simulado/zip";
import { ANA, BASE_ERP, BRUNO, CARLA, cookieDe, crearEntorno, DAE_OLMO, get, P_OLMO, P_OTRA, P_SIN_ENVIAR, post, type Entorno } from "../helpers/erp";

/** IC-5: el Olmo del ERP simulado tiene 21 tipos y 33 piezas. */
const MENSAJE_SUCCESS = mensajeListadoLeido({ tipos: 21, piezasTotales: 33 });
const sha256 = async (d: Uint8Array) => createHash("sha256").update(d).digest("hex");

async function enviar(e: Entorno, cuerpo: Record<string, unknown>, sub = ANA.sub) {
  const token = await e.sim.emitirToken(sub);
  const r = await postTrabajo(post("/api/trabajos", cuerpo, { bearer: token, origin: null }), e.deps);
  return { r, cuerpo: (await r.clone().json()) as Record<string, unknown>, token };
}

const descargas = (e: Entorno) => [...e.sim.pedidos.entries()].filter(([ruta]) => ruta.startsWith("/blob/")).reduce((n, [, c]) => n + c, 0);

async function sesionDe(e: Entorno, sub = ANA.sub) {
  const u = [ANA, BRUNO, CARLA].find((x) => x.sub === sub)!;
  const r = await postSesion(post("/api/erp/sesion", { accessToken: await e.sim.emitirToken(sub), tenantId: u.tenantId }), e.deps);
  return cookieDe(r)!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TIE-12: POST /api/trabajos válido", () => {
  it("201 con trabajoUuid y estado success; el zip y el CSV quedan guardados por sha256 en la carpintería del token", async () => {
    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const { r, cuerpo: resp } = await enviar(e, cuerpo);
    expect(r.status).toBe(201);
    expect(Object.keys(resp).sort()).toEqual(["estado", "trabajoUuid"]);
    expect(resp.estado).toBe("success");
    expect(resp.trabajoUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(descargas(e)).toBe(2);

    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    const modelo = cuerpo.modelo as { sha256: string };
    const csv = cuerpo.csv as { sha256: string };
    expect(await e.deps.persistence.almacen.leer(tenant.id, modelo.sha256)).toEqual(e.sim.zipOlmo);
    expect(await sha256((await e.deps.persistence.almacen.leer(tenant.id, csv.sha256))!)).toBe(csv.sha256);
    const job = (await e.deps.persistence.jobs.get(tenant.id, resp.trabajoUuid as string))!;
    expect(job).toMatchObject({ status: "success", message: MENSAJE_SUCCESS, model: { version: 3, name: "olmo.zip" }, csv: { version: 1, name: "piezas.csv" } });
    expect(await e.deps.persistence.projects.getErpProject(tenant.id, P_OLMO.uuid)).toMatchObject({ code: "P-0142", name: P_OLMO.nombre, deliveryDate: "2026-12-15" });
  });

  it("minimización (ASUMIDO): proyecto.cliente no se guarda en ningún lado", async () => {
    const e = crearEntorno();
    await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid));
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    const guardado = JSON.stringify([await e.deps.persistence.projects.listErpProjects(tenant.id), await e.deps.persistence.jobs.findByEnvio(tenant.id, "x")]);
    expect(guardado).not.toContain(P_OLMO.cliente);
  });

  it("GET /api/trabajos/{uuid} (IE-8): mismos campos del contrato", async () => {
    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const { cuerpo: resp, token } = await enviar(e, cuerpo);
    const r = await getTrabajo(get(`/api/trabajos/${resp.trabajoUuid}`, { bearer: token }), e.deps, String(resp.trabajoUuid).toUpperCase());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      trabajoUuid: resp.trabajoUuid,
      envioUuid: cuerpo.envioUuid,
      estado: "success",
      mensaje: MENSAJE_SUCCESS,
      actualizadoEn: new Date(e.ahora()).toISOString(),
    });
  });
});

describe("TIE-13: mismo envioUuid dos veces", () => {
  it("200 con el mismo trabajoUuid y sin volver a descargar (también con otro usuario de la misma carpintería)", async () => {
    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const primero = await enviar(e, cuerpo);
    expect(primero.r.status).toBe(201);
    expect(descargas(e)).toBe(2);
    const segundo = await enviar(e, cuerpo);
    expect(segundo.r.status).toBe(200);
    expect(segundo.cuerpo).toEqual(primero.cuerpo);
    const tercero = await enviar(e, { ...cuerpo, modelo: { ...(cuerpo.modelo as object), version: 9 } }, BRUNO.sub);
    expect(tercero.cuerpo.trabajoUuid).toBe(primero.cuerpo.trabajoUuid);
    expect(descargas(e)).toBe(2);
  });

  it("el mismo envioUuid en otra carpintería es otro trabajo", async () => {
    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const a = await enviar(e, cuerpo);
    const b = await enviar(e, { ...cuerpo, proyecto: { ...(cuerpo.proyecto as object), uuid: P_OTRA.uuid } }, CARLA.sub);
    expect(b.r.status).toBe(201);
    expect(b.cuerpo.trabajoUuid).not.toBe(a.cuerpo.trabajoUuid);
  });
});

describe("TIE-13b: reintento de un trabajo failed con el mismo envioUuid (IE-I2 enmendada)", () => {
  it("primer envío con sha256 malo: 422 y failed; el segundo, con datos correctos, reutiliza el trabajoUuid y queda success", async () => {
    const e = crearEntorno();
    const envioUuid = "7f6d0000-0000-4000-8000-0000000000a1";
    const malo = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "sha256-malo", envioUuid }));
    expect(malo.r.status).toBe(422);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    const fallado = (await e.deps.persistence.jobs.get(tenant.id, String(malo.cuerpo.trabajoUuid)))!;
    expect(fallado.status).toBe("failed");
    expect(await e.deps.persistence.almacen.leer(tenant.id, (e.sim.cuerpoEnvio(P_OLMO.uuid).modelo as { sha256: string }).sha256)).toBeNull();

    e.avanzar(5000);
    const bien = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { envioUuid }));
    expect(bien.r.status).toBe(200); // el trabajo ya existía: se reintentó sobre el mismo
    expect(bien.cuerpo).toEqual({ trabajoUuid: malo.cuerpo.trabajoUuid, estado: "success" });
    const ahora = (await e.deps.persistence.jobs.get(tenant.id, String(malo.cuerpo.trabajoUuid)))!;
    expect(ahora).toMatchObject({ status: "success", message: MENSAJE_SUCCESS, createdAt: fallado.createdAt });
    expect(ahora.updatedAt.getTime()).toBeGreaterThan(fallado.updatedAt.getTime());
    expect(await e.deps.persistence.almacen.leer(tenant.id, ahora.model.sha256)).toEqual(e.sim.zipOlmo);
    // Un solo trabajo con ese envioUuid, y un tercer envío ya no descarga.
    const antes = descargas(e);
    const tercero = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { envioUuid }));
    expect(tercero.r.status).toBe(200);
    expect(tercero.cuerpo).toEqual(bien.cuerpo);
    expect(descargas(e)).toBe(antes);
  });

  it("un reintento con la descarga caída (503) deja el trabajo como estaba: failed con su causa anterior", async () => {
    let caida = false;
    const e = crearEntorno({ fetchApp: (fetchSim) => async (input, init) => (caida ? new Response("caído", { status: 502 }) : fetchSim(input, init)) });
    const envioUuid = "7f6d0000-0000-4000-8000-0000000000a2";
    const malo = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "sha256-malo", envioUuid }));
    caida = true;
    const r = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { envioUuid }));
    expect(r.r.status).toBe(503);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    expect(await e.deps.persistence.jobs.get(tenant.id, String(malo.cuerpo.trabajoUuid))).toMatchObject({ status: "failed", message: malo.cuerpo.mensaje });
    caida = false;
    expect((await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { envioUuid }))).cuerpo).toEqual({ trabajoUuid: malo.cuerpo.trabajoUuid, estado: "success" });
  });

  it("dos envíos concurrentes con el mismo envioUuid: un solo trabajo y una sola descarga por archivo; el otro ve inProgress", async () => {
    let soltar!: () => void;
    const compuerta = new Promise<void>((res) => (soltar = res));
    const e = crearEntorno({
      fetchApp: (fetchSim) => async (input, init) => {
        if (String(input).startsWith(`${BASE_ERP}/blob/`)) await compuerta; // las descargas esperan hasta que se suelte
        return fetchSim(input, init);
      },
    });
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const a = enviar(e, cuerpo);
    const b = enviar(e, cuerpo, BRUNO.sub);
    // Con las descargas frenadas, solo puede responder el que no reservó: 200 con el trabajo en curso, sin descargar.
    const primerRespondido = await Promise.race([a, b]);
    expect(primerRespondido.r.status).toBe(200);
    expect(primerRespondido.cuerpo.estado).toBe("inProgress");
    soltar();
    const [ra, rb] = await Promise.all([a, b]);
    const estados = [ra.r.status, rb.r.status].sort();
    expect(estados).toEqual([200, 201]);
    expect(ra.cuerpo.trabajoUuid).toBe(rb.cuerpo.trabajoUuid);
    expect(descargas(e)).toBe(2);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    expect((await e.deps.persistence.projects.listErpProjects(tenant.id)).length).toBe(1);
    expect((await e.deps.persistence.jobs.findByEnvio(tenant.id, String(cuerpo.envioUuid)))?.status).toBe("success");
  });
});

describe("UUID en mayúsculas: se guardan y se buscan normalizados", () => {
  it("el mismo envioUuid en mayúsculas y en minúsculas es el mismo trabajo (y el proyecto, el mismo)", async () => {
    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const envioUuid = String(cuerpo.envioUuid);
    const a = await enviar(e, cuerpo);
    expect(a.r.status).toBe(201);
    const b = await enviar(e, { ...cuerpo, envioUuid: envioUuid.toUpperCase(), proyecto: { ...(cuerpo.proyecto as { uuid: string }), uuid: P_OLMO.uuid.toUpperCase() } });
    expect(b.r.status).toBe(200);
    expect(b.cuerpo.trabajoUuid).toBe(a.cuerpo.trabajoUuid);
    expect(descargas(e)).toBe(2);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    expect((await e.deps.persistence.projects.listErpProjects(tenant.id)).map((p) => p.erpProjectId)).toEqual([P_OLMO.uuid]);
    expect((await e.deps.persistence.jobs.get(tenant.id, String(a.cuerpo.trabajoUuid)))?.envioUuid).toBe(envioUuid.toLowerCase());
  });
});

describe("TIE-14: sha256 que no coincide o zip inválido: 422 legible y trabajo failed con la causa", () => {
  it("sha256 del modelo distinto", async () => {
    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "sha256-malo" });
    const { r, cuerpo: resp, token } = await enviar(e, cuerpo);
    expect(r.status).toBe(422);
    expect(resp).toMatchObject({ estado: "failed", error: "envio-invalido" });
    expect(resp.mensaje).toMatch(/El modelo descargado no coincide con su sha256/);
    // El trabajo queda failed con la causa (respuestas del 20/11) y GET la devuelve; el archivo no se guarda.
    const g = await (await getTrabajo(get("/", { bearer: token }), e.deps, String(resp.trabajoUuid))).json();
    expect(g).toMatchObject({ estado: "failed", mensaje: resp.mensaje });
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    expect(await e.deps.persistence.almacen.leer(tenant.id, (cuerpo.modelo as { sha256: string }).sha256)).toBeNull();
    // Repetir el mismo envío (IE-I2 enmendada): un `failed` se reintenta sobre el mismo trabajo, así que vuelve a descargar
    // y, con el mismo dato malo, falla igual y con el mismo trabajoUuid.
    const antes = descargas(e);
    const otra = await enviar(e, cuerpo);
    expect(otra.r.status).toBe(422);
    expect(otra.cuerpo.trabajoUuid).toBe(resp.trabajoUuid);
    expect(descargas(e)).toBe(antes + 2);
  });

  it("zip sin .dae", async () => {
    const e = crearEntorno();
    const { r, cuerpo } = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "sin-dae" }));
    expect(r.status).toBe(422);
    expect(cuerpo.mensaje).toBe("El zip del modelo no trae ningún archivo .dae.");
  });

  it.each([
    ["con «..»", [{ nombre: "../olmo.dae", datos: DAE_OLMO }], "El zip del modelo tiene rutas no permitidas (por ejemplo con «..»)."],
    ["absoluta", [{ nombre: "/tmp/olmo.dae", datos: DAE_OLMO }], "El zip del modelo tiene rutas no permitidas (por ejemplo con «..»)."],
    ["que no es un zip", null, "El modelo no es un zip válido o está dañado."],
  ])("zip %s", async (_caso, entradas, mensaje) => {
    const bytes = entradas ? crearZip(entradas) : new TextEncoder().encode("no soy un zip");
    const e = crearEntorno({
      fetchApp: (fetchSim) => async (input, init) =>
        String(input).startsWith(`${BASE_ERP}/blob/olmo.zip`) ? new Response(bytes.slice().buffer as ArrayBuffer) : fetchSim(input, init),
    });
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const { r, cuerpo: resp } = await enviar(e, { ...cuerpo, modelo: { ...(cuerpo.modelo as object), sha256: await sha256(bytes) } });
    expect(r.status).toBe(422);
    expect(resp.mensaje).toBe(mensaje);
  });

  it("modelo más grande que ERP_ZIP_MAX_BYTES: 422; URL vencida (403 del blob): 422 que pide reenviar", async () => {
    const chico = crearEntorno({ config: { zipMaxBytes: 1000 } });
    const grande = await enviar(chico, chico.sim.cuerpoEnvio(P_OLMO.uuid));
    expect(grande.r.status).toBe(422);
    expect(grande.cuerpo.mensaje).toBe("El modelo supera el tamaño máximo permitido.");

    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    e.avanzar(16 * 60 * 1000); // las URLs vencen a los 15 min
    const { r, cuerpo: resp } = await enviar(e, cuerpo);
    expect(r.status).toBe(422);
    expect(resp.mensaje).toMatch(/respondió HTTP 403 \(¿venció\?\)\. Volvé a enviar el proyecto\./);
  });

  it("descarga caída (red o 5xx): 503 reintentable, sin trabajo; el reintento con el mismo envioUuid funciona", async () => {
    let caida = true;
    const e = crearEntorno({ fetchApp: (fetchSim) => async (input, init) => (caida ? new Response("caído", { status: 502 }) : fetchSim(input, init)) });
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const { r, cuerpo: resp } = await enviar(e, cuerpo);
    expect(r.status).toBe(503);
    expect(resp.mensaje).toMatch(/Reintentá el envío/);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    expect(await e.deps.persistence.jobs.findByEnvio(tenant.id, String(cuerpo.envioUuid))).toBeNull();
    caida = false;
    expect((await enviar(e, cuerpo)).r.status).toBe(201);
  });
});

describe("TIE-15: URL fuera de ERP_BLOB_ORIGENES o http: 400 sin descargar", () => {
  it.each([
    ["origen ajeno", "https://blob.ajeno.example/modelo.zip?sig=x", /no es de un origen permitido/],
    ["http con modo real", `${BASE_ERP.replace("http:", "http:")}/blob/olmo.zip`, /tiene que ser https/],
    ["con usuario y clave", "https://u:p@blob.example/m.zip", /no puede llevar usuario ni clave/],
    ["no es una URL", "modelo.zip", /no es una URL/],
  ])("%s", async (_caso, url, mensaje) => {
    const e = crearEntorno({ config: { modo: "real", blobOrigenes: ["https://blob.example"] } });
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const { r, cuerpo: resp } = await enviar(e, { ...cuerpo, modelo: { ...(cuerpo.modelo as object), url } });
    expect(r.status).toBe(400);
    expect(resp.mensaje).toMatch(mensaje);
    expect(descargas(e)).toBe(0);
  });

  it("ERP_BLOB_ORIGENES vacía: se rechaza toda descarga", async () => {
    const e = crearEntorno({ config: { modo: "real", blobOrigenes: [] } });
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const { r, cuerpo: resp } = await enviar(e, { ...cuerpo, modelo: { ...(cuerpo.modelo as object), url: "https://blob.example/m.zip" } });
    expect(r.status).toBe(400);
    expect(resp.mensaje).toMatch(/todavía no tiene configurado el origen de las URLs firmadas/);
    expect(descargas(e)).toBe(0);
  });

  it("una redirección del blob no se sigue (redirect: error)", async () => {
    const pedidos: RequestInit[] = [];
    const e = crearEntorno({
      fetchApp: (fetchSim) => async (input, init) => {
        pedidos.push(init ?? {});
        return fetchSim(input, init);
      },
    });
    await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid));
    expect(pedidos).toHaveLength(2);
    expect(pedidos.every((p) => p.redirect === "error")).toBe(true);
  });
});

describe("TIE-16: el tenant del cuerpo o de la URL se ignora", () => {
  it("un tenantId (u otros campos) en el cuerpo y en la query no cambian la carpintería: manda la del token", async () => {
    const e = crearEntorno();
    const cuerpo: Record<string, unknown> = { ...e.sim.cuerpoEnvio(P_OLMO.uuid), tenantId: CARLA.tenantId, tenant_id: CARLA.tenantId, tenant: { id: CARLA.tenantId } };
    const token = await e.sim.emitirToken(ANA.sub);
    const r = await postTrabajo(new Request(`http://localhost:3000/api/trabajos?tenant_id=${CARLA.tenantId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    }), e.deps);
    expect(r.status).toBe(201);
    expect(await e.deps.persistence.tenants.findErpTenant(CARLA.tenantId)).toBeNull();
    const deAna = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    expect(await e.deps.persistence.jobs.findByEnvio(deAna.id, String(cuerpo.envioUuid))).not.toBeNull();
  });
});

describe("TIE-17: GET /api/trabajos/{uuid} de otra carpintería: 404", () => {
  it("404 para otra carpintería, un uuid inexistente o inválido; 401 sin Bearer", async () => {
    const e = crearEntorno();
    const { cuerpo } = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid));
    const deCarla = await e.sim.emitirToken(CARLA.sub);
    expect((await getTrabajo(get("/", { bearer: deCarla }), e.deps, String(cuerpo.trabajoUuid))).status).toBe(404);
    // Aunque Carla ya tenga su carpintería creada.
    await enviar(e, e.sim.cuerpoEnvio(P_OTRA.uuid), CARLA.sub);
    expect((await getTrabajo(get("/", { bearer: deCarla }), e.deps, String(cuerpo.trabajoUuid))).status).toBe(404);
    const deAna = await e.sim.emitirToken(ANA.sub);
    expect((await getTrabajo(get("/", { bearer: deAna }), e.deps, "7f6d0000-0000-4000-8000-000000000999")).status).toBe(404);
    expect((await getTrabajo(get("/", { bearer: deAna }), e.deps, "no-es-uuid")).status).toBe(404);
    expect((await getTrabajo(get("/"), e.deps, String(cuerpo.trabajoUuid))).status).toBe(401);
  });
});

describe("IE-7: errores de autenticación y de esquema", () => {
  it("sin Bearer, vencido o inválido: 401 legible", async () => {
    const e = crearEntorno();
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const sin = await postTrabajo(post("/api/trabajos", cuerpo, { origin: null }), e.deps);
    expect(sin.status).toBe(401);
    expect((await sin.json()).mensaje).toMatch(/Falta el token/);
    const vencido = await postTrabajo(post("/api/trabajos", cuerpo, { origin: null, bearer: await e.sim.emitirToken(ANA.sub, { venceEnS: -100 }) }), e.deps);
    expect(vencido.status).toBe(401);
    expect((await vencido.json()).mensaje).toBe("El token del usuario venció.");
    expect(descargas(e)).toBe(0);
  });

  it.each([
    ["versión 2", (c: Record<string, unknown>) => ({ ...c, version: 2 }), /version 1/],
    ["envioUuid inválido", (c: Record<string, unknown>) => ({ ...c, envioUuid: "7f6d…" }), /envioUuid/],
    ["sin proyecto", (c: Record<string, unknown>) => ({ ...c, proyecto: undefined }), /Falta el proyecto/],
    ["fecha mal", (c: Record<string, unknown>) => ({ ...c, proyecto: { ...(c.proyecto as object), fechaEntrega: "15/12/2026" } }), /AAAA-MM-DD/],
    ["sha256 corto", (c: Record<string, unknown>) => ({ ...c, csv: { ...(c.csv as object), sha256: "abc" } }), /^El sha256 del CSV tiene que tener 64 caracteres hexadecimales.$/],
    ["versión 0", (c: Record<string, unknown>) => ({ ...c, modelo: { ...(c.modelo as object), version: 0 } }), /entero mayor que 0/],
  ])("400 legible: %s", async (_caso, cambiar, mensaje) => {
    const e = crearEntorno();
    const { r, cuerpo } = await enviar(e, cambiar(e.sim.cuerpoEnvio(P_OLMO.uuid)));
    expect(r.status).toBe(400);
    expect(cuerpo.error).toBe("esquema-invalido");
    expect(cuerpo.mensaje).toMatch(mensaje);
    expect(descargas(e)).toBe(0);
  });
});

describe("TIE-18: un usuario de la carpintería A no ve proyectos de la B (con PB-6 a PB-8)", () => {
  it("lista, proyecto y modelo: solo los de la carpintería de la sesión; lo de otra da 404, igual que lo no enviado", async () => {
    const e = crearEntorno();
    await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid));
    await enviar(e, e.sim.cuerpoEnvio(P_OTRA.uuid), CARLA.sub);
    const ana = await sesionDe(e, ANA.sub);
    const carla = await sesionDe(e, CARLA.sub);

    const lista = async (cookie: string) => ((await (await getProyectos(get("/api/erp/proyectos", { cookie }), e.deps)).json()) as { proyectos: { codigo: string }[] }).proyectos.map((p) => p.codigo);
    expect(await lista(ana)).toEqual(["P-0142"]);
    expect(await lista(carla)).toEqual(["P-0201"]);

    expect((await getProyecto(get("/", { cookie: ana }), e.deps, P_OLMO.uuid)).status).toBe(200);
    expect((await getProyecto(get("/", { cookie: ana }), e.deps, P_OTRA.uuid)).status).toBe(404);
    expect((await getProyecto(get("/", { cookie: carla }), e.deps, P_OLMO.uuid)).status).toBe(404);
    expect((await getProyecto(get("/", { cookie: ana }), e.deps, P_SIN_ENVIAR.uuid)).status).toBe(404);
    expect((await getModelo(get("/", { cookie: carla }), e.deps, P_OLMO.uuid)).status).toBe(404);
    expect((await getProyecto(get("/"), e.deps, P_OLMO.uuid)).status).toBe(401);
  });
});

describe("IE-5: lo que lee la pantalla embebida", () => {
  it("proyecto con el último trabajo y el modelo; el .dae que sale es el del repo, byte a byte", async () => {
    const e = crearEntorno();
    const { cuerpo: ok } = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid));
    e.avanzar(1000);
    const { cuerpo: mal } = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "sha256-malo" }));
    const cookie = await sesionDe(e);
    const datos = await (await getProyecto(get("/", { cookie }), e.deps, P_OLMO.uuid.toUpperCase())).json();
    expect(datos).toEqual({
      proyecto: { uuid: P_OLMO.uuid, codigo: "P-0142", nombre: P_OLMO.nombre, fechaEntrega: "2026-12-15" },
      trabajo: { uuid: mal.trabajoUuid, estado: "failed", mensaje: mal.mensaje, actualizadoEn: expect.any(String) },
      modelo: { trabajoUuid: ok.trabajoUuid, nombre: "olmo.zip", version: 3 },
    });
    const m = await getModelo(get("/", { cookie }), e.deps, P_OLMO.uuid);
    expect(m.status).toBe(200);
    expect(m.headers.get("content-type")).toBe("model/vnd.collada+xml");
    expect(m.headers.get("x-ucp-trabajo")).toBe(ok.trabajoUuid);
    expect(new Uint8Array(await m.arrayBuffer())).toEqual(DAE_OLMO);
  });
});

describe("TIE-19: logs de un flujo completo sin tokens, contraseñas, cookies ni query de URLs firmadas", () => {
  it("login, sesión, renovación, envíos (bien y mal), consultas y modelo", async () => {
    const consola: string[] = [];
    for (const nivel of ["info", "warn", "error", "log", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        consola.push(args.map(String).join(" "));
      });
    }
    const e = crearEntorno({ config: { loginDirecto: true } });
    const secretos: string[] = [];
    const cuerpo = e.sim.cuerpoEnvio(P_OLMO.uuid);
    for (const a of ["modelo", "csv"] as const) {
      const url = new URL((cuerpo[a] as { url: string }).url);
      secretos.push(url.searchParams.get("sig")!, url.search);
    }
    const { token } = await enviar(e, cuerpo);
    secretos.push(token);
    await enviar(e, cuerpo);
    await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "sha256-malo" }));
    await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "url-ajena" }));

    const ingreso = await postIngresar(post("/api/erp/ingresar", { usuario: ANA.email, password: "simulado" }), e.deps);
    await postIngresar(post("/api/erp/ingresar", { usuario: ANA.email, password: "clave-equivocada-123" }), e.deps);
    secretos.push("clave-equivocada-123", cookieDe(ingreso)!.split("=")[1]);
    const accessToken = await e.sim.emitirToken(ANA.sub);
    secretos.push(accessToken);
    const s = await postSesion(post("/api/erp/sesion", { accessToken, tenantId: ANA.tenantId }), e.deps);
    const cookie = cookieDe(s)!;
    secretos.push(cookie.split("=")[1]);
    const renovado = await e.sim.emitirToken(ANA.sub);
    secretos.push(renovado);
    await postRenovar(post("/api/erp/sesion/renovar", { accessToken: renovado }, { cookie }), e.deps);
    await getProyecto(get("/", { cookie }), e.deps, P_OLMO.uuid);
    await getModelo(get("/", { cookie }), e.deps, P_OLMO.uuid);
    const otro = await e.sim.emitirToken(BRUNO.sub);
    secretos.push(otro);
    await postRenovar(post("/api/erp/sesion/renovar", { accessToken: otro }, { cookie }), e.deps);

    const todo = [...e.registros, ...consola].join("\n");
    expect(e.registros.length).toBeGreaterThan(8);
    for (const s of secretos) expect(todo, "un secreto apareció en los logs").not.toContain(s);
    expect(todo).not.toMatch(/sig=|Bearer|password|ucp_sesion=|eyJ/);
    expect(todo).not.toContain(BASE_ERP);
    // Cada línea de registro es un evento con campos de la lista cerrada.
    for (const linea of e.registros) expect(linea).toMatch(/^ucp:erp [a-z-]+( (archivo|error|estado|motivo|status)=[A-Za-z0-9._:-]+)*$/);
  });
});
