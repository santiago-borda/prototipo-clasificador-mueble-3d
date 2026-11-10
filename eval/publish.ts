// Publicación del AssociationRun (plan T11; docs/spec-motor-asociacion.md §9.7). La guarda de publicación (E2,
// `assertPublicable`) y el gate los aplica el que llama (harness.ts): acá solo se escribe, y solo para la lista pública.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashFileName } from "@/engine/hash";
import type { AssociationRun } from "@/engine/types";

/** `<runsDir>/<hash>.json` con `JSON.stringify(run, null, 2) + "\n"`; rechaza un `furnitureId` fuera de `eval/publico.json`. Devuelve la ruta. */
export function publishRun(run: AssociationRun, runsDir: string, publico: readonly string[]): string {
  if (!publico.includes(run.furnitureId)) {
    throw new Error(`El mueble "${run.furnitureId}" no está en la lista pública (eval/publico.json): no se publica.`);
  }
  if (!run.modelId.startsWith("sha256:")) throw new Error("El modelId del run no es un sha256:<hex>.");
  const file = path.join(runsDir, `${hashFileName(run.modelId as `sha256:${string}`)}.json`);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(file, JSON.stringify(run, null, 2) + "\n");
  return file;
}

function readDates(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${file}: se esperaba un objeto modelId → fecha`);
  return parsed as Record<string, string>;
}

/** Fecha de la primera corrida por `modelId`. Se escribe una sola vez: no sobrescribe una entrada existente. */
export function recordFirstRun(file: string, modelId: string, date: string): void {
  const dates = readDates(file);
  if (modelId in dates) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...dates, [modelId]: date }, null, 2) + "\n");
}
