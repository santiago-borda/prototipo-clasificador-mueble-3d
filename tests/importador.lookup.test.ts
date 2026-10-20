// R8: el mueble importado se registra solo en el navegador (fuente adicional de `lookup.ts`, vacía en el servidor)
// y no altera nada de lo que ya existía.
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { buildFurnitureDef } from "@/importer/buildDef";
import { readListing } from "@/importer/listing";
import {
  getImportedFurnitureDef,
  listBaseFurniture,
  listFurniture,
  listQrEntries,
  qrHref,
  registerImportedFurniture,
  resolveQr,
} from "@/lib/lookup";
import { LISTADO_M01, readFixture } from "./helpers/csv";

const IMPORT_ID = "0123456789abcdef";
const imported = buildFurnitureDef(readListing(readFixture(LISTADO_M01)).rows, {
  importId: IMPORT_ID,
  dimsMm: { x: 1200, y: 750, z: 571 },
});
const pieceQr = "prueba-01234567-c04";

describe("lookup: fuente adicional de muebles importados", () => {
  it("antes de registrar (como en el servidor) los qrId importados no resuelven a nada", () => {
    expect(resolveQr(pieceQr)).toBeUndefined();
    expect(listFurniture().map((d) => d.furniture.id)).toEqual(["olmo"]);
    expect(getImportedFurnitureDef(IMPORT_ID)).toBeUndefined();
  });

  it("los links de lo que ya existe no cambian", () => {
    expect(qrHref("olmo-c04")).toBe("/p/olmo-c04");
    expect(qrHref("olmo-mueble")).toBe("/p/olmo-mueble");
  });

  it("registrar agrega el mueble con su modelUrl, y sus qrId resuelven dentro de su mueble", () => {
    registerImportedFurniture(IMPORT_ID, imported);
    const def = getImportedFurnitureDef(IMPORT_ID);
    expect(def?.modelUrl).toBe(`/api/importaciones/${IMPORT_ID}/modelo`);

    const target = resolveQr(pieceQr);
    expect(target?.kind).toBe("piece");
    expect(target?.def.furniture.id).toBe("prueba-01234567");
    expect(resolveQr("prueba-01234567-mod-2")?.kind).toBe("module");
    expect(resolveQr("prueba-01234567-mueble")?.kind).toBe("furniture");
  });

  it("Olmo sigue resolviendo a Olmo aunque la importación repita todos sus códigos", () => {
    expect(resolveQr("olmo-c04")?.def).toBe(olmoDef);
  });

  it("registrar dos veces la misma importación es inocuo", () => {
    expect(() => registerImportedFurniture(IMPORT_ID, imported)).not.toThrow();
    expect(listFurniture().filter((d) => d.furniture.id === "prueba-01234567")).toHaveLength(1);
  });

  it("los links de lo importado van a /prueba/<id> (mueble) y /prueba/<id>/<qrId> (módulo y pieza)", () => {
    expect(qrHref("prueba-01234567-mueble")).toBe(`/prueba/${IMPORT_ID}`);
    expect(qrHref(pieceQr)).toBe(`/prueba/${IMPORT_ID}/${pieceQr}`);
    expect(qrHref("prueba-01234567-mod-1")).toBe(`/prueba/${IMPORT_ID}/prueba-01234567-mod-1`);
  });

  it("la lista de muebles incluye lo importado, pero la hoja de QR y la generación estática no", () => {
    expect(listFurniture().map((d) => d.furniture.id)).toEqual(["olmo", "prueba-01234567"]);
    expect(listBaseFurniture().map((d) => d.furniture.id)).toEqual(["olmo"]);
    expect(listQrEntries().every((e) => e.furnitureId === "olmo")).toBe(true);
  });

  it("un mueble importado que choca con un qrId existente se rechaza y no deja nada a medias", () => {
    const clash = { ...imported, furniture: { ...imported.furniture, id: "otro", qrId: "olmo-mueble" } };
    expect(() => registerImportedFurniture("fedcba9876543210", clash)).toThrow(/qrId/);
    expect(getImportedFurnitureDef("fedcba9876543210")).toBeUndefined();
    expect(listFurniture().map((d) => d.furniture.id)).toEqual(["olmo", "prueba-01234567"]);
  });
});
