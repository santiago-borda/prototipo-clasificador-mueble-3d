// T11: reporte (docs/spec-t11-harness-minimo.md §4: E12, E13 y el encabezado PARCIAL). Solo directorios temporales.

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateGate, projectRun } from "../../eval/gate";
import { buildReport, renderMarkdown, writeReport, NA_PASADA_1 } from "../../eval/report";
import type { RealCase } from "../../eval/cases";
import type { AssociationRun } from "@/engine/types";
import { okCase } from "../helpers/evalFixtures";

const PUBLICO = ["olmo", "sintetico"];
const tmp = () => mkdtempSync(path.join(os.tmpdir(), "eval-report-"));

const gateFor = (real: RealCase[]) =>
  evaluateGate({
    real,
    esperados: (id) => Object.fromEntries(real.flatMap((c) => (c.status === "ok" && c.furnitureId === id ? [[c.run.modelId, projectRun(c.run)]] : []))),
    published: () => null,
    determinism: { a: "x", b: "x" },
    permutations: { ok: true, detail: "20 permutaciones iguales" },
  });

const reportOf = (real: RealCase[]) => buildReport({ real, synthetic: [], gate: gateFor(real), publico: PUBLICO, seed: 1, node: process.version });

describe("encabezado: el gate es PARCIAL", () => {
  it("lo dice en el encabezado, nombra G2, G3 y G4 y lo que no se ejecutó", () => {
    const md = renderMarkdown(reportOf([okCase("olmo")]), "completo");
    const header = md.split("\n").slice(0, 8).join("\n");
    expect(header).toMatch(/GATE PARCIAL/);
    expect(header).toMatch(/solo G2, G3 y G4/);
    expect(header).toMatch(/G1.*no ejecutado/s);
    expect(header).toMatch(/G5/);
    expect(md).toMatch(/sintéticos: no ejecutados \(T13\)/i);
  });
});

describe("E12 (T11-E6): passes en el reporte", () => {
  it("con passes 1: 'dudosas sin candidatos', top-1 y top-3 son n/a (pasada 1) y passes se ve por caso", () => {
    const md = renderMarkdown(reportOf([okCase("olmo")]), "completo");
    expect(md).toContain("passes: 1");
    expect(md).toContain(`Dudosas sin candidatos: ${NA_PASADA_1}`);
    expect(md).toContain(`Top-1: ${NA_PASADA_1}`);
    expect(md).toContain(`Top-3: ${NA_PASADA_1}`);
    expect(NA_PASADA_1).toBe("n/a (pasada 1: no se rankeó)");
  });

  it("se siguen reportando % resuelto, % dudosas y sin componente como n/N (sin-componente fuera del denominador)", () => {
    const md = renderMarkdown(reportOf([okCase("olmo")]), "completo");
    expect(md).toContain("Resuelto automáticamente: 2/3"); // 2 seguras de 3 instancias con componente
    expect(md).toContain("Dudosas: 1/3");
    expect(md).toContain("Sin componente: 1");
  });

  it("con passes 2 sí calcula las dudosas sin candidatos (n/N)", () => {
    const c = okCase("olmo");
    const run: AssociationRun = { ...c.run, passes: 2 };
    const md = renderMarkdown(reportOf([{ ...c, run }]), "completo");
    expect(md).toContain("passes: 2");
    expect(md).toContain("Dudosas sin candidatos: 1/1");
    expect(md).not.toContain(`Dudosas sin candidatos: ${NA_PASADA_1}`);
  });

  it("muestra los excluidos del listado por caso", () => {
    const md = renderMarkdown(reportOf([okCase("olmo", "borrador")]), "completo");
    expect(md).toMatch(/Códigos excluidos del listado: 1/);
    expect(md).toMatch(/borrador/);
  });
});

describe("E13: privacidad del segundo fixture", () => {
  it("el reporte de salida no lleva códigos, hashes ni cifras del caso fuera de la carpeta local; el detalle va a la carpeta local", () => {
    const publico = okCase("olmo");
    const privado = okCase("sabrina");
    const out = tmp();
    const local = path.join(tmp(), "Sabrina", "eval", "out");
    writeReport(reportOf([publico, privado]), out, local);

    const sal = readFileSync(path.join(out, "reporte.md"), "utf8") + readFileSync(path.join(out, "reporte.json"), "utf8");
    // El caso privado y el público comparten datos de prueba: el caso público sí puede llevar códigos, así que se
    // comparan contra el reporte de un run solo-privado.
    const soloPrivado = tmp();
    writeReport(reportOf([privado]), soloPrivado, local);
    const mdPrivado = readFileSync(path.join(soloPrivado, "reporte.md"), "utf8");
    const jsonPrivado = readFileSync(path.join(soloPrivado, "reporte.json"), "utf8");
    for (const text of [mdPrivado, jsonPrivado]) {
      expect(text).not.toContain("9999");
      expect(text).not.toContain(privado.run.modelId);
      expect(text).not.toContain(privado.run.listadoId);
      expect(text).not.toContain(privado.run.engineRunId);
      expect(text).not.toContain("ID1");
    }
    const section = mdPrivado.split(/^## /m).find((s) => s.startsWith("sabrina")) ?? "";
    expect(section).toMatch(/ejecutado/);
    expect(section).toMatch(/detalle solo en la carpeta local/);
    expect(section).not.toMatch(/\d/);
    expect(sal).toContain("olmo"); // el caso público sí está completo

    // Control positivo: el detalle completo sí está en la carpeta local.
    const detalle = readFileSync(path.join(local, "reporte.md"), "utf8");
    expect(detalle).toContain(privado.run.listadoId);
    expect(existsSync(path.join(local, "reporte.json"))).toBe(true);
  });

  it("sin caso privado ejecutado no se escribe nada en la carpeta local", () => {
    const out = tmp();
    const local = path.join(tmp(), "Sabrina", "eval", "out");
    writeReport(reportOf([okCase("olmo"), { furnitureId: "sabrina", status: "no-ejecutado", motivo: "carpeta ausente" }]), out, local);
    expect(existsSync(local)).toBe(false);
    expect(readFileSync(path.join(out, "reporte.md"), "utf8")).toMatch(/sabrina.*no ejecutado/is);
  });
});
