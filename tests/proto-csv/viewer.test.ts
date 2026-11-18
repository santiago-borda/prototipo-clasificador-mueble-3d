// Colores del visor 3D de la revisión por nivel del tipo (spec §4.2, v0.4): rojo dudosos, ámbar advertencia, gris el resto;
// la pieza elegida va en verde. Función pura (el visor real necesita WebGL y no corre en jsdom).

import { describe, expect, it } from "vitest";
import { VIEWER_COLORS, pieceColor } from "@/proto-csv/viewerColors";

const dudosas = new Set(["D1", "D2"]);
const advertencias = new Set(["W1"]);
const color = (code: string, selected: string | null = null) => pieceColor(code, selected, dudosas, advertencias);

describe("colores del visor por nivel", () => {
  it("dudosos en rojo, advertencia en ámbar, el resto en gris", () => {
    expect(color("D1")).toBe(VIEWER_COLORS.dudosa);
    expect(color("D2")).toBe(VIEWER_COLORS.dudosa);
    expect(color("W1")).toBe(VIEWER_COLORS.advertencia);
    expect(color("S1")).toBe(VIEWER_COLORS.neutral);
  });
  it("los tres colores son distintos entre sí y con el de la pieza elegida", () => {
    expect(new Set(Object.values(VIEWER_COLORS)).size).toBe(4);
  });
  it("la pieza elegida va en verde, sea cual sea su nivel", () => {
    expect(color("D1", "D1")).toBe(VIEWER_COLORS.selected);
    expect(color("W1", "W1")).toBe(VIEWER_COLORS.selected);
    expect(color("S1", "S1")).toBe(VIEWER_COLORS.selected);
    expect(color("D1", "W1")).toBe(VIEWER_COLORS.dudosa); // otra elegida: no cambia el color de la que no lo está
  });
  it("un código en ambos conjuntos (no debería pasar) gana el rojo: bloquea", () => {
    expect(pieceColor("X", null, new Set(["X"]), new Set(["X"]))).toBe(VIEWER_COLORS.dudosa);
  });
});
