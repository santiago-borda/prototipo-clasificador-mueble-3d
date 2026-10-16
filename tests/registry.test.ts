// A5 (versión sintética, corre siempre) y A7 (el registro funciona con Sabrina ausente).
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { loadOptionalFurniture } from "@/data/optionalFurniture";
import { createRegistry } from "@/data/registry";
import { defaultFurnitureDef, getPieceByInstanceId, listFurniture, listQrEntries, resolveQr } from "@/lib/lookup";
import { collidingDef } from "./helpers/syntheticDef";

describe("registro de muebles", () => {
  it("rechaza qrId repetidos entre muebles", () => {
    const clash = {
      ...collidingDef,
      furniture: { ...collidingDef.furniture, id: "otro", qrId: olmoDef.furniture.qrId },
    };
    expect(() => createRegistry([olmoDef, clash])).toThrow(/qrId/);
  });

  it("rechaza el mismo mueble registrado dos veces", () => {
    expect(() => createRegistry([olmoDef, olmoDef])).toThrow();
  });

  it("rechaza una pieza que apunta a un módulo inexistente", () => {
    const broken = { ...collidingDef, pieceTypes: [{ ...collidingDef.pieceTypes[0], moduleId: "mod-fantasma" }] };
    expect(() => createRegistry([broken])).toThrow(/mod-fantasma/);
  });
});

describe("A5 (sintético): un código repetido en dos muebles nunca resuelve al mueble equivocado", () => {
  const registry = createRegistry([olmoDef, collidingDef]);
  const olmoCodes = new Set(olmoDef.pieceTypes.map((p) => p.code));
  const colliding = collidingDef.pieceTypes.filter((p) => olmoCodes.has(p.code));

  it("el mueble de prueba realmente repite códigos de Olmo", () => {
    expect(colliding.length).toBe(collidingDef.pieceTypes.length);
  });

  it("cada qrId pertenece al mueble que lo declara", () => {
    for (const piece of collidingDef.pieceTypes) expect(registry.findDefByQrId(piece.qrId)).toBe(collidingDef);
    for (const piece of olmoDef.pieceTypes) expect(registry.findDefByQrId(piece.qrId)).toBe(olmoDef);
  });

  it("la misma instancia (mismo código) se asocia a la pieza de SU mueble", () => {
    for (const piece of colliding) {
      const instanceId = `${piece.code}#1`;
      const fromOlmo = getPieceByInstanceId(olmoDef, instanceId);
      const fromDemo = getPieceByInstanceId(collidingDef, instanceId);
      expect(fromOlmo?.qrId.startsWith("olmo-")).toBe(true);
      expect(fromDemo?.qrId.startsWith("demo-")).toBe(true);
    }
  });
});

describe("A7: el registro funciona con Sabrina ausente", () => {
  it("sin NEXT_PUBLIC_ENABLE_SABRINA no se registra ningún mueble opcional", () => {
    expect(process.env.NEXT_PUBLIC_ENABLE_SABRINA).toBeUndefined();
    expect(loadOptionalFurniture()).toEqual([]);
  });

  it("queda solo Olmo, sus QR resuelven y no aparece nada de Sabrina", () => {
    expect(listFurniture().map((def) => def.furniture.id)).toEqual(["olmo"]);
    expect(defaultFurnitureDef()).toBe(olmoDef);
    expect(resolveQr("olmo-c04")?.kind).toBe("piece");
    expect(resolveQr("sabrina-c11")).toBeUndefined();
    expect(listQrEntries().every((entry) => entry.furnitureId === "olmo")).toBe(true);
  });
});
