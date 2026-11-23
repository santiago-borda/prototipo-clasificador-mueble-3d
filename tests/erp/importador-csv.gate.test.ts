// Revisión del 21/11 (docs/spec-importador-csv-envio.md IC-8): ModeloErpGate no reutiliza la clave ni el cruce de un
// trabajo anterior cuando el proyecto ya tiene otro trabajo vigente (llegó un envío nuevo en la misma sesión del
// navegador). Monta el componente real con un servidor falso (sin red).

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claveDelProyecto, cruceDelProyecto, ModeloErpGate } from "@/components/erp/ModeloErpGate";
import { leerCsvDelEnvio } from "@/lib/csv-ocl/envio";
import { claveErp } from "@/lib/erp/defErp";
import { CSV_SIMULADO } from "../../erp-simulado/erp";

vi.mock("@/components/ViewerLayout", () => ({ ViewerLayout: ({ children }: { children: unknown }) => createElement("div", { "data-visor": "1" }, children as never) }));

// Sin `children` en las props: lint pide pasarlos como argumento de createElement.
const Gate = ModeloErpGate as unknown as (props: { proyectoUuid: string }) => ReactNode;
const DAE = readFileSync(path.resolve(__dirname, "..", "..", "public", "models", "Olmo", "olmo.dae"), "utf8");
const P = "aaaaaaaa-0000-4000-8000-000000000001";
const T1 = "0f1e2d3c-4b5a-4000-8000-000000000001";
const T2 = "1a2b3c4d-5e6f-4000-8000-000000000002";
const lectura = leerCsvDelEnvio(new TextEncoder().encode(CSV_SIMULADO));
if (!lectura.ok) throw new Error(lectura.mensaje);
const BUENO = lectura.listado;

describe("ModeloErpGate: cambia el trabajo vigente del proyecto", () => {
  let vigente = T1;
  let root: Root;
  let contenedor: HTMLElement;
  const pedidos: string[] = [];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vigente = T1;
    pedidos.length = 0;
    URL.createObjectURL = vi.fn(() => "blob:falso");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        pedidos.push(url);
        const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200, headers: { "content-type": "application/json" } });
        if (url.endsWith("/modelo")) return new Response(DAE, { status: 200, headers: { "x-ucp-trabajo": vigente } });
        if (url.endsWith("/listado")) {
          // El trabajo 2 trae una cantidad distinta de C04: su cruce con el .dae no coincide.
          const piezas = BUENO.piezas.map((p) => (vigente === T2 && p.codigo === "0001-01-M01-C04" ? { ...p, cantidad: 3 } : p));
          return json({ trabajoUuid: vigente, listadoId: "x", piezas, tipos: BUENO.tipos, piezasTotales: BUENO.piezasTotales, metrosCanto: BUENO.metrosCanto, avisos: [] });
        }
        return json({ modelo: { trabajoUuid: vigente, nombre: "modelo.dae", version: 1 } });
      }),
    );
    contenedor = document.createElement("div");
    root = createRoot(contenedor);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  const montar = async () => {
    await act(async () => root.render(createElement(Gate, { proyectoUuid: P }, createElement("p", { id: "ficha" }, "ficha"))));
    await vi.waitFor(() => expect(contenedor.querySelector("#ficha")).not.toBeNull(), { timeout: 15000 });
  };

  it("al volver a montar con otro trabajo vigente, la clave y el cruce son los del trabajo nuevo", async () => {
    await montar();
    expect(claveDelProyecto(P)).toBe(claveErp(T1));
    expect(cruceDelProyecto(P)?.coincide).toBe(true);

    act(() => root.unmount());
    root = createRoot(contenedor);
    vigente = T2;
    await montar();
    expect(claveDelProyecto(P)).toBe(claveErp(T2));
    expect(cruceDelProyecto(P)?.coincide).toBe(false);
  }, 30000);

  it("con el mismo trabajo vigente, no vuelve a bajar el modelo (vuelta del visor a la ficha)", async () => {
    await montar();
    act(() => root.unmount());
    root = createRoot(contenedor);
    const antes = pedidos.filter((u) => u.endsWith("/modelo")).length;
    await montar();
    expect(pedidos.filter((u) => u.endsWith("/modelo")).length).toBe(antes);
    expect(claveDelProyecto(P)).toBe(claveErp(T1));
  }, 30000);
});
