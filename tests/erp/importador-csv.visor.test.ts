// TIC-8 y TIC-9 (docs/spec-importador-csv-envio.md §6): el mueble del visor embebido sale del listado del CSV
// (`defDesdeListadoErp`, IC-8) y se cruza con el .dae en el navegador (`cruceErp`, IC-9).

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pedirListado } from "@/components/erp/pedirListado";
import { olmoDef } from "@/data/furniture.mock";
import { leerCsvDelEnvio, type ListadoDelEnvio } from "@/lib/csv-ocl/envio";
import { cruceErp, defDesdeListadoErp, defDesdeModeloErp } from "@/lib/erp/defErp";
import { CSV_SIMULADO } from "../../erp-simulado/erp";
import { loadDaeModel } from "../helpers/loadModel";

const OLMO_DAE = path.resolve(__dirname, "..", "..", "public", "models", "Olmo", "olmo.dae");
const GABINETE = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const TRABAJO = "0F1E2D3C-4B5A-4000-8000-000000000001";
const opciones = { trabajoUuid: TRABAJO, nombre: "Modelo del ERP" };

function listadoDe(texto: string | Uint8Array): ListadoDelEnvio {
  const l = leerCsvDelEnvio(typeof texto === "string" ? new TextEncoder().encode(texto) : texto);
  if (!l.ok) throw new Error(l.mensaje);
  return l.listado;
}

describe("TIC-8: defDesdeListadoErp + cruceErp con el Olmo", () => {
  const modelo = loadDaeModel(OLMO_DAE);
  const listado = listadoDe(CSV_SIMULADO);
  const def = defDesdeListadoErp(modelo, listado, opciones);

  it("21 tipos con los mismos qrId que defDesdeModeloErp; nombre, medidas, material, cantidad y canteado del CSV", () => {
    const desdeModelo = defDesdeModeloErp(modelo, opciones);
    expect(def.pieceTypes.map((p) => p.qrId)).toEqual(desdeModelo.pieceTypes.map((p) => p.qrId));
    expect(def.furniture.qrId).toBe(desdeModelo.furniture.qrId);
    expect(def.modules).toEqual(desdeModelo.modules);
    for (const p of def.pieceTypes) {
      const o = olmoDef.pieceTypes.find((x) => x.code === p.code)!;
      expect(p, p.code).toMatchObject({ name: o.name, lengthMm: o.lengthMm, widthMm: o.widthMm, thicknessMm: o.thicknessMm, material: o.material, quantity: o.quantity });
      expect([...(p.edgeBanding ?? [])].sort(), p.code).toEqual([...(o.edgeBanding ?? [])].sort());
    }
    expect(def.furniture.edgeBandSpec).toMatchObject({ type: "ABS", widthMm: 22, thicknessMm: 0.2, status: "provisorio" });
  });

  it("el cruce con el .dae no da diferencias", () => {
    expect(cruceErp(modelo, def)).toEqual({ coincide: true, diferencias: [] });
  });

  it("con una cantidad cambiada, el cruce lo dice", () => {
    const cambiado = { piezas: listado.piezas.map((p) => (p.codigo === "0001-01-M01-C04" ? { ...p, cantidad: 3 } : p)) };
    const cruce = cruceErp(modelo, defDesdeListadoErp(modelo, cambiado, opciones));
    expect(cruce.coincide).toBe(false);
    expect(cruce.diferencias.join("\n")).toMatch(/0001-01-M01-C04: el listado dice 3/);
  });

  it("una pieza del .dae que no está en el listado aparece como diferencia", () => {
    const sinC21 = { piezas: listado.piezas.filter((p) => p.codigo !== "0001-01-M01-C21") };
    const cruce = cruceErp(modelo, defDesdeListadoErp(modelo, sinC21, opciones));
    expect(cruce.diferencias.some((d) => /C21#\d+: la pieza del modelo 3D no está en el listado/.test(d))).toBe(true);
  });

  it("nombre vacío en el CSV → «Pieza C04» (ASUMIDO, como defDesdeModeloErp)", () => {
    const sinNombre = { piezas: listado.piezas.map((p) => ({ ...p, nombre: "" })) };
    const d = defDesdeListadoErp(modelo, sinNombre, opciones);
    expect(d.pieceTypes.every((p) => /^Pieza C\d{2}$/.test(p.name))).toBe(true);
  });
});

describe("TIC-9: cruceErp con el gabinete (.dae y CSV reales de OpenCutList)", () => {
  it("sin diferencias", () => {
    const modelo = loadDaeModel(path.join(GABINETE, "gabinete-prueba-opencutlist.dae"));
    const listado = listadoDe(new Uint8Array(readFileSync(path.join(GABINETE, "gabinete-prueba-canto.csv"))));
    const def = defDesdeListadoErp(modelo, listado, opciones);
    expect(def.pieceTypes).toHaveLength(4);
    expect(cruceErp(modelo, def)).toEqual({ coincide: true, diferencias: [] });
  });
});

describe("IC-8 (revisión del 21/11): pedirListado distingue «sin listado» de «no se pudo leer»", () => {
  const T = "0f1e2d3c-4b5a-4000-8000-000000000001";
  const responder = (status: number, cuerpo: unknown) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } }));
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["404 sin-listado del mismo trabajo", responder(404, { error: "sin-listado", trabajoUuid: T }), { tipo: "sin-listado" }],
    ["404 sin-listado de otro trabajo", responder(404, { error: "sin-listado", trabajoUuid: "otro" }), { tipo: "error", motivo: "otro-trabajo" }],
    ["404 no-encontrado", responder(404, { error: "no-encontrado" }), { tipo: "error", motivo: "red" }],
    ["401", responder(401, { error: "no-autenticada" }), { tipo: "error", motivo: "no-autenticada" }],
    ["500", responder(500, {}), { tipo: "error", motivo: "red" }],
    ["listado de otro trabajo", responder(200, { trabajoUuid: "otro", piezas: [] }), { tipo: "error", motivo: "otro-trabajo" }],
    ["red cortada", vi.fn(async () => { throw new TypeError("failed to fetch"); }), { tipo: "error", motivo: "red" }],
  ] as const)("%s", async (_caso, fetchFalso, esperado) => {
    vi.stubGlobal("fetch", fetchFalso);
    expect(await pedirListado("5e1a0000-0000-4000-8000-000000000142", T)).toEqual(esperado);
  });

  it("200 del mismo trabajo: el listado", async () => {
    const cuerpo = { trabajoUuid: T, listadoId: "sha256:x", piezas: [], tipos: 0, piezasTotales: 0, metrosCanto: 0, avisos: [] };
    vi.stubGlobal("fetch", responder(200, cuerpo));
    expect(await pedirListado("5e1a0000-0000-4000-8000-000000000142", T)).toEqual({ tipo: "listado", listado: cuerpo });
  });
});
