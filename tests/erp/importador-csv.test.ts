// @vitest-environment node
// TIC-2 a TIC-7 (docs/spec-importador-csv-envio.md §6): lectura del CSV del envío en el servidor (IC-1 a IC-5) y
// GET /api/erp/proyectos/{uuid}/listado (IC-6). Contra el ERP simulado en proceso, sin red.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listadoId } from "@/engine/hash";
import { acotar, FILAS_EN_MENSAJE, LARGO_MAX_MENSAJE, leerCsvDelEnvio, mensajeListadoLeido } from "@/lib/csv-ocl/envio";
import { getListado, postSesion } from "@/server/integracion/api";
import { postTrabajo } from "@/server/integracion/trabajos";
import { csvOlmo } from "../../erp-simulado/csvOlmo";
import { CSV_SIMULADO, CSV_SIMULADO_CON_PROBLEMAS } from "../../erp-simulado/erp";
import { ANA, CARLA, cookieDe, crearEntorno, get, P_OLMO, post, type Entorno } from "../helpers/erp";

const GABINETE = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const bytes = (texto: string) => new TextEncoder().encode(texto);

async function enviar(e: Entorno, cuerpo: Record<string, unknown>, sub = ANA.sub) {
  const r = await postTrabajo(post("/api/trabajos", cuerpo, { bearer: await e.sim.emitirToken(sub), origin: null }), e.deps);
  return { r, cuerpo: (await r.clone().json()) as Record<string, unknown> };
}

async function sesionDe(e: Entorno, u = ANA) {
  const r = await postSesion(post("/api/erp/sesion", { accessToken: await e.sim.emitirToken(u.sub), tenantId: u.tenantId }), e.deps);
  return cookieDe(r)!;
}

describe("TIC-2: leerCsvDelEnvio con CSV de OpenCutList", () => {
  it("gabinete: publicable, 4 tipos y 5 piezas, con los cantos del CSV", () => {
    const l = leerCsvDelEnvio(new Uint8Array(readFileSync(path.join(GABINETE, "gabinete-prueba-canto.csv"))));
    if (!l.ok) throw new Error(l.mensaje);
    expect(l.listado.tipos).toBe(4);
    expect(l.listado.piezasTotales).toBe(5);
    expect(l.listado.metrosCanto).toBe(5.764);
    const c03 = l.listado.piezas.find((p) => p.codigo === "0001-01-M01-C03")!;
    expect(c03).toMatchObject({ largoMm: 800, anchoMm: 400, espesorMm: 18, cantidad: 1, material: "Blanco 18", nombre: "" });
    expect([...c03.canteado].sort()).toEqual(["corto-A", "corto-B", "largo-A", "largo-B"]);
    expect(c03.canto).toEqual({ material: "Canto_Blanco", anchoMm: 22, espesorTexto: "0,2 mm" });
    expect(l.listado.piezas.find((p) => p.codigo === "0001-01-M01-C04")!.canto).toBeNull();
    // `nombre-ausente` es un aviso: no impide usar el listado.
    expect(l.listado.avisos.length).toBe(4);
  });

  it("Olmo del ERP simulado: 21 tipos, 33 piezas, nombres y canteado de olmoDef; listadoId estable", () => {
    const l = leerCsvDelEnvio(bytes(CSV_SIMULADO));
    if (!l.ok) throw new Error(l.mensaje);
    expect(l.listado.tipos).toBe(21);
    expect(l.listado.piezasTotales).toBe(33);
    expect(l.listado.avisos).toEqual([]);
    expect(l.listado.piezas.find((p) => p.codigo === "0001-01-M01-C01")).toMatchObject({ nombre: "Mesa/Techo escritorio", largoMm: 980, anchoMm: 550 });
    const otra = leerCsvDelEnvio(bytes(CSV_SIMULADO));
    if (!otra.ok) throw new Error(otra.mensaje);
    expect(listadoId(otra.listado.pieces)).toBe(listadoId(l.listado.pieces));
    expect(listadoId(l.listado.pieces)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("TIC-3: CSV que no se puede usar", () => {
  it("bytes que no son UTF-8: csv-utf8", () => {
    const l = leerCsvDelEnvio(new Uint8Array([0x4e, 0xfa, 0x6d, 0x65, 0x72, 0x6f])); // "Número" en Latin-1
    expect(l).toMatchObject({ ok: false, motivo: "csv-utf8" });
  });

  it("lista de instancias: rechazo con el mensaje del parser, que dice qué exportar", () => {
    const l = leerCsvDelEnvio(new Uint8Array(readFileSync(path.join(GABINETE, "gabinete-prueba-listainstancias.csv"))));
    expect(l.ok).toBe(false);
    if (l.ok) return;
    expect(l.motivo).toBe("csv-lista-de-instancias");
    expect(l.mensaje.startsWith("El CSV no se pudo leer: ")).toBe(true);
    expect(l.mensaje).toMatch(/Listado de piezas/);
  });

  it(`borrador: cuenta las filas y nombra las ${FILAS_EN_MENSAJE} primeras, «y N más»`, () => {
    const l = leerCsvDelEnvio(bytes(CSV_SIMULADO_CON_PROBLEMAS));
    expect(l.ok).toBe(false);
    if (l.ok) return;
    expect(l.motivo).toBe("csv-borrador");
    expect(l.mensaje).toMatch(/guiones bajos de más/);
    expect(l.mensaje).toMatch(/«2,5» no es una cantidad entera/);
    expect(l.mensaje).toMatch(/volvé a enviar el proyecto/);
    expect(l.mensaje).not.toContain("..");
    expect(l.mensaje).toMatch(/^El listado de piezas del CSV tiene 2 filas con problemas: /);
    expect(l.mensaje).not.toMatch(/filas? más/);
  });

  it("IC-4 (revisión del 21/11): agrupa por fila; «y N filas más» cuenta filas, no problemas", () => {
    // SINTÉTICO: el CSV del Olmo simulado con Longitud y Cantidad inválidas en 5 piezas (2 problemas por fila).
    const codigos = ["C02", "C03", "C04", "C05", "C06"].map((c) => `0001-01-M01-${c}`);
    const texto = csvOlmo({ cantidad: Object.fromEntries(codigos.map((c) => [c, "x"])) });
    // Longitud inválida: se reemplaza la primera medida final de cada una de esas filas.
    const filas = texto.split("\r\n").map((f) => (codigos.some((c) => f.split(";")[1] === c) ? f.split(";").map((celda, i) => (i === 6 ? "abc" : celda)).join(";") : f));
    const l = leerCsvDelEnvio(bytes(filas.join("\r\n")));
    if (l.ok) throw new Error("tenía que fallar");
    expect(l.mensaje).toMatch(/^El listado de piezas del CSV tiene 5 filas con problemas: /);
    expect(l.mensaje.match(/fila \d+, /g)).toHaveLength(FILAS_EN_MENSAJE);
    expect(l.mensaje).toContain("· y 2 filas más.");
    expect(l.mensaje).toMatch(/fila 3, «[^»]+»: [^·]+; «[^»]+»: /); // los dos problemas de la fila 3 juntos
  });

  it("IC-I7: una celda larguísima no hace un mensaje de más de LARGO_MAX_MENSAJE (job.message es varchar(2000))", () => {
    const larga = "Z".repeat(5000);
    const conProblemas = csvOlmo({ designacion: { "0001-01-M01-C01": larga, "0001-01-M01-C02": larga, "0001-01-M01-C03": larga } });
    const l = leerCsvDelEnvio(bytes(conProblemas));
    if (l.ok) throw new Error("tenía que fallar");
    expect(l.mensaje.length).toBeLessThanOrEqual(LARGO_MAX_MENSAJE);
    // Unidad no soportada (el archivo entero se rechaza) con una celda larguísima: también acotado.
    const enCm = CSV_SIMULADO.replace("980,0 mm", `${"9".repeat(3000)} cm`);
    const r = leerCsvDelEnvio(bytes(enCm));
    if (r.ok) throw new Error("tenía que fallar");
    expect(r.motivo).toBe("csv-unidad-no-soportada");
    expect(r.mensaje.length).toBeLessThanOrEqual(LARGO_MAX_MENSAJE);
    expect(acotar("abcdef", 4)).toBe("abc…");
  });
});

describe("TIC-4 a TIC-6: POST /api/trabajos lee el CSV", () => {
  it("TIC-4: CSV del Olmo → 201 success con «21 tipos, 33 piezas»", async () => {
    const e = crearEntorno();
    const { r, cuerpo } = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid));
    expect(r.status).toBe(201);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    const job = (await e.deps.persistence.jobs.get(tenant.id, cuerpo.trabajoUuid as string))!;
    expect(job.status).toBe("success");
    expect(job.message).toBe(mensajeListadoLeido({ tipos: 21, piezasTotales: 33 }));
    expect(job.message).toContain("21 tipos, 33 piezas");
  });

  it("TIC-5: CSV con problemas → 422 failed con la causa; el almacén no guarda nada; el registro no lleva el CSV", async () => {
    const e = crearEntorno();
    const envio = e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "csv-con-problemas" });
    const { r, cuerpo } = await enviar(e, envio);
    expect(r.status).toBe(422);
    expect(cuerpo).toMatchObject({ estado: "failed", error: "envio-invalido" });
    expect(cuerpo.mensaje).toMatch(/listado de piezas del CSV tiene/);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    const modelo = envio.modelo as { sha256: string };
    const csv = envio.csv as { sha256: string };
    expect(await e.deps.persistence.almacen.leer(tenant.id, modelo.sha256)).toBeNull();
    expect(await e.deps.persistence.almacen.leer(tenant.id, csv.sha256)).toBeNull();
    const registro = e.registros.join("\n");
    expect(registro).toMatch(/csv-borrador/);
    expect(registro).not.toMatch(/Mesa\/Techo|2,5/);
  });

  it("TIC-6: reintento con el mismo envioUuid, primero el CSV con problemas y después el bueno → 200 mismo trabajoUuid success", async () => {
    const e = crearEntorno();
    const envioUuid = "0f1e2d3c-4b5a-4000-8000-00000000c5f1";
    const malo = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { variante: "csv-con-problemas", envioUuid }));
    expect(malo.r.status).toBe(422);
    const bueno = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid, { envioUuid }));
    expect(bueno.r.status).toBe(200);
    expect(bueno.cuerpo).toEqual({ trabajoUuid: malo.cuerpo.trabajoUuid, estado: "success" });
  });
});

describe("TIC-7: GET /api/erp/proyectos/{uuid}/listado", () => {
  it("401 sin sesión; 404 para otra carpintería; 200 con 21 piezas y el listadoId del CSV", async () => {
    const e = crearEntorno();
    const { cuerpo } = await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid));
    const ruta = `/api/erp/proyectos/${P_OLMO.uuid}/listado`;
    expect((await getListado(get(ruta), e.deps, P_OLMO.uuid)).status).toBe(401);
    expect((await getListado(get(ruta, { cookie: await sesionDe(e, CARLA) }), e.deps, P_OLMO.uuid)).status).toBe(404);

    const r = await getListado(get(ruta, { cookie: await sesionDe(e) }), e.deps, P_OLMO.uuid.toUpperCase());
    expect(r.status).toBe(200);
    const listado = (await r.json()) as { trabajoUuid: string; listadoId: string; piezas: unknown[]; tipos: number; piezasTotales: number; metrosCanto: number };
    expect(listado.trabajoUuid).toBe(cuerpo.trabajoUuid);
    expect(listado.piezas).toHaveLength(21);
    expect(listado.piezasTotales).toBe(33);
    const l = leerCsvDelEnvio(bytes(CSV_SIMULADO));
    if (!l.ok) throw new Error(l.mensaje);
    expect(listado.listadoId).toBe(listadoId(l.listado.pieces));
    expect(listado.metrosCanto).toBeGreaterThan(0);
  });

  it("404 sin-listado: trabajo success de antes del importador, con un CSV que no es de OpenCutList", async () => {
    const e = crearEntorno();
    await enviar(e, e.sim.cuerpoEnvio(P_OLMO.uuid)); // crea carpintería y proyecto
    const p = e.deps.persistence;
    const tenant = (await p.tenants.findErpTenant(ANA.tenantId))!;
    const proyecto = (await p.projects.getErpProject(tenant.id, P_OLMO.uuid))!;
    const viejo = bytes("Número,Nombre,Cantidad\nC01,Tapa,1\n");
    const sha = "a".repeat(64);
    await p.almacen.guardar(tenant.id, sha, viejo);
    const ultimo = (await p.jobs.latestForProject(tenant.id, proyecto.id, "success"))!;
    e.avanzar(1000);
    const reserva = await p.jobs.claim(
      tenant.id,
      { id: "0f1e2d3c-4b5a-4000-8000-0000000000aa", envioUuid: "0f1e2d3c-4b5a-4000-8000-0000000000ab", projectId: proyecto.id, model: ultimo.model, csv: { sha256: sha, version: 1, name: "piezas.csv" } },
      new Date(0),
    );
    await p.jobs.settle(tenant.id, reserva.job.id, { status: "success", message: "Modelo y CSV recibidos y verificados." });
    const r = await getListado(get(`/api/erp/proyectos/${P_OLMO.uuid}/listado`, { cookie: await sesionDe(e) }), e.deps, P_OLMO.uuid);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "sin-listado", trabajoUuid: reserva.job.id });
  });
});
