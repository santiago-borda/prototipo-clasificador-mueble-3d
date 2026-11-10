// Reporte del eval (docs/spec-motor-asociacion.md §9.5; docs/spec-t11-harness-minimo.md T11-E1, T11-E6, E12, E13).
// - Real y sintético nunca se mezclan en una cifra (§9.1). Sin sintéticos todavía: `VariantOutcome` es `never` hasta T13.
// - Todo como n/N, sin cifra global agregada.
// - Con `passes: 1` no se rankeó: "dudosas sin candidatos", top-1 y top-3 no se calculan (T11-E6).
// - El encabezado dice que el gate es PARCIAL cuando algún check no se ejecutó (hoy G1 y G5).
// - Del segundo fixture, fuera de su carpeta local, no sale ningún código, hash, clave ni cifra (E13).
// Sin tiempos (T11-E1); la versión de Node va en el encabezado y junto a G3.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RealCase } from "./cases";
import type { GateResult } from "./gate";

/** T13 lo define; hasta entonces no hay variantes sintéticas. */
export type VariantOutcome = never;

export const NA_PASADA_1 = "n/a (pasada 1: no se rankeó)";
const NA_SIN_VERDAD = "n/a (sin verdad por caso; T13)";

export interface Ratio {
  n: number;
  N: number;
}

export interface CaseDetail {
  listado: "publicable" | "borrador";
  passes: 1 | 2;
  modelId: string;
  listadoId: string;
  engineRunId: string;
  excluidos: number;
  filasSinCodigo: number;
  resuelto: Ratio;
  dudosas: Ratio;
  sinComponente: number;
  dudosasSinCandidatos: Ratio | typeof NA_PASADA_1;
  top1: typeof NA_PASADA_1 | typeof NA_SIN_VERDAD;
  top3: typeof NA_PASADA_1 | typeof NA_SIN_VERDAD;
  porRazon: Record<string, number>;
  inconsistencias: { kind: string; pieceCode: string | null; instancias: number }[];
}

export interface CaseReport {
  furnitureId: string;
  /** `furnitureId` en `eval/publico.json`: solo estos muestran su detalle en el reporte de salida. */
  publico: boolean;
  status: "ok" | "no-ejecutado";
  motivo?: string;
  /** Ausente en un `no-ejecutado`, y en el reporte de salida de un caso no público. */
  detail?: CaseDetail;
}

export interface Report {
  /** Algún check del gate no se ejecutó. */
  partial: boolean;
  gate: GateResult;
  seed: number;
  node: string;
  cases: CaseReport[];
  /** T13. */
  synthetic: { status: "no-ejecutado"; motivo: string } | { status: "ok"; variantes: number };
}

function detailOf(c: Extract<RealCase, { status: "ok" }>): CaseDetail {
  const { run } = c;
  const withComponent = run.results.filter((r) => r.level !== "sin-asociar"); // `sin-asociar` solo se da por `sin-componente`
  const dudosas = run.results.filter((r) => r.level === "dudosa");
  const porRazon: Record<string, number> = {};
  for (const r of run.results) for (const reason of r.reasons) porRazon[reason] = (porRazon[reason] ?? 0) + 1;
  const pass1 = run.passes === 1;
  return {
    listado: c.listing.status,
    passes: run.passes,
    modelId: run.modelId,
    listadoId: run.listadoId,
    engineRunId: run.engineRunId,
    excluidos: c.listing.excluded.length,
    filasSinCodigo: c.listing.unkeyedRows.length,
    resuelto: { n: run.results.filter((r) => r.level === "segura").length, N: withComponent.length },
    dudosas: { n: dudosas.length, N: withComponent.length },
    sinComponente: run.results.length - withComponent.length,
    dudosasSinCandidatos: pass1 ? NA_PASADA_1 : { n: dudosas.filter((r) => r.candidates.length === 0).length, N: dudosas.length },
    top1: pass1 ? NA_PASADA_1 : NA_SIN_VERDAD,
    top3: pass1 ? NA_PASADA_1 : NA_SIN_VERDAD,
    porRazon: Object.fromEntries(Object.entries(porRazon).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    inconsistencias: run.inconsistencies.map((i) => ({ kind: i.kind, pieceCode: i.pieceCode, instancias: i.instanceKeys.length })),
  };
}

export function buildReport(x: {
  real: readonly RealCase[];
  synthetic: readonly VariantOutcome[];
  gate: GateResult;
  publico: readonly string[];
  seed: number;
  node: string;
}): Report {
  return {
    partial: x.gate.checks.some((c) => c.status === "no-ejecutado"),
    gate: x.gate,
    seed: x.seed,
    node: x.node,
    cases: x.real.map((c): CaseReport => {
      const publico = x.publico.includes(c.furnitureId);
      if (c.status === "no-ejecutado") return { furnitureId: c.furnitureId, publico, status: "no-ejecutado", motivo: c.motivo };
      return { furnitureId: c.furnitureId, publico, status: "ok", detail: detailOf(c) };
    }),
    synthetic: x.synthetic.length === 0 ? { status: "no-ejecutado", motivo: "T13" } : { status: "ok", variantes: x.synthetic.length },
  };
}

export type Scope = "publico" | "completo";

/** En el alcance "publico", los casos no públicos ejecutados pierden su detalle. */
function scoped(report: Report, scope: Scope): Report {
  if (scope === "completo") return report;
  return { ...report, cases: report.cases.map((c) => (c.publico || c.status !== "ok" ? c : { furnitureId: c.furnitureId, publico: false, status: "ok" })) };
}

const ratio = (r: Ratio) => `${r.n}/${r.N}`;
const list = (ids: readonly string[]) => (ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} y ${ids[ids.length - 1]}`);

function renderCase(c: CaseReport): string[] {
  const lines = [`## ${c.furnitureId}`, ""];
  if (c.status === "no-ejecutado") return [...lines, `- Estado: no ejecutado (${c.motivo ?? "sin motivo"})`, ""];
  const d = c.detail;
  if (d === undefined) return [...lines, "- Estado: ejecutado; detalle solo en la carpeta local", ""];
  const razones = Object.entries(d.porRazon).map(([r, n]) => `${r}: ${n}`);
  return [
    ...lines,
    "- Estado: ejecutado",
    `- Listado: ${d.listado}`,
    `- passes: ${d.passes}`,
    `- modelId: ${d.modelId}`,
    `- listadoId: ${d.listadoId}`,
    `- engineRunId: ${d.engineRunId}`,
    `- Códigos excluidos del listado: ${d.excluidos}`,
    `- Filas sin código en el listado: ${d.filasSinCodigo}`,
    `- Resuelto automáticamente: ${ratio(d.resuelto)}`,
    `- Dudosas: ${ratio(d.dudosas)}`,
    `- Sin componente: ${d.sinComponente}`,
    `- Dudosas sin candidatos: ${typeof d.dudosasSinCandidatos === "string" ? d.dudosasSinCandidatos : ratio(d.dudosasSinCandidatos)}`,
    `- Top-1: ${d.top1}`,
    `- Top-3: ${d.top3}`,
    `- Resultados por razón: ${razones.length === 0 ? "ninguna" : razones.join(", ")}`,
    "- Inconsistencias:",
    ...(d.inconsistencias.length === 0 ? ["  - ninguna"] : d.inconsistencias.map((i) => `  - ${i.kind}${i.pieceCode === null ? "" : ` (${i.pieceCode})`}: ${i.instancias} instancias`)),
    "",
  ];
}

export function renderMarkdown(report: Report, scope: Scope): string {
  const r = scoped(report, scope);
  const ran = r.gate.checks.filter((c) => c.status !== "no-ejecutado").map((c) => c.id);
  const notRan = r.gate.checks.filter((c) => c.status === "no-ejecutado").map((c) => c.id);
  return [
    "# Reporte del eval del motor de asociación",
    "",
    r.partial
      ? `> **GATE PARCIAL — solo ${list(ran)}.** ${list(notRan)} no ejecutado${notRan.length > 1 ? "s" : ""} (ver abajo): un gate aprobado NO equivale a un gate completo.`
      : "> Gate completo: G1 a G5 evaluados.",
    "",
    `Gate: **${r.gate.passed ? "APROBADO" : "FALLIDO"}** · Node ${r.node} · semilla ${r.seed}`,
    "",
    "## Gate",
    "",
    ...r.gate.checks.map((c) => `- ${c.id}: ${c.status} — ${c.detail}`),
    "",
    "Los casos reales no miden precisión: la verdad sale del código (tautológica, §9.1).",
    "",
    ...r.cases.flatMap(renderCase),
    "## Casos sintéticos",
    "",
    r.synthetic.status === "no-ejecutado" ? `Casos sintéticos: no ejecutados (${r.synthetic.motivo})` : `Casos sintéticos: ${r.synthetic.variantes} variantes`,
    "",
  ].join("\n");
}

export function renderJson(report: Report, scope: Scope): string {
  return JSON.stringify(scoped(report, scope), null, 2) + "\n";
}

/**
 * `reporte.json` y `reporte.md` en `outDir`, sin el detalle de los casos no públicos. Si hay un caso no público ejecutado y
 * `privateDir` (dentro de la carpeta local del segundo fixture), el detalle completo va ahí y solo ahí.
 */
export function writeReport(report: Report, outDir: string, privateDir?: string): void {
  const write = (dir: string, scope: Scope) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "reporte.json"), renderJson(report, scope));
    writeFileSync(path.join(dir, "reporte.md"), renderMarkdown(report, scope));
  };
  write(outDir, "publico");
  if (privateDir !== undefined && report.cases.some((c) => !c.publico && c.status === "ok")) write(privateDir, "completo");
}
