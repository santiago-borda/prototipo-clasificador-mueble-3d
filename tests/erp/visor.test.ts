// IE-5: mueble del visor armado con el .dae guardado y links dentro del iframe. TIE-21 (spec v0.3): /p/<qrId> sigue
// accesible sin sesión, igual que S2A PB-15, con la integración encendida.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QrPage from "@/app/p/[qrId]/page";
import { createRegistry } from "@/data/registry";
import { olmoDef } from "@/data/furniture.mock";
import { claveErp, defDesdeModeloErp } from "@/lib/erp/defErp";
import { frameAncestors, reglasDeFraming } from "@/lib/erp/origenes";
import { getErpFurnitureDef, qrHref, registerErpFurniture, registerImportedFurniture, resolveQr } from "@/lib/lookup";
import { closePersistence } from "@/server/datos";
import { loadDaeModel } from "../helpers/loadModel";

const OLMO_DAE = path.resolve(__dirname, "..", "..", "public", "models", "Olmo", "olmo.dae");
const TRABAJO = "0F1E2D3C-4B5A-4000-8000-000000000001";

afterEach(async () => {
  vi.unstubAllEnvs();
  await closePersistence();
});

describe("defDesdeModeloErp: el mueble del visor sale del .dae", () => {
  const def = defDesdeModeloErp(loadDaeModel(OLMO_DAE), { trabajoUuid: TRABAJO, nombre: "Modelo del ERP" });

  it("21 tipos y 33 instancias del primer fixture, con los mismos códigos que el listado", () => {
    expect(def.pieceTypes).toHaveLength(21);
    expect(def.pieceTypes.reduce((n, p) => n + p.quantity, 0)).toBe(33);
    expect(def.pieceTypes.map((p) => p.code).sort()).toEqual(olmoDef.pieceTypes.map((p) => p.code).sort());
  });

  it("medidas de la caja (mayor a menor) dentro de la tolerancia del listado; canteado sin dato", () => {
    for (const p of def.pieceTypes) {
      const listado = olmoDef.pieceTypes.find((o) => o.code === p.code)!;
      const esperado = [listado.lengthMm, listado.widthMm, listado.thicknessMm].sort((a, b) => b - a);
      const medido = [p.lengthMm, p.widthMm, p.thicknessMm];
      for (let i = 0; i < 3; i += 1) expect(Math.abs(medido[i] - esperado[i]), `${p.code}[${i}]`).toBeLessThanOrEqual(2);
      expect(p.quantity, p.code).toBe(listado.quantity);
      expect(p.edgeBanding).toBeNull();
      expect(p.name).toMatch(/^Pieza C\d{2}$/);
    }
  });

  it("qrId con prefijo erp-<clave>-, únicos y sin chocar con el Olmo", () => {
    expect(claveErp(TRABAJO)).toBe("0f1e2d3c4b5a");
    expect(def.furniture.qrId).toBe("erp-0f1e2d3c4b5a-mueble");
    expect(def.pieceTypes.every((p) => p.qrId.startsWith("erp-0f1e2d3c4b5a-c"))).toBe(true);
    expect(() => createRegistry([olmoDef, { ...def, modelUrl: "blob:x" }])).not.toThrow();
    expect(def.modules).toEqual([{ id: "mod-erp", qrId: "erp-0f1e2d3c4b5a-modulo", furnitureId: def.furniture.id, name: "Modelo del ERP" }]);
  });

  it("registerErpFurniture: links dentro del iframe; /p y /prueba no cambian", () => {
    const base = "/erp/proyectos/5e1a0000-0000-4000-8000-000000000142/visor";
    const registrado = registerErpFurniture("0f1e2d3c4b5a", { ...def, modelUrl: "blob:modelo" }, base);
    expect(registerErpFurniture("0f1e2d3c4b5a", { ...def, modelUrl: "blob:otro" }, base)).toBe(registrado);
    expect(getErpFurnitureDef("0f1e2d3c4b5a")).toBe(registrado);
    expect(qrHref(def.furniture.qrId)).toBe(base);
    expect(qrHref(def.pieceTypes[0].qrId)).toBe(`${base}/${def.pieceTypes[0].qrId}`);
    expect(resolveQr(def.pieceTypes[0].qrId)?.def).toBe(registrado);
    expect(qrHref("olmo-c04")).toBe("/p/olmo-c04");
    // /prueba sigue igual.
    const importado = { ...def, furniture: { ...def.furniture, id: "prueba-abcdef12", qrId: "prueba-abcdef12-mueble" }, modules: [{ ...def.modules[0], qrId: "prueba-abcdef12-mod-1", furnitureId: "prueba-abcdef12" }], pieceTypes: def.pieceTypes.map((p) => ({ ...p, qrId: p.qrId.replace("erp-0f1e2d3c4b5a", "prueba-abcdef12") })) };
    registerImportedFurniture("abcdef1234567890", importado);
    expect(qrHref("prueba-abcdef12-mueble")).toBe("/prueba/abcdef1234567890");
    expect(qrHref(importado.pieceTypes[0].qrId)).toBe(`/prueba/abcdef1234567890/${importado.pieceTypes[0].qrId}`);
  });
});

describe("TIE-21: /p/<qrId> sigue accesible sin sesión (PB-15)", () => {
  it.each(["olmo-mueble", "olmo-mod-cajones", "olmo-c04"])("%s con la integración encendida y sin cookie: misma ficha", async (qrId) => {
    vi.stubEnv("ERP_WEB_ORIGEN", "http://localhost:4010");
    vi.stubEnv("ERP_MODO", "simulado");
    vi.stubEnv("DATABASE_URL", "");
    const elemento = (await QrPage({ params: Promise.resolve({ qrId }) })) as ReactElement<{ children: ReactElement<{ target?: unknown }>[] }>;
    expect(isValidElement(elemento)).toBe(true);
    const sheets = elemento.props.children.find((c) => isValidElement(c) && c.props.target !== undefined)!;
    expect(sheets.props.target).toEqual(resolveQr(qrId));
  });

  it("la ficha y su layout no usan la sesión ni nada de la integración, y se sirven con frame-ancestors 'none'", () => {
    const dir = path.resolve(__dirname, "..", "..", "src", "app", "p");
    const fuentes = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => readFileSync(path.join(dir, f), "utf8"));
    expect(fuentes.length).toBeGreaterThan(0);
    for (const src of fuentes) {
      expect(src).not.toMatch(/@\/lib\/erp|@\/server\/(erp|integracion)|components\/erp|next\/headers|cookies\(/);
    }
    expect(frameAncestors("http://localhost:4010")).not.toBe("frame-ancestors 'none'");
    expect(reglasDeFraming("http://localhost:4010")[0]).toEqual({ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] });
  });
});
