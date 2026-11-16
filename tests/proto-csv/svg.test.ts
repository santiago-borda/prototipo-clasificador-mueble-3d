// C10, C10b y C10c (docs/spec-proto-csv-ocl.md §4.4 y §5): diagrama de corte del gabinete leído como datos y
// comparado con las crudas del CSV. C10 usa el SVG real; C10b y C10c son variantes SINTÉTICAS armadas acá a partir
// de una copia del SVG vigente (se dice en cada una qué se cambió).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOclCsv } from "@/proto-csv/parse";
import { comparePlaca, parsePlacaSvg, type PlacaParse } from "@/proto-csv/svg";

const DIR = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const SVG = readFileSync(path.join(DIR, "diagrama-blanco18.svg"), "utf8");
const parsed = parseOclCsv(readFileSync(path.join(DIR, "gabinete-prueba-canto.csv"), "utf8"));
if (!parsed.ok) throw new Error("fixture");
const PIECES = parsed.listing.pieces;

function ok(result: PlacaParse) {
  if (!result.ok) throw new Error(`${result.reason}: ${result.message}`);
  return result;
}
/** Reemplaza exactamente una vez (falla si el SVG vigente cambió y la variante sintética ya no aplica). */
function variant(pairs: [string, string][]) {
  let text = SVG;
  for (const [from, to] of pairs) {
    expect(text.split(from).length - 1, from).toBe(1);
    text = text.replace(from, to);
  }
  return text;
}

const A_PATH = 'd="M 809.56,10.0 L 10.0,10.0 L 10.0,409.56 L 809.56,409.56Z"';
const A_TEXT = '<text x="409.78" y="209.78"';
const B_PATH = 'd="M 773.78,412.5 L 10.0,412.5 L 10.0,812.28 L 773.78,812.28Z"';

describe("C10: diagrama-blanco18.svg (fixture real)", () => {
  const placa = ok(parsePlacaSvg(SVG));
  const comparison = comparePlaca(placa.parts, PIECES, "Blanco 18");

  it("placa 2800 × 2070 mm y 4 piezas leídas por coordenadas (A, B, C, C)", () => {
    expect([placa.widthMm, placa.heightMm, placa.unreadableParts]).toEqual([2800, 2070, 0]);
    expect(placa.parts.map((p) => p.letter)).toEqual(["A", "B", "C", "C"]);
    expect(placa.parts[0]).toMatchObject({ x: 10, y: 10, w: expect.closeTo(799.56, 6), h: expect.closeTo(399.56, 6) });
  });

  it("A = C03, B = C02, C y C = C01, todas dentro de ±0,1 mm de las crudas del CSV, sin rotar ni avisos", () => {
    expect(comparison.parts.map((p) => [p.letter, p.code, p.match])).toEqual([
      ["A", "0001-01-M01-C03", "coincide"],
      ["B", "0001-01-M01-C02", "coincide"],
      ["C", "0001-01-M01-C01", "coincide"],
      ["C", "0001-01-M01-C01", "coincide"],
    ]);
    expect(comparison.warnings).toEqual([]);
    expect(comparison.notes).toEqual([]); // C01 aparece 2 veces = su cantidad
  });

  it("la letra es local del material: con «Blanco 3 mm» la A es C04 y no coincide; B y C no existen ahí", () => {
    const other = comparePlaca(placa.parts, PIECES, "Blanco 3 mm");
    expect(other.parts.map((p) => p.match)).toEqual(["no-coincide", "sin-pieza", "sin-pieza", "sin-pieza"]);
  });

  it("10 cortes que suman 11,32 m (medido 11,317)", () => {
    expect(placa.cuts).toHaveLength(10);
    expect(placa.totalCutM).toBeCloseTo(11.317, 2);
    expect(Math.abs((placa.totalCutM ?? 0) - 11.32)).toBeLessThanOrEqual(0.01);
  });

  it("niveles (lectura geométrica, no confirmada): 3 de nivel 1, 4 horizontales de nivel 2, 3 verticales cortas de nivel 3", () => {
    const cuts = placa.cuts ?? [];
    expect(cuts.map((c) => c.level)).toEqual([1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
    expect(cuts.filter((c) => c.level === 2).every((c) => c.axis === "horizontal")).toBe(true);
    expect(cuts.filter((c) => c.level === 3).every((c) => c.axis === "vertical" && c.lengthMm < 410)).toBe(true);
    expect(cuts.filter((c) => c.level === 1).map((c) => c.axis)).toEqual(["vertical", "horizontal", "vertical"]);
  });
});

describe("C10b (SINTÉTICO): copia del SVG vigente con B agrandada 1 mm de largo", () => {
  it("avisa que el SVG no coincide con el CSV", () => {
    const placa = ok(parsePlacaSvg(variant([[B_PATH, 'd="M 774.78,412.5 L 10.0,412.5 L 10.0,812.28 L 774.78,812.28Z"']])));
    const comparison = comparePlaca(placa.parts, PIECES, "Blanco 18");
    expect(comparison.parts[1]).toMatchObject({ letter: "B", code: "0001-01-M01-C02", match: "no-coincide" });
    expect(comparison.warnings).toEqual([expect.stringContaining("El SVG no coincide con el CSV")]);
  });
});

describe("C10c (SINTÉTICO): copia del SVG vigente con A rotada 90°", () => {
  // La A girada se mueve a la zona libre de la placa (x ≥ 900), como la ubicaría el optimizador: girarla en su lugar la
  // superpondría con B y C (dos letras dentro de su caja → "sin-letra", que es lo conservador y se prueba aparte).
  const X0 = 900;
  const rotated = (w: number, h: number) =>
    variant([
      [A_PATH, `d="M ${X0 + w},10.0 L ${X0},10.0 L ${X0},${10 + h} L ${X0 + w},${10 + h}Z"`],
      [A_TEXT, `<text x="${X0 + w / 2}" y="${10 + h / 2}"`],
    ]);

  it("girada en su lugar, encima de B y C: dos letras dentro de la caja → sin-letra (no se adivina)", () => {
    const encima = variant([
      [A_PATH, 'd="M 409.56,10.0 L 10.0,10.0 L 10.0,809.56 L 409.56,809.56Z"'],
      [A_TEXT, '<text x="209.78" y="409.78"'],
    ]);
    const comparison = comparePlaca(ok(parsePlacaSvg(encima)).parts, PIECES, "Blanco 18");
    expect(comparison.parts[0].match).toBe("sin-letra");
    expect(comparison.warnings[0]).toMatch(/no se pudo leer su letra/);
  });

  it("A × L (399,56 × 799,56): rotada, sin aviso", () => {
    const comparison = comparePlaca(ok(parsePlacaSvg(rotated(399.56, 799.56))).parts, PIECES, "Blanco 18");
    expect(comparison.parts[0]).toMatchObject({ letter: "A", match: "rotada" });
    expect(comparison.warnings).toEqual([]);
  });

  it("rotada y 1 mm más larga (399,56 × 800,56): aviso", () => {
    const comparison = comparePlaca(ok(parsePlacaSvg(rotated(399.56, 800.56))).parts, PIECES, "Blanco 18");
    expect(comparison.parts[0].match).toBe("no-coincide");
    expect(comparison.warnings).toHaveLength(1);
  });

  it("dentro de la tolerancia en las dos orientaciones (±0,1 mm)", () => {
    expect(comparePlaca(ok(parsePlacaSvg(rotated(399.65, 799.5))).parts, PIECES, "Blanco 18").parts[0].match).toBe("rotada");
    expect(comparePlaca(ok(parsePlacaSvg(rotated(399.7, 799.56))).parts, PIECES, "Blanco 18").parts[0].match).toBe("rotada"); // 0,1 justo: adentro
    expect(comparePlaca(ok(parsePlacaSvg(rotated(399.75, 799.56))).parts, PIECES, "Blanco 18").parts[0].match).toBe("no-coincide"); // 0,15: afuera
  });
});

describe("Lector del SVG: casos de borde (sintéticos)", () => {
  it("piezas como <rect> con <text> hermano (diagrama-canto.svg real): 10 piezas, sin OCL_CUT", () => {
    const placa = ok(parsePlacaSvg(readFileSync(path.join(DIR, "diagrama-canto.svg"), "utf8")));
    expect(placa.parts).toHaveLength(10);
    expect(placa.parts.every((p) => p.letter !== null)).toBe(true);
    expect([placa.cuts, placa.totalCutM]).toEqual([null, null]);
  });

  it("sin OCL_CUT: piezas sí, cortes null", () => {
    const sinCortes = SVG.replace(/<g id="OCL_CUT">[\s\S]*?<\/g>/, "");
    expect(ok(parsePlacaSvg(sinCortes))).toMatchObject({ cuts: null, totalCutM: null });
  });

  it("transform, escala distinta de 1 mm, XML roto y sin OCL_PART: rechazos con qué hacer", () => {
    expect(parsePlacaSvg(SVG.replace('<g id="OCL_PART">', '<g id="OCL_PART" transform="scale(2)">'))).toMatchObject({ ok: false, reason: "transform-no-soportado" });
    expect(parsePlacaSvg(SVG.replace('width="2800.0mm"', 'width="280.0cm"'))).toMatchObject({ ok: false, reason: "escala-no-soportada" });
    expect(parsePlacaSvg(SVG.replace('viewBox="0 0 2800.0 2070.0"', 'viewBox="0 0 280 207"'))).toMatchObject({ ok: false, reason: "escala-no-soportada" });
    expect(parsePlacaSvg("<svg><g>")).toMatchObject({ ok: false, reason: "svg-ilegible" });
    expect(parsePlacaSvg(SVG.replace('<g id="OCL_PART">', '<g id="OTRA_COSA">'))).toMatchObject({ ok: false, reason: "sin-piezas" });
  });

  it("un path con comandos relativos o curvas no se adivina: pieza ilegible", () => {
    const placa = ok(parsePlacaSvg(SVG.replace(A_PATH, 'd="m 809.56,10.0 c 1,1 2,2 3,3Z"')));
    expect([placa.parts.length, placa.unreadableParts]).toEqual([3, 1]);
  });

  it("los id repetidos no importan: la letra sale del <text> que cae dentro de la pieza", () => {
    expect((SVG.match(/\sid="OCL_PART____0_000Z"/g) ?? []).length).toBe(4);
    expect(ok(parsePlacaSvg(SVG)).parts.map((p) => p.letter)).toEqual(["A", "B", "C", "C"]);
  });
});
