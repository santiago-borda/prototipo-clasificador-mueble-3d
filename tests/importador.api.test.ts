// I6–I11 del importador de prueba (docs/spec-importador-prueba.md). La lógica de las rutas vive en
// `src/importer/api.ts` (Request -> Response) y las pruebas usan el ImportStore en memoria: sin red.
import { describe, expect, it } from "vitest";
import { createImportApi } from "@/importer/api";
import { importApiFromEnv } from "@/importer/config";
import { MAX_CSV_BYTES, MAX_DAE_BYTES, MAX_IMPORTS, importPaths } from "@/importer/paths";
import { createMemoryStore } from "@/importer/store";
import { LISTADO_M01, editCell, readFixture } from "./helpers/csv";
import { DIMS_MM, KEY, OLMO_DAE, idFor, newApi, registerBody, registerOlmo, request, seedUpload } from "./helpers/importApi";

const ID = idFor(0xabc123);

describe("I6: la clave compartida protege la escritura", () => {
  it.each([
    ["sin clave", null],
    ["con clave incorrecta", "otra-clave"],
    ["con clave de otro largo", "x"],
    ["con clave vacía", ""],
  ])("registrar %s devuelve 401 y no guarda nada", async (_name, key) => {
    const { api, store } = newApi();
    await seedUpload(store, ID);
    const before = await store.list("importaciones/");
    const res = await api.register(request("POST", "/api/importaciones", { key, body: registerBody(ID) }));
    expect(res.status).toBe(401);
    expect(await store.list("importaciones/")).toEqual(before);
  });

  it("listar, borrar y pedir token también exigen la clave", async () => {
    const { api, store } = newApi();
    await registerOlmo(api, store, ID);
    expect((await api.list(request("GET", "/api/importaciones"))).status).toBe(401);
    expect((await api.list(request("GET", "/api/importaciones", { key: "mala" }))).status).toBe(401);
    expect((await api.remove(request("DELETE", `/api/importaciones/${ID}`), ID)).status).toBe(401);
    expect((await api.guard(request("POST", "/api/importaciones/token")))?.status).toBe(401);
    expect(await store.list(`importaciones/${ID}/`)).toHaveLength(4);
  });

  it("la clave en la URL no vale: solo el encabezado x-import-key", async () => {
    const { api, store } = newApi();
    await seedUpload(store, ID);
    const res = await api.register(
      request("POST", `/api/importaciones?key=${KEY}&x-import-key=${KEY}`, { body: registerBody(ID) }),
    );
    expect(res.status).toBe(401);
  });

  it("con la clave, la importación se guarda (4 archivos) y se lee por id", async () => {
    const { api, store } = newApi({ now: () => new Date("2026-10-20T12:00:00Z") });
    const res = await registerOlmo(api, store, ID);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: ID, estado: "correcto", link: `/prueba/${ID}` });

    const paths = importPaths(ID);
    expect((await store.list(`importaciones/${ID}/`)).sort()).toEqual([paths.csv, paths.dae, paths.informe, paths.mueble].sort());

    const read = await api.read(ID);
    expect(read.status).toBe(200);
    const { mueble, informe } = await read.json();
    expect(mueble.furniture.id).toBe(`prueba-${ID.slice(0, 8)}`);
    expect(mueble.furniture.dimsMm).toEqual(DIMS_MM); // D9: las manda el cliente, el servidor no las recalcula
    expect(mueble.pieceTypes).toHaveLength(21);
    expect("modelUrl" in mueble).toBe(false);
    expect(informe).toMatchObject({
      importId: ID,
      estado: "correcto",
      fecha: "2026-10-20T12:00:00.000Z",
      archivos: { dae: { nombre: "olmo.dae", bytes: OLMO_DAE.byteLength }, csv: { nombre: "listado.csv" } },
      validadoEn: { dae: "cliente", csv: "servidor" },
    });
  });

  it("el cruce con el .dae que manda el cliente define el estado (advertencias -> se guarda igual)", async () => {
    const { api, store } = newApi();
    await seedUpload(store, ID);
    const cruce = {
      verification: { types: 21, instances: 33, distinctCodes: 21, maxDeviationMm: 0, warnings: ["C04: faltan instancias"], anomalies: [] },
      association: { orphans: [], ambiguous: [], countMismatches: [], ok: true },
    };
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID, { cruce }) }));
    expect(res.status).toBe(201);
    expect((await res.json()).estado).toBe("con-advertencias");
    expect((await (await api.read(ID)).json()).informe.cruce).toEqual(cruce);
  });

  it("nunca se sobrescribe: registrar dos veces el mismo id devuelve 409", async () => {
    const { api, store } = newApi();
    await registerOlmo(api, store, ID);
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID) }));
    expect(res.status).toBe(409);
  });

  it.each([
    ["importId mal formado", { importId: "no-es-hex" }],
    ["sin medidas generales (D9)", { dimsMm: undefined }],
    ["medidas no numéricas", { dimsMm: { x: "a", y: 1, z: 1 } }],
  ])("body inválido (%s) devuelve 400", async (_name, patch) => {
    const { api, store } = newApi();
    await seedUpload(store, ID);
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: { ...registerBody(ID), ...patch } }));
    expect(res.status).toBe(400);
  });

  it("la lista (con clave) trae id, mueble, estado y fecha, la más nueva primero", async () => {
    let t = 0;
    const { api, store } = newApi({ now: () => new Date(Date.UTC(2026, 9, 20, 12, t++)) });
    await registerOlmo(api, store, idFor(1));
    await registerOlmo(api, store, idFor(2));
    const res = await api.list(request("GET", "/api/importaciones", { key: KEY }));
    expect(res.status).toBe(200);
    const items = await res.json();
    expect(items.map((i: { id: string }) => i.id)).toEqual([idFor(2), idFor(1)]);
    expect(items[0]).toMatchObject({ estado: "correcto", mueble: `prueba-00000002 Escritorio Olmo` });
    expect(typeof items[0].fecha).toBe("string");
  });
});

describe("I7: un id inexistente devuelve 404 en lectura y en modelo", () => {
  it.each([idFor(0xdead), "no-es-un-id", "../../etc/passwd", "ABCDEF0123456789"])("id %s", async (id) => {
    const { api } = newApi();
    expect((await api.read(id)).status).toBe(404);
    expect((await api.model(id)).status).toBe(404);
  });

  it("la lectura y el modelo no piden clave; el modelo devuelve el .dae tal cual", async () => {
    const { api, store } = newApi();
    await registerOlmo(api, store, ID);
    const res = await api.model(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("xml");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(OLMO_DAE));
  });

  it("una subida sin registrar (sin mueble.json) tampoco se puede leer", async () => {
    const { api, store } = newApi();
    await seedUpload(store, ID);
    expect((await api.read(ID)).status).toBe(404);
    expect((await api.model(ID)).status).toBe(404);
  });
});

describe("I8: el servidor rechaza un CSV inválido aunque el cliente lo haya aceptado", () => {
  it("422 con fila y columna, y no escribe mueble.json ni informe.json", async () => {
    const { api, store } = newApi();
    await seedUpload(store, ID, { csv: editCell(readFixture(LISTADO_M01), 3, "largo_mm", "abc") });
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID) }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.issues).toContainEqual(expect.objectContaining({ severity: "error", row: 3, column: "largo_mm" }));
    const paths = importPaths(ID);
    expect((await store.list(`importaciones/${ID}/`)).sort()).toEqual([paths.csv, paths.dae].sort());
  });

  it.each([
    ["falta el CSV", "csv"],
    ["falta el .dae", "dae"],
  ])("si %s en el almacenamiento, 400", async (_name, missing) => {
    const { api, store } = newApi();
    await seedUpload(store, ID);
    await store.delete([importPaths(ID)[missing as "csv" | "dae"]]);
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID) }));
    expect(res.status).toBe(400);
  });
});

describe("I9: límites de extensión, tamaño y cantidad", () => {
  it("el token solo se autoriza para modelo.dae y listado.csv de un importId válido, con tope de tamaño", async () => {
    const { api } = newApi();
    const dae = await api.authorizeUpload(importPaths(ID).dae);
    const csv = await api.authorizeUpload(importPaths(ID).csv);
    expect(dae.maximumSizeInBytes).toBe(MAX_DAE_BYTES);
    expect(csv.maximumSizeInBytes).toBe(MAX_CSV_BYTES);
    expect(dae.addRandomSuffix).toBe(false);
    expect(dae.allowOverwrite).toBe(false);
  });

  it.each([
    `importaciones/${ID}/modelo.exe`,
    `importaciones/${ID}/listado.xlsx`,
    `importaciones/${ID}/mueble.json`, // lo escribe solo el servidor
    `importaciones/${ID}/informe.json`,
    `importaciones/${ID}/otro.dae`,
    `importaciones/no-es-un-id/modelo.dae`,
    `otra-carpeta/${ID}/modelo.dae`,
    `importaciones/${ID}/../x/modelo.dae`,
  ])("el token rechaza %s", async (pathname) => {
    const { api } = newApi();
    await expect(api.authorizeUpload(pathname)).rejects.toMatchObject({ status: 400 });
  });

  it("registrar con un .dae de más de 10 MB devuelve 413", async () => {
    const { api, store } = newApi();
    await seedUpload(store, ID, { dae: new Uint8Array(MAX_DAE_BYTES + 1) });
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID) }));
    expect(res.status).toBe(413);
  });

  it("registrar con un CSV de más de 1 MB devuelve 413", async () => {
    const { api, store } = newApi();
    await seedUpload(store, ID, { csv: new Uint8Array(MAX_CSV_BYTES + 1) });
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID) }));
    expect(res.status).toBe(413);
  });

  it("un .dae de exactamente 10 MB entra (el límite es inclusivo)", async () => {
    const { api, store } = newApi();
    await seedUpload(store, ID, { dae: new Uint8Array(MAX_DAE_BYTES) });
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID) }));
    expect(res.status).toBe(201);
  });

  it(`la importación número ${MAX_IMPORTS + 1} se rechaza con un error claro (409, código "limite")`, async () => {
    const { api, store } = newApi();
    for (let n = 1; n <= MAX_IMPORTS; n += 1) expect((await registerOlmo(api, store, idFor(n))).status).toBe(201);

    const next = idFor(MAX_IMPORTS + 1);
    await seedUpload(store, next);
    const res = await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(next) }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("limite");
    expect(body.error).toContain(String(MAX_IMPORTS));
    expect((await store.list(`importaciones/${next}/`)).some((p) => p.endsWith("mueble.json"))).toBe(false);

    // El token tampoco se entrega para una nueva importación: se evita subir archivos que no se podrían registrar.
    await expect(api.authorizeUpload(importPaths(idFor(MAX_IMPORTS + 2)).dae)).rejects.toMatchObject({ status: 409 });
  });
});

describe("I10: sin las variables de entorno, la escritura responde 503 y nada más cambia", () => {
  const cases = [
    ["sin nada", createImportApi({})],
    ["sin clave", createImportApi({ store: createMemoryStore() })],
    ["sin almacenamiento", createImportApi({ uploadKey: KEY })],
  ] as const;

  it.each(cases)("%s: registrar, listar, borrar y token devuelven 503 (aun con una clave en el encabezado)", async (_name, api) => {
    expect((await api.register(request("POST", "/api/importaciones", { key: KEY, body: registerBody(ID) }))).status).toBe(503);
    expect((await api.list(request("GET", "/api/importaciones", { key: KEY }))).status).toBe(503);
    expect((await api.remove(request("DELETE", `/api/importaciones/${ID}`, { key: KEY }), ID)).status).toBe(503);
    expect((await api.guard(request("POST", "/api/importaciones/token", { key: KEY })))?.status).toBe(503);
    expect(api.configured).toBe(false);
  });

  it("con todo configurado, `guard` deja pasar la petición con clave", async () => {
    const { api } = newApi();
    expect(api.configured).toBe(true);
    expect(await api.guard(request("POST", "/api/importaciones/token", { key: KEY }))).toBeNull();
  });

  it("importApiFromEnv sin variables no lanza y queda sin configurar", async () => {
    const api = importApiFromEnv({});
    expect(api.configured).toBe(false);
    expect((await api.list(request("GET", "/api/importaciones", { key: KEY }))).status).toBe(503);
  });

  it("importApiFromEnv con clave pero sin BLOB_READ_WRITE_TOKEN ni almacenamiento local: sin configurar", () => {
    expect(importApiFromEnv({ IMPORT_UPLOAD_KEY: KEY }).configured).toBe(false);
    expect(importApiFromEnv({ BLOB_READ_WRITE_TOKEN: "t" }).configured).toBe(false);
  });

  it("importApiFromEnv con las dos variables queda configurado", () => {
    expect(importApiFromEnv({ IMPORT_UPLOAD_KEY: KEY, BLOB_READ_WRITE_TOKEN: "t" }).configured).toBe(true);
  });

  it("el almacenamiento local es solo para desarrollo: en producción se ignora", () => {
    expect(importApiFromEnv({ IMPORT_UPLOAD_KEY: KEY, IMPORT_STORE: "local", NODE_ENV: "development" }).configured).toBe(true);
    expect(importApiFromEnv({ IMPORT_UPLOAD_KEY: KEY, IMPORT_STORE: "local", NODE_ENV: "production" }).configured).toBe(false);
  });
});

describe("I11: borrar elimina los cuatro archivos y la importación desaparece de la lista", () => {
  it("DELETE con clave borra todo", async () => {
    const { api, store } = newApi();
    await registerOlmo(api, store, idFor(1));
    await registerOlmo(api, store, idFor(2));

    const res = await api.remove(request("DELETE", `/api/importaciones/${idFor(1)}`, { key: KEY }), idFor(1));
    expect(res.status).toBe(200);

    expect(await store.list(`importaciones/${idFor(1)}/`)).toEqual([]);
    expect(await store.list(`importaciones/${idFor(2)}/`)).toHaveLength(4); // la otra queda intacta
    const items = await (await api.list(request("GET", "/api/importaciones", { key: KEY }))).json();
    expect(items.map((i: { id: string }) => i.id)).toEqual([idFor(2)]);
    expect((await api.read(idFor(1))).status).toBe(404);
    expect((await api.model(idFor(1))).status).toBe(404);
  });

  it("borrar un id inexistente devuelve 404; uno mal formado, también", async () => {
    const { api } = newApi();
    expect((await api.remove(request("DELETE", `/api/importaciones/${idFor(9)}`, { key: KEY }), idFor(9))).status).toBe(404);
    expect((await api.remove(request("DELETE", "/api/importaciones/zzz", { key: KEY }), "zzz")).status).toBe(404);
  });

  it("al borrar, el lugar queda libre para el tope de importaciones", async () => {
    const { api, store } = newApi();
    for (let n = 1; n <= MAX_IMPORTS; n += 1) await registerOlmo(api, store, idFor(n));
    await api.remove(request("DELETE", `/api/importaciones/${idFor(1)}`, { key: KEY }), idFor(1));
    expect((await registerOlmo(api, store, idFor(MAX_IMPORTS + 1))).status).toBe(201);
  });
});
