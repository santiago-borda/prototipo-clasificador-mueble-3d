// TIC-8 y TIC-9 (docs/spec-importador-csv-envio.md §6): el mueble del visor embebido sale del listado del CSV
// (`defDesdeListadoErp`, IC-8) y se cruza con el .dae en el navegador (`cruceErp`, IC-9).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
