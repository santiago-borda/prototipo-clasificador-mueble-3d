// @vitest-environment node
// S3-I1 (docs/spec-s3-almacenamiento-archivos.md v0.2): el almacén de la integración con el ERP sobre FileStore +
// stored_file, elegido por FILE_STORE. Un envío completo contra el ERP simulado en proceso, sin red.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFileAlmacen } from "@/files/almacen";
import { ArchivoCorruptoError } from "@/files/errors";
import { createMemoryFileStore } from "@/files/memory";
import { getListado, getModelo, postSesion } from "@/server/integracion/api";
import { almacenDesdeEntorno, ConfigArchivosError } from "@/server/archivos";
import { postTrabajo } from "@/server/integracion/trabajos";
import { createMemoryPersistence } from "@/persistence/memory";
import { ANA, cookieDe, crearEntorno, DAE_OLMO, get, P_OLMO, post } from "../helpers/erp";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("S3-I1: los archivos del envío en FileStore", () => {
  it("POST /api/trabajos guarda el zip y el CSV bajo t/<tenantId>/archivos/<sha256>, con su fila; /modelo y /listado los leen", async () => {
    const e = crearEntorno();
    const store = createMemoryFileStore();
    const enBase = e.deps.persistence.almacen;
    e.deps.persistence = { ...e.deps.persistence, almacen: createFileAlmacen({ store, files: e.deps.persistence.files }) };

    const envio = e.sim.cuerpoEnvio(P_OLMO.uuid);
    const r = await postTrabajo(post("/api/trabajos", envio, { bearer: await e.sim.emitirToken(ANA.sub), origin: null }), e.deps);
    expect(r.status).toBe(201);

    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    const modelo = envio.modelo as { sha256: string };
    const csv = envio.csv as { sha256: string };
    expect(await store.list(`t/${tenant.id}/`)).toEqual([`t/${tenant.id}/archivos/${modelo.sha256}`, `t/${tenant.id}/archivos/${csv.sha256}`].sort());
    expect(await e.deps.persistence.files.findBySha256(tenant.id, modelo.sha256)).toMatchObject({ kind: "zip", contentType: "application/zip", uploadedBy: "erp" });
    expect(await e.deps.persistence.files.findBySha256(tenant.id, csv.sha256)).toMatchObject({ kind: "csv", contentType: "text/csv" });
    // No se escribió en la tabla file_content.
    expect(await enBase.leer(tenant.id, modelo.sha256)).toBeNull();

    const sesion = await postSesion(post("/api/erp/sesion", { accessToken: await e.sim.emitirToken(ANA.sub), tenantId: ANA.tenantId }), e.deps);
    const cookie = cookieDe(sesion)!;
    const dae = await getModelo(get(`/api/erp/proyectos/${P_OLMO.uuid}/modelo`, { cookie }), e.deps, P_OLMO.uuid);
    expect(dae.status).toBe(200);
    expect(sha(new Uint8Array(await dae.arrayBuffer()))).toBe(sha(DAE_OLMO));
    const listado = await getListado(get(`/api/erp/proyectos/${P_OLMO.uuid}/listado`, { cookie }), e.deps, P_OLMO.uuid);
    expect(listado.status).toBe(200);
    expect(((await listado.json()) as { tipos: number }).tipos).toBe(21);
  });

  it("un objeto alterado en el almacenamiento no se sirve: /modelo da error (ArchivoCorruptoError), nunca bytes alterados", async () => {
    const e = crearEntorno();
    const store = createMemoryFileStore();
    e.deps.persistence = { ...e.deps.persistence, almacen: createFileAlmacen({ store, files: e.deps.persistence.files }) };
    const envio = e.sim.cuerpoEnvio(P_OLMO.uuid);
    await postTrabajo(post("/api/trabajos", envio, { bearer: await e.sim.emitirToken(ANA.sub), origin: null }), e.deps);
    const tenant = (await e.deps.persistence.tenants.findErpTenant(ANA.tenantId))!;
    store.bytesCrudos(`t/${tenant.id}/archivos/${(envio.modelo as { sha256: string }).sha256}`)![40] ^= 0xff;
    const cookie = cookieDe(await postSesion(post("/api/erp/sesion", { accessToken: await e.sim.emitirToken(ANA.sub), tenantId: ANA.tenantId }), e.deps))!;
    await expect(getModelo(get(`/api/erp/proyectos/${P_OLMO.uuid}/modelo`, { cookie }), e.deps, P_OLMO.uuid)).rejects.toThrow(ArchivoCorruptoError);
  });
});

describe("S3-I7 y S3-I8 (revisión del 21/11): createFileAlmacen", () => {
  it("la clase la dice quien guarda (un zip con preámbulo va como zip) y los topes son los de la integración", async () => {
    const p = createMemoryPersistence();
    const t = await p.tenants.create({ name: "A", id: "carpinteria-a" });
    const store = createMemoryFileStore();
    const fin = [0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)];
    const zip = new Uint8Array([...new TextEncoder().encode("preámbulo"), ...fin]);
    const almacen = createFileAlmacen({ store, files: p.files }, { zipMaxBytes: 1000, csvMaxBytes: 5 });
    await almacen.guardar(t.id, sha(zip), zip, "modelo");
    expect(await p.files.findBySha256(t.id, sha(zip))).toMatchObject({ kind: "zip", contentType: "application/zip" });
    const csv = new TextEncoder().encode("a;b;c");
    await almacen.guardar(t.id, sha(csv), csv, "csv");
    expect(await p.files.findBySha256(t.id, sha(csv))).toMatchObject({ kind: "csv", contentType: "text/csv" });
    const largo = new TextEncoder().encode("a;b;c;d");
    await expect(almacen.guardar(t.id, sha(largo), largo, "csv")).rejects.toThrow(/máximo es 5/);
  });
});

describe("S3-I1: FILE_STORE", () => {
  const p = createMemoryPersistence();
  it("vacía: el almacén de la base (sin cambios)", () => {
    expect(almacenDesdeEntorno({}, p)).toBe(p.almacen);
    expect(almacenDesdeEntorno({ FILE_STORE: " " }, p)).toBe(p.almacen);
  });
  it("blob y local: otro almacén; local con NODE_ENV=production y un valor desconocido: ConfigArchivosError", () => {
    expect(almacenDesdeEntorno({ FILE_STORE: "blob" }, p)).not.toBe(p.almacen);
    expect(almacenDesdeEntorno({ FILE_STORE: "local", NODE_ENV: "development" }, p)).not.toBe(p.almacen);
    expect(() => almacenDesdeEntorno({ FILE_STORE: "local", NODE_ENV: "production" }, p)).toThrow(ConfigArchivosError);
    expect(() => almacenDesdeEntorno({ FILE_STORE: "s3" }, p)).toThrow(ConfigArchivosError);
  });
});
