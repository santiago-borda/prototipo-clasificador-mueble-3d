// `npm run eval` (plan T11; docs/spec-t11-harness-minimo.md §3). Corre los casos reales, evalúa el gate (parcial: G2, G3 y G4),
// escribe reporte.json y reporte.md y sale con 0 si el gate aprueba, 1 si no. Hasta T12 sale con 1: G2 falla con "falta esperados" (T11-E9).
//
// Flags: --sabrina-dir <ruta> (por defecto Sabrina), --out <dir> (por defecto eval/out), --seed <n> (por defecto 1),
//        --publicar (gate aprobado Y listado publicable), --escribir-esperados (escribe la proyección; no aprueba el gate).

import path from "node:path";
import { DEFAULT_SABRINA_DIR, REPO_ROOT } from "@/lib/modelSources";
import { installDom } from "./dom";
import { runEval, type EvalOptions } from "./harness";

function parseArgs(argv: readonly string[]): EvalOptions {
  const opts: EvalOptions = { sabrinaDir: DEFAULT_SABRINA_DIR, outDir: path.join(REPO_ROOT, "eval", "out"), seed: 1, publicar: false, escribirEsperados: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Falta el valor de ${flag}`);
      return v;
    };
    if (flag === "--") continue;
    else if (flag === "--sabrina-dir") opts.sabrinaDir = path.resolve(value());
    else if (flag === "--out") opts.outDir = path.resolve(value());
    else if (flag === "--seed") {
      const seed = Number(value());
      if (!Number.isInteger(seed)) throw new Error("--seed tiene que ser un entero");
      opts.seed = seed;
    } else if (flag === "--publicar") opts.publicar = true;
    else if (flag === "--escribir-esperados") opts.escribirEsperados = true;
    else throw new Error(`Bandera desconocida: ${flag}`);
  }
  return opts;
}

async function main(): Promise<number> {
  const { jsdomVersion } = installDom();
  console.log(`jsdom ${jsdomVersion}`);
  const opts = parseArgs(process.argv.slice(2));
  const { exitCode, gate, messages } = await runEval(opts);
  const notRan = gate.checks.filter((c) => c.status === "no-ejecutado").map((c) => c.id);
  if (notRan.length > 0) console.log(`GATE PARCIAL: ${notRan.join(" y ")} no ejecutado${notRan.length > 1 ? "s" : ""} (solo se evaluaron los demás).`);
  for (const check of gate.checks) console.log(`${check.id}: ${check.status} — ${check.detail}`);
  for (const message of messages) console.log(message);
  console.log(`Gate: ${gate.passed ? "aprobado" : "fallido"}${notRan.length > 0 ? " (parcial)" : ""}. Reporte en ${opts.outDir}`);
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(2);
  },
);
