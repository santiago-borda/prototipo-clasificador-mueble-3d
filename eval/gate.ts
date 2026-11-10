// Gate del eval (docs/spec-motor-asociacion.md §9.6; docs/spec-t11-harness-minimo.md §2 y §3; plan T11).
// T11 evalúa G2, G3 y G4. G1 (sin casos sintéticos, T13) y G5 (sin baseline, T20) quedan "no-ejecutado" y NO hacen
// fallar el gate (T11-E7): por eso el resultado es PARCIAL y el reporte lo dice en el encabezado.
// Los detalles del segundo fixture no llevan códigos ni cifras (E13): el reporte puede mostrarlos.

import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { AssociationRun, InstanceResult, Level, Reason } from "@/engine/types";
import { REPO_FIXTURE_IDS } from "@/lib/modelSources";
import type { RealCase } from "./cases";

export interface ExpectedResult {
  instanceKey: string;
  level: Level;
  pieceCode: string | null;
  reasons: Reason[];
  /** Códigos del top-3 de candidatos; la evidencia (texto) no entra: un cambio de redacción no rompe G2 (plan, "Proyección para G2"). */
  top3: string[];
}

export interface ExpectedRun {
  furnitureId: string;
  listadoId: string;
  /** T11: con `passes` distinto el run no es el mismo experimento (T10-E2). */
  passes: 1 | 2;
  results: ExpectedResult[];
}

export type EsperadosFile = Record<string /* modelId */, ExpectedRun>;

export interface GateCheck {
  id: "G1" | "G2" | "G3" | "G4" | "G5";
  status: "ok" | "falla" | "no-ejecutado";
  detail: string;
}

export interface GateResult {
  passed: boolean;
  checks: GateCheck[];
}

const projectResult = (r: InstanceResult): ExpectedResult => ({
  instanceKey: r.instanceKey,
  level: r.level,
  pieceCode: r.pieceCode,
  reasons: [...r.reasons],
  top3: r.candidates.slice(0, 3).map((c) => c.pieceCode),
});

export function projectRun(run: AssociationRun): ExpectedRun {
  return { furnitureId: run.furnitureId, listadoId: run.listadoId, passes: run.passes, results: run.results.map(projectResult) };
}

/** `{}` si el archivo no existe. */
export function readEsperados(file: string): EsperadosFile {
  if (!existsSync(file)) return {};
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${file}: se esperaba un objeto indexado por modelId`);
  return parsed as EsperadosFile; // forma verificada arriba; el contenido lo revisa el equipo a mano (T12)
}

export interface GateInput {
  real: readonly RealCase[];
  /** Esperados del mueble, o `null` si no tiene fuente. Vacío (`{}`) = el archivo no existe o no tiene entradas. */
  esperados: (furnitureId: string) => EsperadosFile | null;
  /** Run ya publicado para (mueble, modelId), o `null` si no hay (T11-E: sin él no se puede detectar una publicación vieja). */
  published: (furnitureId: string, modelId: string) => { engineRunId: string } | null;
  /** JSON de las dos corridas completas (G3). */
  determinism: { a: string; b: string };
  /** Resultado de las permutaciones de instancias y de filas del listado (G4). */
  permutations: { ok: boolean; detail: string };
}

function instancesDiffering(actual: ExpectedRun, expected: ExpectedRun): number {
  const byKey = new Map(expected.results.map((r) => [r.instanceKey, r]));
  const keys = new Set([...byKey.keys(), ...actual.results.map((r) => r.instanceKey)]);
  const mine = new Map(actual.results.map((r) => [r.instanceKey, r]));
  let n = 0;
  for (const key of keys) if (!isDeepStrictEqual(mine.get(key), byKey.get(key))) n++;
  return n;
}

/** Problemas de un caso `ok` frente a esperados y a lo publicado; `[]` = igual. Con cifras solo para casos del repo. */
function problemsOf(c: Extract<RealCase, { status: "ok" }>, input: GateInput): string[] {
  const repo = REPO_FIXTURE_IDS.includes(c.furnitureId);
  const file = input.esperados(c.furnitureId);
  const expected = file?.[c.run.modelId];
  const problems: string[] = [];
  if (file === null || Object.keys(file).length === 0) {
    problems.push("falta esperados");
  } else if (expected === undefined) {
    problems.push("hash distinto (el modelId del .dae no está en esperados)");
  } else {
    const actual = projectRun(c.run);
    if (!isDeepStrictEqual(actual, expected)) {
      problems.push(repo ? `distinto de esperados (${instancesDiffering(actual, expected)} instancias distintas)` : "distinto de esperados");
    }
  }
  const published = input.published(c.furnitureId, c.run.modelId);
  if (published !== null && published.engineRunId !== c.run.engineRunId) {
    problems.push("publicación desactualizada (el engineRunId publicado no es el actual)");
  }
  return problems;
}

function g2(input: GateInput): GateCheck {
  const lines: string[] = [];
  let failed = false;
  for (const c of input.real) {
    if (c.status === "no-ejecutado") {
      if (REPO_FIXTURE_IDS.includes(c.furnitureId)) {
        failed = true; // el primer fixture está en el repo: no correrlo es una falla (T11-E5)
        lines.push(`${c.furnitureId}: FALLA, no ejecutado (${c.motivo})`);
      } else {
        lines.push(`${c.furnitureId}: no ejecutado (${c.motivo}); no falla (§9.1)`);
      }
      continue;
    }
    const problems = problemsOf(c, input);
    if (problems.length === 0) lines.push(`${c.furnitureId}: igual a esperados`);
    else {
      failed = true;
      lines.push(`${c.furnitureId}: FALLA, ${problems.join("; ")}`);
    }
  }
  if (lines.length === 0) {
    return { id: "G2", status: "falla", detail: "sin casos reales" };
  }
  return { id: "G2", status: failed ? "falla" : "ok", detail: lines.join(" | ") };
}

export function evaluateGate(input: GateInput): GateResult {
  const same = input.determinism.a === input.determinism.b;
  const checks: GateCheck[] = [
    { id: "G1", status: "no-ejecutado", detail: "sin casos sintéticos (T13); los casos reales no cuentan para G1 (su precisión es tautológica, §9.1)" },
    g2(input),
    {
      id: "G3",
      status: same ? "ok" : "falla",
      detail: same ? `misma entrada, dos corridas con JSON idéntico (Node ${process.version})` : `las dos corridas dan JSON distinto (Node ${process.version})`,
    },
    { id: "G4", status: input.permutations.ok ? "ok" : "falla", detail: input.permutations.detail },
    { id: "G5", status: "no-ejecutado", detail: "sin baseline (T20)" },
  ];
  return { passed: checks.every((c) => c.status !== "falla"), checks };
}
