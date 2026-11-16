// Pantallas del spike montadas de verdad (React DOM en jsdom) contra la API real del spike con el store en memoria.
// `fetch` se redirige a los handlers de `createProtoApi`: no hay red. El visor 3D (next/dynamic) se reemplaza por un
// marcador: WebGL no corre en jsdom. Cubre los estados pedidos: en revisión con dudosas, en revisión limpia,
// aprobado, publicado (simulado), rechazado; y la lista con cargas incompletas.
// Con DUMP_SCREENS=1 imprime el texto de cada pantalla (para describirlas sin capturas).

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { modelId } from "@/engine/hash";
import { createMemoryStore } from "@/importer/store";
import { observeDae } from "@/model/observe";
import { createProtoApi } from "@/proto-csv/api";
import { setUploadKey } from "@/proto-csv/keyStore";
import { parseOclCsv } from "@/proto-csv/parse";
import { protoPath } from "@/proto-csv/paths";
import { reviewListing, summarizeReview } from "@/proto-csv/review";

vi.mock("next/dynamic", () => ({ default: () => () => createElement("div", { "data-testid": "visor" }, "[visor 3D]") }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { CsvReviewScreen } = await import("@/components/proto-csv/CsvReviewScreen");
const { CsvPublishScreen } = await import("@/components/proto-csv/CsvPublishScreen");
const { CsvBackoffice } = await import("@/components/proto-csv/CsvBackoffice");

const DIR = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const CSV = readFileSync(path.join(DIR, "gabinete-prueba-canto.csv"), "utf8");
const CSV_DUDOSA = CSV.replace(/^(A;0001-01-M01-C04;)1;/m, "$12;"); // sintético: C04 × 2
const DAE = new Uint8Array(readFileSync(path.join(DIR, "gabinete-prueba-opencutlist.dae")));
const KEY = "clave";
const store = createMemoryStore();
const api = createProtoApi({ store, uploadKey: KEY });
const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "x-import-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body) });

async function seed(id: string, csv: string, steps: { estado: string; motivo?: string }[]) {
  await store.put(protoPath(id, "listado.csv"), new TextEncoder().encode(csv), "text/csv");
  await store.put(protoPath(id, "modelo.dae"), DAE, "model/vnd.collada+xml");
  const parsed = parseOclCsv(csv);
  if (!parsed.ok) throw new Error(parsed.message);
  const cruce = summarizeReview(reviewListing(parsed.listing, observeDae(DAE), 2));
  expect((await api.register(post("/api/proto-csv", { id, modelId: modelId(DAE), cruce }))).status).toBe(201);
  for (const step of steps) expect((await api.changeState(post("", step), id)).status).toBe(200);
}

/** fetch del navegador → handlers del spike (sin red). */
async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), "http://localhost");
  const request = new Request(url, init);
  const parts = url.pathname.split("/").filter(Boolean); // api, proto-csv, id?, ...
  if (parts[0] !== "api" || parts[1] !== "proto-csv") throw new Error(`fetch inesperado: ${url.pathname}`);
  const id = parts[2];
  if (!id) return request.method === "GET" ? api.list(request) : api.register(request);
  if (parts[3] === "archivo") return api.file(id, parts.slice(4).join("/"));
  if (parts[3] === "estado") return api.changeState(request, id);
  return request.method === "DELETE" ? api.remove(request, id) : api.read(id);
}

let root: Root;
let container: HTMLDivElement;
const text = () => (container.textContent ?? "").replace(/\s+/g, " ");
const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

async function mount(node: ReactNode, waitFor: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  await vi.waitFor(() => expect(text()).toContain(waitFor), { timeout: 15000, interval: 50 });
  if (process.env.DUMP_SCREENS) console.log(`\n===== ${waitFor}\n${text()}`);
}
async function unmount() {
  await act(async () => root.unmount());
  container.remove();
}

/**
 * jsdom 24 no implementa `Blob.text()` ni `Blob.arrayBuffer()` (los navegadores sí). Solo para esta prueba se
 * completan con `FileReader`, que jsdom sí tiene. La app no cambia.
 */
function polyfillBlobReaders() {
  const read = <T>(blob: Blob, kind: "text" | "buffer") =>
    new Promise<T>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as T);
      reader.onerror = () => reject(reader.error);
      if (kind === "text") reader.readAsText(blob);
      else reader.readAsArrayBuffer(blob);
    });
  const proto = Blob.prototype as Blob & { text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof proto.text !== "function") proto.text = function (this: Blob) { return read<string>(this, "text"); };
  if (typeof proto.arrayBuffer !== "function") proto.arrayBuffer = function (this: Blob) { return read<ArrayBuffer>(this, "buffer"); };
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  polyfillBlobReaders();
  vi.stubGlobal("fetch", route);
  await seed("a1a1a1a1a1a1a1a1", CSV, []);
  await seed("b2b2b2b2b2b2b2b2", CSV_DUDOSA, []);
  await seed("c3c3c3c3c3c3c3c3", CSV, [{ estado: "aprobado" }]);
  await seed("d4d4d4d4d4d4d4d4", CSV, [{ estado: "aprobado" }, { estado: "publicado-simulado" }]);
  await seed("e5e5e5e5e5e5e5e5", CSV_DUDOSA, [{ estado: "rechazado", motivo: "C04 dos veces en el CSV: reexportar" }]);
  await store.put(protoPath("f6f6f6f6f6f6f6f6", "listado.csv"), new TextEncoder().encode(CSV), "text/csv");
}, 60000);
afterAll(() => {
  vi.unstubAllGlobals();
  setUploadKey("");
});

describe("Pantallas del spike (React DOM + API en memoria)", () => {
  it("en revisión con dudosas: C04 dudosa con sus razones, Aprobar deshabilitado con el motivo, Rechazar pide motivo", async () => {
    setUploadKey(KEY);
    await mount(createElement(CsvReviewScreen, { id: "b2b2b2b2b2b2b2b2" }), "Decisión");
    expect(text()).toContain("En revisión");
    expect(text()).toContain("No se puede aprobar: 1 pieza dudosa.");
    expect(text()).toContain("el .dae tiene menos instancias que la cantidad del CSV");
    expect(text()).toContain("la cantidad del CSV no coincide con el .dae");
    expect(text()).toMatch(/0001-01-M01-C04.*2 \/ 1/);
    expect(text()).toContain("[visor 3D]");
    expect(button("Aprobar")?.disabled).toBe(true);
    expect(button("Rechazar")?.disabled).toBe(true); // sin motivo
    await unmount();
  }, 30000);

  it("en revisión limpia: 4 seguras, comparación CSV vs .dae, esquema de canteado, Aprobar habilitado con la clave", async () => {
    await mount(createElement(CsvReviewScreen, { id: "a1a1a1a1a1a1a1a1" }), "Decisión");
    expect(text()).not.toContain("No se puede aprobar");
    expect(text()).not.toContain("dudosa ");
    expect(container.querySelectorAll("tbody tr").length).toBeGreaterThanOrEqual(4);
    expect(text()).toContain("CSV contra .dae");
    expect(text()).toContain("Esquema de canteado");
    expect(container.querySelector('svg[role="img"]')?.getAttribute("aria-label")).toMatch(/Esquema de la pieza/);
    expect(button("Aprobar")?.disabled).toBe(false);
    await act(async () => button("Aprobar")?.click());
    await vi.waitFor(() => expect(text()).toContain("Ir a publicar (simulado)"), { timeout: 15000 });
    await unmount();
  }, 30000);

  it("aprobado: link a publicar y sin botones de decisión", async () => {
    await mount(createElement(CsvReviewScreen, { id: "c3c3c3c3c3c3c3c3" }), "Ir a publicar (simulado)");
    expect(button("Aprobar")).toBeUndefined();
    expect(button("Rechazar")).toBeUndefined();
    await unmount();
  }, 30000);

  it("publicado (simulado): 4 URL de QR como texto, 5 etiquetas con VISTA PREVIA — NO SE IMPRIME, sin imagen", async () => {
    await mount(createElement(CsvPublishScreen, { id: "d4d4d4d4d4d4d4d4" }), "Etiquetas, una por pieza física (5)");
    expect(text()).toContain("Un QR por tipo de pieza (4)");
    expect(text().match(/https:\/\/taller-test\.casamueble\.com\.ar\/q\/d4d4d4d4-c0\d/g)?.length).toBe(4 + 5);
    expect(container.querySelectorAll("article").length).toBe(5);
    expect([...container.querySelectorAll("article")].every((a) => a.textContent?.includes("VISTA PREVIA — NO SE IMPRIME"))).toBe(true);
    expect(container.querySelectorAll("img, canvas").length).toBe(0);
    await unmount();
  }, 30000);

  it("rechazado: muestra el motivo y la carga queda cerrada", async () => {
    await mount(createElement(CsvReviewScreen, { id: "e5e5e5e5e5e5e5e5" }), "Rechazada");
    expect(text()).toContain("«C04 dos veces en el CSV: reexportar»");
    expect(button("Aprobar")).toBeUndefined();
    await unmount();
  }, 30000);

  it.each([
    ["lista de instancias (fixture real)", readFileSync(path.join(DIR, "gabinete-prueba-listainstancias.csv"), "utf8"), "«Lista de instancias»", "cambiá la fuente a «Listado de piezas»"],
    ["sin «Ancho de borde 2» (sintético)", CSV.replace(/;Ancho de borde 2/, ";Columna borrada"), "Falta una columna", "desmarcá «ocultar la columna de cantos»"],
    ["Longitud en cm (sintético)", CSV.replace("800,0 mm;400,0 mm;18,0 mm", "80,0 cm;400,0 mm;18,0 mm"), "no están en milímetros", "Unidades: elegí milímetros"],
  ])("subida, rechazo «%s»: título, mensaje y qué hacer; no deja subir", async (_name, csv, title, fix) => {
    setUploadKey(KEY);
    await mount(createElement(CsvBackoffice, { configured: true }), "Backoffice: nueva carga");
    const [csvInput, daeInput] = [...container.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    const choose = async (input: HTMLInputElement, file: File) => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    };
    await choose(csvInput, new File([csv], "listado.csv", { type: "text/csv" }));
    // El rechazo aparece apenas se elige el CSV, sin esperar al .dae.
    await vi.waitFor(() => expect(text()).toContain("Carga rechazada"), { timeout: 15000 });
    await choose(daeInput, new File([DAE], "modelo.dae"));
    await vi.waitFor(() => expect(text()).toContain("Carga rechazada"), { timeout: 15000 });
    if (process.env.DUMP_SCREENS) console.log(`\n===== rechazo ${_name}\n${container.querySelector('[role="alert"]')?.textContent}`);
    expect(text()).toContain(title);
    expect(text()).toContain(`Qué hacer: `);
    expect(text()).toContain(fix);
    expect(button("Subir y pasar a revisión")?.disabled).toBe(true);
    await unmount();
  }, 30000);

  it("backoffice: la lista muestra la carga incompleta con su botón Borrar", async () => {
    await mount(createElement(CsvBackoffice, { configured: true }), "Cargas guardadas");
    await act(async () => button("Ver cargas")?.click());
    await vi.waitFor(() => expect(text()).toContain("incompleta (sin registrar)"), { timeout: 15000 });
    if (process.env.DUMP_SCREENS) console.log(`\n===== lista\n${text()}`);
    expect(text()).toContain("6 de 20");
    expect([...container.querySelectorAll("li")].filter((li) => li.textContent?.includes("f6f6f6f6f6f6f6f6") && li.querySelector("button")?.textContent === "Borrar")).toHaveLength(1);
    await unmount();
  }, 30000);
});
