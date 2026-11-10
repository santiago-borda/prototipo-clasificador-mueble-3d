// Orquestación del eval (plan T11; docs/spec-t11-harness-minimo.md §3). Corre los casos reales, calcula G3 y G4 (dos corridas
// completas y 20 permutaciones por caso), evalúa el gate, escribe el reporte y, con --publicar, publica.
// Las fuentes entran por `EvalIo` para que las pruebas usen directorios temporales y nunca toquen eval/runs/ ni eval/esperados.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashFileName } from "@/engine/hash";
import { buildRun } from "@/engine/run";
import { modelSourceFor, REPO_ROOT, type ModelSource } from "@/lib/modelSources";
import { assertPublicable, ListadoNoPublicableError } from "@/pdf/listing";
import { loadRealCases, type RealCase } from "./cases";
import { evaluateGate, projectRun, readEsperados, type GateResult } from "./gate";
import { publishRun, recordFirstRun } from "./publish";
import { buildReport, writeReport } from "./report";

export interface EvalOptions {
  sabrinaDir: string;
  outDir: string;
  seed: number;
  publicar: boolean;
  escribirEsperados: boolean;
}

export interface EvalIo {
  loadCases: (opts: { sabrinaDir: string }) => Promise<RealCase[]>;
  sourceFor: (furnitureId: string, opts: { sabrinaDir?: string }) => ModelSource | null;
  /** `eval/publico.json`: muebles que pueden aparecer en reportes versionados y en `eval/runs/`. */
  publico: readonly string[];
  /** Fecha para `primera-corrida.json` (AAAA-MM-DD). El run no lleva fechas (G3). */
  today: () => string;
}

export interface EvalOutcome {
  exitCode: number;
  gate: GateResult;
  messages: string[];
}

export const PERMUTATIONS = 20;

export function defaultIo(): EvalIo {
  const parsed: unknown = JSON.parse(readFileSync(path.join(REPO_ROOT, "eval", "publico.json"), "utf8"));
  if (!Array.isArray(parsed) || !parsed.every((x): x is string => typeof x === "string")) throw new Error("eval/publico.json debe ser una lista de furnitureId");
  return { loadCases: loadRealCases, sourceFor: modelSourceFor, publico: parsed, today: () => new Date().toISOString().slice(0, 10) };
}

/** PRNG propio con semilla (no `Math.random`, spec-motor §9.2). T13 lo mueve a eval/perturb/prng.ts. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** G4: el run no cambia si se permutan las instancias y las filas del listado (M6). */
function checkPermutations(cases: readonly RealCase[], seed: number): { ok: boolean; detail: string } {
  let index = 0;
  for (const c of cases) {
    if (c.status !== "ok") continue;
    const expected = JSON.stringify(c.run);
    for (let p = 0; p < PERMUTATIONS; p++) {
      const rnd = mulberry32(seed * 7919 + index * 104729 + p);
      const run = buildRun({
        furnitureId: c.furnitureId,
        modelId: c.dae.modelId,
        observations: shuffled(c.dae.observations, rnd),
        listado: shuffled(c.listing.pieces, rnd),
        params: c.run.params,
        excludedCodes: shuffled(c.listing.excluded.map((e) => e.code), rnd),
      });
      if (JSON.stringify(run) !== expected) return { ok: false, detail: `el run cambia al permutar instancias y filas del listado (caso ${c.furnitureId})` };
    }
    index++;
  }
  return { ok: true, detail: `${PERMUTATIONS} permutaciones por caso (instancias y filas del listado, semilla ${seed}), todas con JSON idéntico` };
}

const summary = (c: RealCase) => (c.status === "ok" ? c.run : { furnitureId: c.furnitureId, motivo: c.motivo });

function publishedRunOf(source: ModelSource | null, modelId: string): { engineRunId: string } | null {
  if (source === null || !modelId.startsWith("sha256:")) return null;
  const file = path.join(source.runsDir, `${hashFileName(modelId as `sha256:${string}`)}.json`);
  if (!existsSync(file)) return null;
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("engineRunId" in parsed) || typeof parsed.engineRunId !== "string") {
    throw new Error(`El run publicado ${path.basename(file)} no tiene engineRunId.`);
  }
  return { engineRunId: parsed.engineRunId };
}

export async function runEval(opts: EvalOptions, io: EvalIo = defaultIo()): Promise<EvalOutcome> {
  const messages: string[] = [];
  const dir = { sabrinaDir: opts.sabrinaDir };

  // G3: dos corridas completas (lectura del .dae y del listado incluidas) con el mismo JSON.
  const real = await io.loadCases(dir);
  const again = await io.loadCases(dir);

  const gate = evaluateGate({
    real,
    esperados: (id) => {
      const source = io.sourceFor(id, dir);
      return source === null ? null : readEsperados(source.esperadosPath);
    },
    published: (id, modelId) => publishedRunOf(io.sourceFor(id, dir), modelId),
    determinism: { a: JSON.stringify(real.map(summary)), b: JSON.stringify(again.map(summary)) },
    permutations: checkPermutations(real, opts.seed),
  });

  const report = buildReport({ real, synthetic: [], gate, publico: io.publico, seed: opts.seed, node: process.version });
  writeReport(report, opts.outDir, path.join(opts.sabrinaDir, "eval", "out"));

  let exitCode = gate.passed ? 0 : 1;

  if (opts.escribirEsperados) {
    for (const c of real) {
      if (c.status !== "ok") continue;
      const source = io.sourceFor(c.furnitureId, dir);
      if (source === null) continue;
      mkdirSync(path.dirname(source.esperadosPath), { recursive: true });
      writeFileSync(source.esperadosPath, JSON.stringify({ ...readEsperados(source.esperadosPath), [c.run.modelId]: projectRun(c.run) }, null, 2) + "\n");
      messages.push(`esperados escritos para ${c.furnitureId}: ${source.esperadosPath}`);
    }
    messages.push("--escribir-esperados no aprueba el gate en esa corrida: revisá la proyección a mano y volvé a correr sin la bandera.");
    return { exitCode: 1, gate, messages };
  }

  if (opts.publicar) {
    if (!gate.passed) {
      messages.push("--publicar: el gate no aprobó; no se publica nada.");
      exitCode = 1;
    } else {
      const toPublish = real.filter((c): c is Extract<RealCase, { status: "ok" }> => c.status === "ok" && io.publico.includes(c.furnitureId));
      // Guarda de publicación (E2, T11-E3): antes de escribir NADA, todos los listados tienen que ser publicables.
      const blocked = toPublish.flatMap((c) => {
        try {
          assertPublicable(c.listing);
          return [];
        } catch (error) {
          if (error instanceof ListadoNoPublicableError) return [`el listado de ${c.furnitureId} está ${error.status}`];
          throw error;
        }
      });
      if (blocked.length > 0) {
        messages.push(`--publicar: ${blocked.join("; ")}: no se publica nada. El reporte sí se escribió.`);
        exitCode = 1;
      } else if (toPublish.length === 0) {
        messages.push("--publicar: no hay un caso de eval/publico.json para publicar.");
        exitCode = 1;
      } else {
        for (const c of toPublish) {
          const source = io.sourceFor(c.furnitureId, dir);
          if (source === null) throw new Error(`Sin fuente para publicar ${c.furnitureId}.`);
          messages.push(`publicado: ${publishRun(c.run, source.runsDir, io.publico)}`);
          recordFirstRun(path.join(path.dirname(source.esperadosPath), "primera-corrida.json"), c.run.modelId, io.today());
        }
      }
    }
  }

  return { exitCode, gate, messages };
}
