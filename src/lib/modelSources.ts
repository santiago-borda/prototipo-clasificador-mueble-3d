// Dónde viven el .dae, los runs publicados y los esperados de cada mueble (plan T11; docs/spec-t11-harness-minimo.md §3).
// Usa node:fs: solo eval y servidor, nunca un archivo "use client" ni src/pdf/ (prueba H10, igual que hash.ts).

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export interface ModelSource {
  daePath: string;
  runsDir: string;
  esperadosPath: string;
}

/** Raíz del repo (este archivo está en src/lib/). `__dirname` lo dan vitest y vite-node; `import.meta.url` no es una URL file: en el entorno jsdom de vitest. */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Muebles que viven en el repo (el .dae está versionado): para ellos "no ejecutado" es una falla (T11-E5). */
export const REPO_FIXTURE_IDS: readonly string[] = ["olmo"];

/** Id del segundo fixture, local (carpeta ignorada `Sabrina/`). */
export const LOCAL_FIXTURE_ID = "sabrina";

export const DEFAULT_SABRINA_DIR = path.join(REPO_ROOT, "Sabrina");

/**
 * Primer fixture: `public/models/Olmo/olmo.dae`, `eval/runs`, `eval/esperados.json`.
 * Segundo fixture: el único .dae de `<sabrinaDir>/Archivo Collada`, `<sabrinaDir>/eval/runs` y `<sabrinaDir>/eval/esperados.json`;
 * `null` si la carpeta no existe. Con la carpeta pero sin un único .dae lanza: es una configuración rota, no un caso.
 */
export function modelSourceFor(furnitureId: string, opts: { sabrinaDir?: string } = {}): ModelSource | null {
  if (furnitureId === "olmo") {
    return {
      daePath: path.join(REPO_ROOT, "public", "models", "Olmo", "olmo.dae"),
      runsDir: path.join(REPO_ROOT, "eval", "runs"),
      esperadosPath: path.join(REPO_ROOT, "eval", "esperados.json"),
    };
  }
  if (furnitureId === LOCAL_FIXTURE_ID) {
    const dir = opts.sabrinaDir ?? DEFAULT_SABRINA_DIR;
    if (!existsSync(dir)) return null;
    const daeDir = path.join(dir, "Archivo Collada");
    const daes = existsSync(daeDir) ? readdirSync(daeDir).filter((f) => f.toLowerCase().endsWith(".dae")) : [];
    if (daes.length !== 1) throw new Error(`Se esperaba un único .dae en "Archivo Collada" de la carpeta del segundo fixture y hay ${daes.length}.`);
    return {
      daePath: path.join(daeDir, daes[0]),
      runsDir: path.join(dir, "eval", "runs"),
      esperadosPath: path.join(dir, "eval", "esperados.json"),
    };
  }
  return null;
}
