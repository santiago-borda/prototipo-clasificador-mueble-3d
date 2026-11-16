// C16 (docs/spec-proto-csv-ocl.md §5 y §7): la carpeta del fixture del gabinete coincide con su README.md, que es la
// fuente de verdad. Falla si el README y la carpeta se desalinean. Las filas que dicen «No se versiona» (el PDF
// impreso, solo en el disco del autor e ignorado por .gitignore) no se exigen.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname, "..", "fixtures", "csv-ocl", "gabinete");
const README = readFileSync(path.join(DIR, "README.md"), "utf8").replace(/\r\n/g, "\n");
const read = (name: string) => readFileSync(path.join(DIR, name), "utf8");

/** Filas de la tabla de la sección «## Archivos»: [nombre, descripción]. */
function filesTable(): [string, string][] {
  const section = README.split("\n## Archivos\n")[1]?.split("\n## ")[0] ?? "";
  return section
    .split("\n")
    .filter((line) => /^\| `[^`]+` \|/.test(line))
    .map((line) => {
      const [, name, description] = /^\| `([^`]+)` \| (.*) \|$/.exec(line) ?? [];
      return [name, description];
    });
}

/** Encabezado `<svg …>` y conteos de un SVG, leídos como texto (sin DOM). */
function svgShape(text: string) {
  const svg = /<svg[^>]*>/.exec(text)?.[0] ?? "";
  const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(svg)?.[1];
  const part = text.split('<g id="OCL_PART">')[1]?.split('<g id="OCL_CUT">')[0] ?? "";
  return {
    generator: /<!-- Generator: ([^>]*) -->/.exec(text)?.[1]?.trim(),
    width: attr("width"),
    height: attr("height"),
    viewBox: attr("viewBox"),
    hasPart: text.includes('<g id="OCL_PART">'),
    hasCut: text.includes('<g id="OCL_CUT">'),
    paths: (part.match(/<path\b/g) ?? []).length,
    rects: (part.match(/<rect\b/g) ?? []).length,
    letters: [...part.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]),
    lines: (text.split('<g id="OCL_CUT">')[1]?.match(/<line\b/g) ?? []).length,
  };
}

describe("C16: fixture del gabinete contra su README", () => {
  const table = filesTable();

  it("la tabla de archivos del README tiene los 6 archivos esperados", () => {
    expect(table.map(([name]) => name)).toEqual([
      "gabinete-prueba-canto.csv",
      "gabinete-prueba-listainstancias.csv",
      "gabinete-prueba-opencutlist.dae",
      "diagrama-blanco18.svg",
      "diagrama-canto.svg",
      "diagrama-corte-blanco18.pdf",
    ]);
  });

  it("cada archivo de la tabla existe, salvo los que dicen «No se versiona»", () => {
    for (const [name, description] of table) {
      if (/No se versiona/.test(description)) continue;
      expect(existsSync(path.join(DIR, name)), name).toBe(true);
    }
    const [, pdfRow] = table.find(([name]) => name.endsWith(".pdf")) ?? [];
    expect(pdfRow).toMatch(/No se versiona.*\.gitignore.*C16 no lo exige/);
  });

  it("diagrama-blanco18.svg: placa 2800 × 2070 mm, 1 unidad = 1 mm, 4 piezas (A, B, C, C) como <path> y OCL_CUT con 10 líneas", () => {
    expect(svgShape(read("diagrama-blanco18.svg"))).toEqual({
      generator: "SketchUp, OpenCutList Extension, Version 7.1.0",
      width: "2800.0mm",
      height: "2070.0mm",
      viewBox: "0 0 2800.0 2070.0",
      hasPart: true,
      hasCut: true,
      paths: 4,
      rects: 0,
      letters: ["A", "B", "C", "C"],
      lines: 10,
    });
    expect(README).toMatch(/Placa de 2800 x 2070 mm/);
    expect(README).toMatch(/10 líneas de corte en el grupo `OCL_CUT`/);
  });

  it("diagrama-canto.svg: tira de 75000 × 22 mm, 10 <rect> en OCL_PART, sin OCL_CUT", () => {
    const shape = svgShape(read("diagrama-canto.svg"));
    expect(shape).toMatchObject({ width: "75000.0mm", height: "22.0mm", viewBox: "0 0 75000.0 22.0", hasPart: true, hasCut: false, paths: 0, rects: 10 });
  });

  it("CSV: 4 filas de pieza y 8 de canto (A a H); Lista de instancias sin Cantidad", () => {
    const rows = read("gabinete-prueba-canto.csv").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).slice(1);
    expect(rows.filter((r) => r.includes(";Tablero;"))).toHaveLength(4);
    expect(rows.filter((r) => r.includes(";Canto;")).map((r) => r[0])).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(read("gabinete-prueba-listainstancias.csv").split(/\r?\n/)[0]).not.toMatch(/;Cantidad;/);
  });

  it(".dae: materiales Blanco_18, Canto_Blanco y Blanco_3_mm (el canto con la convención Canto_<color> del README)", () => {
    const materials = [...read("gabinete-prueba-opencutlist.dae").matchAll(/<material id="[^"]*" name="([^"]*)"/g)].map((m) => m[1]);
    expect(materials).toEqual(["Blanco_18", "Canto_Blanco", "Blanco_3_mm"]);
    expect(README).toMatch(/El canto se llama `Canto_Blanco`/);
  });
});
