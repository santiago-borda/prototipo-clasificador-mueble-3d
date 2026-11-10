// T11: orquestación del eval (docs/spec-t11-harness-minimo.md §3 y §4: E7 dentro del harness, E9, T11-E3, T11-E9).
// runEval recibe las fuentes por inyección: todo va a directorios temporales, nada a eval/runs/ ni eval/esperados.json del repo.

import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RealCase } from "../../eval/cases";
import { projectRun, readEsperados } from "../../eval/gate";
import { runEval, type EvalIo } from "../../eval/harness";
import { hashFileName } from "@/engine/hash";
import { okCase } from "../helpers/evalFixtures";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "eval-harness-"));

function setup(cases: RealCase[]) {
  const root = tmp();
  const dirs = { runsDir: path.join(root, "runs"), esperadosPath: path.join(root, "esperados.json"), out: path.join(root, "out"), root };
  const io: EvalIo = {
    loadCases: async () => cases,
    sourceFor: (id) => (id === "olmo" ? { daePath: "", runsDir: dirs.runsDir, esperadosPath: dirs.esperadosPath } : null),
    publico: ["olmo", "sintetico"],
    today: () => "2026-11-10",
  };
  const opts = (over: Partial<Parameters<typeof runEval>[0]> = {}) => ({ sabrinaDir: path.join(root, "no-existe"), outDir: dirs.out, seed: 1, publicar: false, escribirEsperados: false, ...over });
  const esperar = (c: Extract<RealCase, { status: "ok" }>) => writeFileSync(dirs.esperadosPath, JSON.stringify({ [c.run.modelId]: projectRun(c.run) }));
  return { dirs, io, opts, esperar };
}

describe("E7: G3 y G4 dentro del harness", () => {
  it("dos corridas y 20 permutaciones de instancias y de filas → ok", async () => {
    const c = okCase("olmo");
    const { io, opts, esperar } = setup([c]);
    esperar(c);
    const r = await runEval(opts(), io);
    const g3 = r.gate.checks.find((x) => x.id === "G3");
    const g4 = r.gate.checks.find((x) => x.id === "G4");
    expect(g3?.status).toBe("ok");
    expect(g4?.status).toBe("ok");
    expect(g4?.detail).toMatch(/20 permutaciones/);
    expect(r.exitCode).toBe(0);
  });

  it("G3 falla si la segunda carga da otro run", async () => {
    const c = okCase("olmo");
    const other = { ...c, run: { ...c.run, passes: 2 as const } }; // otro run para el mismo caso
    let n = 0;
    const { io, opts, esperar } = setup([c]);
    esperar(c);
    const r = await runEval(opts(), { ...io, loadCases: async () => [n++ === 0 ? c : other] });
    expect(r.gate.checks.find((x) => x.id === "G3")?.status).toBe("falla");
    expect(r.exitCode).toBe(1);
  });
});

describe("T11-E9: sin esperados el eval sale con 1 y lo dice", () => {
  it("falla G2 con 'falta esperados', escribe el reporte y no publica", async () => {
    const { dirs, io, opts } = setup([okCase("olmo")]);
    const r = await runEval(opts({ publicar: true }), io);
    expect(r.exitCode).toBe(1);
    expect(r.gate.checks.find((x) => x.id === "G2")?.detail).toMatch(/falta esperados/);
    expect(existsSync(path.join(dirs.out, "reporte.md"))).toBe(true);
    expect(existsSync(dirs.runsDir)).toBe(false);
  });
});

describe("--escribir-esperados", () => {
  it("escribe la proyección y no aprueba el gate en esa corrida; la siguiente corrida sí", async () => {
    const c = okCase("olmo");
    const { dirs, io, opts } = setup([c]);
    const first = await runEval(opts({ escribirEsperados: true }), io);
    expect(first.exitCode).toBe(1);
    expect(readEsperados(dirs.esperadosPath)[c.run.modelId]).toEqual(projectRun(c.run));
    expect((await runEval(opts(), io)).exitCode).toBe(0);
  });
});

describe("E9 (T11-E3): --publicar exige assertPublicable además del gate", () => {
  it("un listado borrador con el gate aprobado: no escribe en runsDir, sale ≠ 0 y el reporte sí se escribe", async () => {
    const c = okCase("olmo", "borrador");
    const { dirs, io, opts, esperar } = setup([c]);
    esperar(c);
    const r = await runEval(opts({ publicar: true }), io);
    expect(r.gate.passed).toBe(true); // aprobado a pesar de todo: lo frena la guarda de publicación
    expect(r.exitCode).not.toBe(0);
    expect(r.messages.join("\n")).toMatch(/borrador/);
    expect(existsSync(dirs.runsDir)).toBe(false);
    expect(existsSync(path.join(dirs.root, "primera-corrida.json"))).toBe(false);
    expect(readFileSync(path.join(dirs.out, "reporte.md"), "utf8")).toMatch(/borrador/);
  });

  it("listado publicable y gate aprobado: publica <hash>.json y registra la primera corrida", async () => {
    const c = okCase("olmo");
    const { dirs, io, opts, esperar } = setup([c]);
    esperar(c);
    const r = await runEval(opts({ publicar: true }), io);
    expect(r.exitCode).toBe(0);
    const file = path.join(dirs.runsDir, `${hashFileName(c.run.modelId as `sha256:${string}`)}.json`);
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(c.run, null, 2) + "\n");
    expect(JSON.parse(readFileSync(path.join(dirs.root, "primera-corrida.json"), "utf8"))).toEqual({ [c.run.modelId]: "2026-11-10" });
    expect(readdirSync(dirs.runsDir)).toHaveLength(1);
  });

  it("sin --publicar no se publica nada aunque el gate apruebe", async () => {
    const c = okCase("olmo");
    const { dirs, io, opts, esperar } = setup([c]);
    esperar(c);
    expect((await runEval(opts(), io)).exitCode).toBe(0);
    expect(existsSync(dirs.runsDir)).toBe(false);
  });

  it("un caso que no está en eval/publico.json no se publica (el segundo fixture queda local)", async () => {
    const c = okCase("olmo");
    const priv = okCase("sabrina");
    const { dirs, io, opts, esperar } = setup([c, priv]);
    esperar(c);
    const withSabrinaSource: EvalIo = { ...io, sourceFor: (id) => ({ daePath: "", runsDir: path.join(dirs.root, id, "runs"), esperadosPath: id === "olmo" ? dirs.esperadosPath : path.join(dirs.root, id, "esperados.json") }) };
    // Sabrina con sus esperados propios
    const sabEsp = path.join(dirs.root, "sabrina", "esperados.json");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(sabEsp), { recursive: true });
    writeFileSync(sabEsp, JSON.stringify({ [priv.run.modelId]: projectRun(priv.run) }));
    const r = await runEval(opts({ publicar: true }), withSabrinaSource);
    expect(r.exitCode).toBe(0);
    expect(existsSync(path.join(dirs.root, "sabrina", "runs"))).toBe(false);
  });
});
