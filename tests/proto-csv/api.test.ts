// C11, C13 y C15 del spike (docs/spec-proto-csv-ocl.md §1 P3, §4 y §5). Store en memoria, sin red. La "subida" del
// navegador se simula escribiendo los archivos en el store, como haría el Blob tras `handleUpload`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { listadoId, modelId } from "@/engine/hash";
import { createMemoryStore, type ImportStore } from "@/importer/store";
import { observeDae } from "@/model/observe";
import { createProtoApi, type ProtoInforme } from "@/proto-csv/api";
import { parseOclCsv } from "@/proto-csv/parse";
import { MAX_CARGAS, ProtoPathError, parseProtoKey, protoDir, protoPath, scopedStore } from "@/proto-csv/paths";
import { reviewListing, summarizeReview, type CruceCliente } from "@/proto-csv/review";

const DIR = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const CSV = new Uint8Array(readFileSync(path.join(DIR, "gabinete-prueba-canto.csv")));
const DAE = new Uint8Array(readFileSync(path.join(DIR, "gabinete-prueba-opencutlist.dae")));
const SVG = new Uint8Array(readFileSync(path.join(DIR, "diagrama-blanco18.svg")));
const KEY = "clave-de-prueba";
const ID = "0123456789abcdef";
const OTHER = "fedcba9876543210";

const parsed = parseOclCsv(new TextDecoder().decode(CSV));
if (!parsed.ok) throw new Error("fixture");
const CRUCE: CruceCliente = summarizeReview(reviewListing(parsed.listing, observeDae(DAE), 2));

const req = (method: string, body?: unknown, key: string | null = KEY) =>
  new Request("http://localhost/api/proto-csv", {
    method,
    headers: { "content-type": "application/json", ...(key === null ? {} : { "x-import-key": key }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function upload(store: ImportStore, id = ID, files: Record<string, Uint8Array> = { "listado.csv": CSV, "modelo.dae": DAE, "diagrama-blanco-18.svg": SVG }) {
  for (const [rel, body] of Object.entries(files)) await store.put(protoPath(id, rel), body, "application/octet-stream");
}

const registerBody = (over: Record<string, unknown> = {}) => ({ id: ID, modelId: modelId(DAE), cruce: CRUCE, svgMaterial: "Blanco 18", nombres: { csv: "gabinete-prueba-canto.csv", dae: "gabinete-prueba-opencutlist.dae" }, ...over });

function setup(store: ImportStore = createMemoryStore(), log = vi.fn()) {
  return { store, log, api: createProtoApi({ store, uploadKey: KEY, now: () => new Date("2026-11-16T12:00:00Z"), log }) };
}

/** Store que anota cada clave y prefijo que se le pide. */
function recording(inner: ImportStore) {
  const touched: string[] = [];
  const store: ImportStore = {
    put: (k, b, c) => (touched.push(k), inner.put(k, b, c)),
    get: (k) => (touched.push(k), inner.get(k)),
    list: (p) => (touched.push(p), inner.list(p)),
    delete: (ks) => (touched.push(...ks), inner.delete(ks)),
  };
  return { store, touched };
}

const state = async (api: ReturnType<typeof setup>["api"], estado: string, motivo?: string) => {
  const res = await api.changeState(req("POST", { estado, motivo }), ID);
  return { status: res.status, body: await res.json() };
};

describe("C11: API del spike con el store en memoria", () => {
  it("sin store o sin clave configurados: 503; sin clave o con clave incorrecta: 401", async () => {
    expect((await createProtoApi({}).register(req("POST", registerBody()))).status).toBe(503);
    expect((await createProtoApi({ store: createMemoryStore() }).register(req("POST", registerBody()))).status).toBe(503);
    const { api } = setup();
    expect((await api.register(req("POST", registerBody(), null))).status).toBe(401);
    expect((await api.register(req("POST", registerBody(), "otra"))).status).toBe(401);
    expect((await api.list(req("GET", undefined, null))).status).toBe(401);
    expect((await api.remove(req("DELETE", undefined, "otra"), ID)).status).toBe(401);
    expect((await api.changeState(req("POST", { estado: "aprobado" }, null), ID)).status).toBe(401);
  });

  it("registro: 201, informe con el sha256 de cada archivo, modelId y listadoId del servidor, y evento en-revision", async () => {
    const { api, store } = setup();
    await upload(store);
    const res = await api.register(req("POST", registerBody()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: ID, estado: "en-revision", link: `/backoffice/csv/${ID}` });

    const read = (await (await api.read(ID)).json()) as { informe: ProtoInforme; eventos: { estado: string }[]; estado: string };
    const sha = (b: Uint8Array) => `sha256:${createHash("sha256").update(b).digest("hex")}`;
    expect(read.informe.archivos).toEqual([
      { path: "diagrama-blanco-18.svg", nombre: "diagrama-blanco-18.svg", bytes: SVG.byteLength, sha256: sha(SVG) },
      { path: "listado.csv", nombre: "gabinete-prueba-canto.csv", bytes: CSV.byteLength, sha256: sha(CSV) },
      { path: "modelo.dae", nombre: "gabinete-prueba-opencutlist.dae", bytes: DAE.byteLength, sha256: sha(DAE) },
    ]);
    expect(read.informe.modelId).toBe(modelId(DAE));
    expect(read.informe.listadoId).toBe(listadoId(parsed.ok ? parsed.listing.pieces : []));
    expect(read.informe.csv).toMatchObject({ status: "publicable", tipos: 4, piezas: 5, edgeTotalMm: 5764 });
    expect(read.informe.validadoEn).toEqual({ csv: "servidor", modelId: "servidor", cruce: "cliente" });
    expect(read.eventos.map((e) => e.estado)).toEqual(["en-revision"]);
    expect(read.estado).toBe("en-revision");
    expect((await api.register(req("POST", registerBody()))).status).toBe(409); // ya registrada
  });

  it("transiciones: publicar antes de aprobar → 409; aprobar → publicar; después nada → 409", async () => {
    const { api, store } = setup();
    await upload(store);
    await api.register(req("POST", registerBody()));
    expect((await state(api, "publicado-simulado")).status).toBe(409);
    expect(await state(api, "aprobado")).toMatchObject({ status: 200, body: { estado: "aprobado" } });
    expect((await state(api, "aprobado")).status).toBe(409);
    expect((await state(api, "rechazado", "tarde")).status).toBe(409);
    expect(await state(api, "publicado-simulado")).toMatchObject({ status: 200, body: { estado: "publicado-simulado" } });
    expect((await state(api, "en-revision")).status).toBe(409);
    const read = (await (await api.read(ID)).json()) as { eventos: { n: number; estado: string }[] };
    expect(read.eventos.map((e) => [e.n, e.estado])).toEqual([
      [1, "en-revision"],
      [2, "aprobado"],
      [3, "publicado-simulado"],
    ]);
  });

  it("rechazar exige motivo; rechazada no se aprueba", async () => {
    const { api, store } = setup();
    await upload(store);
    await api.register(req("POST", registerBody()));
    expect((await state(api, "rechazado")).status).toBe(400);
    expect(await state(api, "rechazado", "medidas mal")).toMatchObject({ status: 200, body: { estado: "rechazado", evento: { motivo: "medidas mal" } } });
    expect((await state(api, "aprobado")).status).toBe(409);
  });

  it("con dudosas (cruce sin canApprove) solo se puede rechazar", async () => {
    const { api, store } = setup();
    await upload(store);
    const cruce = { ...CRUCE, canApprove: false, dudosas: 1, types: CRUCE.types.map((t, i) => (i === 0 ? { ...t, level: "dudosa" as const } : t)) };
    await api.register(req("POST", registerBody({ cruce })));
    expect(await state(api, "aprobado")).toMatchObject({ status: 409, body: { code: "dudosas" } });
    expect((await state(api, "rechazado", "dudosa")).status).toBe(200);
  });

  it("un cruce de otros códigos que el CSV se rechaza (400) y queda sin registrar", async () => {
    const { api, store } = setup();
    await upload(store);
    const res = await api.register(req("POST", registerBody({ cruce: { ...CRUCE, types: CRUCE.types.slice(1) } })));
    expect(res.status).toBe(400);
    expect((await api.read(ID)).status).toBe(404);
  });

  it("archivos: se sirven solo los subidos de una carga registrada", async () => {
    const { api, store } = setup();
    await upload(store);
    expect((await api.file(ID, "modelo.dae")).status).toBe(404); // sin registrar
    await api.register(req("POST", registerBody()));
    const dae = await api.file(ID, "modelo.dae");
    expect(dae.status).toBe(200);
    expect(new Uint8Array(await dae.arrayBuffer())).toEqual(DAE);
    expect(dae.headers.get("content-type")).toBe("model/vnd.collada+xml");
    expect((await api.file(ID, "informe.json")).status).toBe(404); // lo escribe el servidor: no se sirve por acá
    expect((await api.file(ID, "texturas/no-existe.png")).status).toBe(404);
  });

  it("listar y borrar", async () => {
    const { api, store } = setup();
    await upload(store);
    await api.register(req("POST", registerBody()));
    expect(await (await api.list(req("GET"))).json()).toEqual({ cargas: [{ id: ID, registrada: true, estado: "en-revision", fecha: "2026-11-16T12:00:00.000Z" }], tope: MAX_CARGAS });
    expect(await (await api.remove(req("DELETE"), ID)).json()).toEqual({ id: ID, borrados: 5 });
    expect(await store.list(protoDir(ID))).toEqual([]);
    expect((await api.remove(req("DELETE"), ID)).status).toBe(404);
  });
});

describe("C11b: cabeceras de los archivos servidos (Content-Type fijo por nombre permitido, nosniff, CSP)", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  /** El Blob guarda un Content-Type cualquiera (acá, text/html): no se usa. */
  async function registered() {
    const { api, store } = setup();
    const files = { "listado.csv": CSV, "modelo.dae": DAE, "diagrama-blanco-18.svg": SVG, "texturas/blanco.png": PNG, "texturas/gaudi.JPG": PNG };
    for (const [rel, body] of Object.entries(files)) await store.put(protoPath(ID, rel), body, "text/html");
    await api.register(req("POST", registerBody()));
    return api;
  }

  it.each([
    ["diagrama-blanco-18.svg", "image/svg+xml"],
    ["modelo.dae", "model/vnd.collada+xml"],
    ["listado.csv", "text/csv; charset=utf-8"],
    ["texturas/blanco.png", "image/png"],
    ["texturas/gaudi.JPG", "image/jpeg"],
  ])("%s → %s, nosniff y CSP default-src 'none'; sandbox", async (rel, type) => {
    const res = await (await registered()).file(ID, rel);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });

  it("SVG con <script> (sintético): se sirve como image/svg+xml con la CSP que impide ejecutarlo", async () => {
    const { api, store } = setup();
    const evil = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await upload(store, ID, { "listado.csv": CSV, "modelo.dae": DAE, "diagrama-blanco-18.svg": evil });
    await api.register(req("POST", registerBody()));
    const res = await api.file(ID, "diagrama-blanco-18.svg");
    expect([res.headers.get("content-type"), res.headers.get("content-security-policy"), res.headers.get("x-content-type-options")]).toEqual([
      "image/svg+xml",
      "default-src 'none'; sandbox",
      "nosniff",
    ]);
  });
});

describe("C11c: el sha256 del informe no queda desactualizado", () => {
  it("el token se rechaza (409 ya-registrada) para una carga con informe y evento en-revision", async () => {
    const { api, store } = setup();
    await upload(store);
    expect(await api.authorizeUpload(`proto-csv/${ID}/texturas/nueva.png`)).toMatchObject({ allowOverwrite: false });
    await api.register(req("POST", registerBody()));
    expect((await (await api.read(ID)).json()).estado).toBe("en-revision");
    await expect(api.authorizeUpload(`proto-csv/${ID}/texturas/nueva.png`)).rejects.toMatchObject({ status: 409, code: "ya-registrada" });
    await expect(api.authorizeUpload(`proto-csv/${ID}/listado.csv`)).rejects.toMatchObject({ status: 409, code: "ya-registrada" });
  });

  it("token pedido antes del registro y subido después: el archivo nuevo no está en el informe y no se sirve", async () => {
    const { api, store } = setup();
    await upload(store);
    await api.register(req("POST", registerBody()));
    await store.put(protoPath(ID, "texturas/tarde.png"), new Uint8Array([1, 2, 3]), "image/png");
    expect((await api.file(ID, "texturas/tarde.png")).status).toBe(404);
  });

  it("un archivo con bytes distintos de los registrados (store alterado, sintético) da 409 y no se sirve", async () => {
    const memory = createMemoryStore();
    let tamper = false;
    const store: ImportStore = {
      ...memory,
      get: async (k) => {
        const file = await memory.get(k);
        return tamper && file && k.endsWith("modelo.dae") ? { body: new Uint8Array([...file.body, 0x20]) } : file;
      },
    };
    const { api } = setup(store);
    await upload(memory);
    await api.register(req("POST", registerBody()));
    tamper = true;
    expect(await (await api.file(ID, "modelo.dae")).json()).toMatchObject({ code: "archivo-alterado" });
  });
});

describe("C11d: cargas incompletas", () => {
  it("una carga subida y sin registrar aparece en la lista (registrada: false) y se puede borrar", async () => {
    const { api, store } = setup();
    await upload(store, ID, { "listado.csv": CSV });
    expect(await (await api.list(req("GET"))).json()).toEqual({ cargas: [{ id: ID, registrada: false, estado: null, fecha: null }], tope: MAX_CARGAS });
    expect(await (await api.remove(req("DELETE"), ID)).json()).toEqual({ id: ID, borrados: 1 });
    expect(await (await api.list(req("GET"))).json()).toEqual({ cargas: [], tope: MAX_CARGAS });
  });
});

describe("C13: todo queda bajo proto-csv/ (P3)", () => {
  it.each([
    ["importaciones/0123456789abcdef/modelo.dae"],
    ["proto-csv/../importaciones/0123456789abcdef/modelo.dae"],
    ["proto-csv/0123456789abcdef/../../importaciones/x/modelo.dae"],
    ["proto-csv/0123456789abcdef//modelo.dae"],
    ["proto-csv/0123456789abcdef/sub\\modelo.dae"],
    ["proto-csv/0123456789ABCDEF/modelo.dae"],
    ["proto-csv/123/modelo.dae"],
    ["otra-cosa/0123456789abcdef/listado.csv"],
    ["proto-csv/0123456789abcdef/mueble.json"],
    ["proto-csv/0123456789abcdef/texturas/a.exe"],
    ["/proto-csv/0123456789abcdef/listado.csv"],
  ])("parseProtoKey rechaza %s", (key) => {
    expect(() => parseProtoKey(key)).toThrow(ProtoPathError);
  });

  it("protoPath rechaza id inválido y rutas que escapan", () => {
    expect(() => protoPath("../importaciones", "modelo.dae")).toThrow(ProtoPathError);
    expect(() => protoPath(ID, "../modelo.dae")).toThrow(ProtoPathError);
    expect(() => protoPath(ID, "texturas/../../x.png")).toThrow(ProtoPathError);
    expect(protoPath(ID, "texturas/blanco_nature.jpg")).toBe(`proto-csv/${ID}/texturas/blanco_nature.jpg`);
  });

  it("scopedStore falla ante claves y prefijos fuera de proto-csv/ sin tocar el store", async () => {
    const inner = recording(createMemoryStore());
    const s = scopedStore(inner.store);
    await expect(s.put("importaciones/0123456789abcdef/listado.csv", "x", "text/csv")).rejects.toThrow(ProtoPathError);
    await expect(s.get("importaciones/0123456789abcdef/mueble.json")).rejects.toThrow(ProtoPathError);
    await expect(s.list("importaciones/")).rejects.toThrow(ProtoPathError);
    await expect(s.list("")).rejects.toThrow(ProtoPathError);
    await expect(s.delete([`proto-csv/${ID}/listado.csv`, "importaciones/0123456789abcdef/mueble.json"])).rejects.toThrow(ProtoPathError);
    expect(inner.touched).toEqual([]);
  });

  it("authorizeUpload: solo archivos que sube el navegador, dentro de proto-csv/", async () => {
    const { api } = setup();
    await expect(api.authorizeUpload("importaciones/0123456789abcdef/modelo.dae")).rejects.toThrow(ProtoPathError);
    await expect(api.authorizeUpload(`proto-csv/${ID}/informe.json`)).rejects.toMatchObject({ code: "path" });
    await expect(api.authorizeUpload(`proto-csv/${ID}/eventos/0001-aprobado.json`)).rejects.toMatchObject({ code: "path" });
    expect(await api.authorizeUpload(`proto-csv/${ID}/modelo.dae`)).toEqual({ maximumSizeInBytes: 10 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: false });
  });

  it("un flujo completo solo pide claves bajo proto-csv/ y no toca las importaciones del mismo store", async () => {
    const inner = createMemoryStore();
    const foreign = "importaciones/aaaaaaaaaaaaaaaa/mueble.json";
    await inner.put(foreign, "{}", "application/json");
    const rec = recording(inner);
    const { api } = setup(rec.store);
    await upload(inner);
    await api.authorizeUpload(`proto-csv/${OTHER}/listado.csv`);
    await api.register(req("POST", registerBody()));
    await state(api, "aprobado");
    await state(api, "publicado-simulado");
    await api.list(req("GET"));
    await api.read(ID);
    await api.file(ID, "modelo.dae");
    await api.file(ID, "../../importaciones/aaaaaaaaaaaaaaaa/mueble.json");
    await api.remove(req("DELETE"), ID);

    expect(rec.touched.length).toBeGreaterThan(10);
    expect(rec.touched.filter((k) => !k.startsWith("proto-csv/"))).toEqual([]);
    expect(await inner.list("importaciones/")).toEqual([foreign]);
    expect((await api.file(ID, "../../importaciones/aaaaaaaaaaaaaaaa/mueble.json")).status).toBe(404);
  });

  it("archivo con ruta que escapa: 400 (ProtoPathError), no se lee", async () => {
    const { api, store } = setup();
    await upload(store);
    await api.register(req("POST", registerBody()));
    expect((await api.file(ID, "../../importaciones/aaaaaaaaaaaaaaaa/mueble.json")).status).toBe(400);
  });
});

describe("C15: rechazo del servidor con limpieza", () => {
  it("CSV con encabezado inválido (Lista de instancias): 422 y no queda nada bajo proto-csv/<id>/", async () => {
    const { api, store } = setup();
    await upload(store, ID, { "listado.csv": new Uint8Array(readFileSync(path.join(DIR, "gabinete-prueba-listainstancias.csv"))), "modelo.dae": DAE });
    const res = await api.register(req("POST", registerBody()));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "lista-de-instancias", limpieza: "hecha" });
    expect(await store.list(protoDir(ID))).toEqual([]);
  });

  it(".dae distinto del validado en el navegador (modelId): 422 y no queda nada", async () => {
    const { api, store } = setup();
    await upload(store);
    const res = await api.register(req("POST", registerBody({ modelId: "sha256:otro" })));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "modelo-distinto", limpieza: "hecha" });
    expect(await store.list(protoDir(ID))).toEqual([]);
  });

  it("si el borrado falla: la carga sigue existiendo, cuenta para el tope de 20 y el fallo queda en el log", async () => {
    const memory = createMemoryStore();
    const failing: ImportStore = { ...memory, delete: async () => Promise.reject(new Error("Blob no disponible")) };
    const { api, log } = setup(failing);
    for (let i = 1; i < MAX_CARGAS; i++) await upload(memory, i.toString(16).padStart(16, "0"), { "listado.csv": CSV }); // 19 cargas sin registrar
    await upload(memory);
    const res = await api.register(req("POST", registerBody({ modelId: "sha256:otro" })));
    expect(await res.json()).toMatchObject({ code: "modelo-distinto", limpieza: "fallida" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`no se pudo borrar la carga rechazada ${ID} (modelo-distinto)`));
    expect((await memory.list(protoDir(ID))).length).toBe(3);
    // 20 prefijos (con o sin informe.json): una carga nueva no entra; una existente sí puede seguir subiendo.
    await expect(api.authorizeUpload(`proto-csv/${OTHER}/listado.csv`)).rejects.toMatchObject({ status: 409, code: "limite" });
    await expect(api.authorizeUpload(`proto-csv/${ID}/modelo.dae`)).resolves.toMatchObject({ allowOverwrite: false });
  });

  it("con 19 cargas, la vigésima entra (el tope es 20)", async () => {
    const { api, store } = setup();
    for (let i = 1; i < MAX_CARGAS; i++) await upload(store, i.toString(16).padStart(16, "0"), { "listado.csv": CSV });
    await expect(api.authorizeUpload(`proto-csv/${OTHER}/listado.csv`)).resolves.toBeDefined();
  });
});

describe("C11e: aprobar con advertencias", () => {
  const C04 = "0001-01-M01-C04";
  /** Sintético: el CSV del gabinete con C04 × 2 (el .dae tiene 1): C04 sale advertencia (faltante + cantidad). */
  const CSV_ADV = new TextEncoder().encode(new TextDecoder().decode(CSV).replace(/^(A;0001-01-M01-C04;)1;/m, "$12;"));
  const parsedAdv = parseOclCsv(new TextDecoder().decode(CSV_ADV));
  if (!parsedAdv.ok) throw new Error("variante");
  const CRUCE_ADV = summarizeReview(reviewListing(parsedAdv.listing, observeDae(DAE), 2));

  async function registeredWith(cruce: unknown = CRUCE_ADV) {
    const { api, store } = setup();
    await upload(store, ID, { "listado.csv": CSV_ADV, "modelo.dae": DAE });
    expect((await api.register(req("POST", registerBody({ cruce, svgMaterial: null })))).status).toBe(201);
    return api;
  }
  const events = async (api: Awaited<ReturnType<typeof registeredWith>>) => ((await (await api.read(ID)).json()) as { eventos: Record<string, unknown>[] }).eventos;

  it("el cruce del cliente trae el nivel advertencia y su contador", () => {
    expect(CRUCE_ADV.types.find((t) => t.code === C04)?.level).toBe("advertencia");
    expect([CRUCE_ADV.dudosas, CRUCE_ADV.advertencias, CRUCE_ADV.canApprove]).toEqual([0, 1, true]);
  });

  it("sin motivo (o solo espacios): 400 motivo, y sigue en revisión", async () => {
    const api = await registeredWith();
    expect(await state(api, "aprobado")).toMatchObject({ status: 400, body: { code: "motivo" } });
    expect(await state(api, "aprobado", "   ")).toMatchObject({ status: 400, body: { code: "motivo" } });
    expect((await events(api)).map((e) => e.estado)).toEqual(["en-revision"]);
  });

  it("con motivo: 200 y el evento aprobado trae el motivo y advertenciasAceptadas (código y razones) leídas de informe.cruce", async () => {
    const api = await registeredWith();
    const falsa = [{ code: "0001-01-M01-C01", reasons: [{ source: "cruce", reason: "inventada" }] }];
    const res = await api.changeState(req("POST", { estado: "aprobado", motivo: " C04 se arma con otra placa ", advertenciasAceptadas: falsa }), ID);
    expect(res.status).toBe(200);
    const aprobado = (await events(api)).find((e) => e.estado === "aprobado");
    expect(aprobado).toMatchObject({ motivo: "C04 se arma con otra placa" });
    const aceptadas = aprobado?.advertenciasAceptadas as { code: string; reasons: { source: string; reason: string }[] }[];
    expect(aceptadas.map((a) => a.code)).toEqual([C04]); // lo del cuerpo se ignora
    expect(aceptadas[0].reasons).toEqual(expect.arrayContaining([{ source: "motor", reason: "faltante" }, { source: "cruce", reason: "cantidad-no-coincide" }]));
    expect(aceptadas[0].reasons).toEqual(CRUCE_ADV.types.find((t) => t.code === C04)?.reasons);
  });

  it("con dudosas: 409 dudosas (aunque haya motivo); solo se puede rechazar", async () => {
    const cruce = { ...CRUCE_ADV, canApprove: false, dudosas: 1, types: CRUCE_ADV.types.map((t) => (t.code === "0001-01-M01-C01" ? { ...t, level: "dudosa" as const } : t)) };
    const api = await registeredWith(cruce);
    expect(await state(api, "aprobado", "lo acepto")).toMatchObject({ status: 409, body: { code: "dudosas" } });
    expect((await state(api, "rechazado", "dudosa")).status).toBe(200);
  });

  it("sin advertencias el motivo sigue siendo opcional y el evento no trae advertenciasAceptadas", async () => {
    const { api, store } = setup();
    await upload(store);
    await api.register(req("POST", registerBody()));
    expect((await state(api, "aprobado")).status).toBe(200);
    const evento = ((await (await api.read(ID)).json()) as { eventos: Record<string, unknown>[] }).eventos.find((e) => e.estado === "aprobado");
    expect(evento).not.toHaveProperty("advertenciasAceptadas");
  });

  it("un cruce con formato anterior (sin contador advertencias, niveles segura y dudosa) sigue siendo válido", async () => {
    const { advertencias: _omit, ...viejo } = CRUCE;
    void _omit;
    const api = await registeredWith({ ...viejo, types: CRUCE.types });
    // CSV_ADV tiene los mismos códigos que el CSV original: el registro pasa y, sin advertencias, aprobar no exige motivo.
    expect((await state(api, "aprobado")).status).toBe(200);
  });

  it("un nivel desconocido en el cruce se rechaza (400)", async () => {
    const { api, store } = setup();
    await upload(store, ID, { "listado.csv": CSV_ADV, "modelo.dae": DAE });
    const cruce = { ...CRUCE_ADV, types: CRUCE_ADV.types.map((t, i) => (i === 0 ? { ...t, level: "tal-vez" } : t)) };
    expect((await api.register(req("POST", registerBody({ cruce })))).status).toBe(400);
  });
});
