// Casos reales del eval (docs/spec-t11-harness-minimo.md §2 y §3; plan T11).
// Primer fixture: el .dae del repo y el listado del PDF transcripto (`toListing`), igual que K17 y N9 (T11-E2); NO `olmoDef.pieceTypes`.
// Segundo fixture: local, con el mismo `import()` dinámico que tests/sabrina.test.ts. Si la carpeta no está, "no ejecutado".

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { olmoDef } from "@/data/furniture.mock";
import type { FurnitureDef } from "@/data/types";
import { ListadoInvalidoError } from "@/engine/hash";
import { buildRun } from "@/engine/run";
import { DEFAULT_PARAMS, type AssociationRun } from "@/engine/types";
import { observeDae, type DaeObservation } from "@/model/observe";
import { toListing, type Listing } from "@/pdf/listing";
import type { CutListPdf } from "@/pdf/types";
import { isCutListPdf, validateFurniture } from "@/pdf/validate";
import { LOCAL_FIXTURE_ID, modelSourceFor, REPO_ROOT } from "@/lib/modelSources";

export type RealCase =
  | {
      furnitureId: string;
      status: "ok";
      listing: Extract<Listing, { status: "publicable" | "borrador" }>;
      dae: DaeObservation;
      run: AssociationRun;
    }
  | { furnitureId: string; status: "no-ejecutado"; motivo: string };

/**
 * Arma el caso de un mueble ya observado, con la regla de T11-E5:
 * - un listado `bloqueado` no tiene piezas: `no-ejecutado` con su motivo;
 * - un `ListadoInvalidoError` (código repetido, medida no positiva...) de `buildRun`: `no-ejecutado` con el motivo del error;
 * - CUALQUIER otro error se propaga (`ModeloDistintoError`, `MarcoDistintoError`, `CodigoExcluidoYListadoError`,
 *   `DaeStructureError`...): es un bug del eval o de los datos, no un caso.
 * El motivo nunca lleva códigos ni cifras del mueble: el reporte puede mostrarlo aun para el segundo fixture.
 */
export function buildRealCase(x: { furnitureId: string; listing: Listing; dae: DaeObservation; toleranceMm: number }): RealCase {
  const { furnitureId, listing, dae } = x;
  if (listing.status === "bloqueado") return { furnitureId, status: "no-ejecutado", motivo: `listado bloqueado (${listing.reason})` };
  try {
    const run = buildRun({
      furnitureId,
      modelId: dae.modelId,
      observations: dae.observations,
      listado: listing.pieces,
      params: { toleranceMm: x.toleranceMm, ...DEFAULT_PARAMS },
      excludedCodes: listing.excluded.map((e) => e.code), // T11-E4: hoy [] en el primer fixture
    });
    return { furnitureId, status: "ok", listing, dae, run };
  } catch (error) {
    if (error instanceof ListadoInvalidoError) return { furnitureId, status: "no-ejecutado", motivo: `listado inválido (${error.motivo})` };
    throw error;
  }
}

function readDocuments(file: string): CutListPdf[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("documents" in parsed) || !Array.isArray(parsed.documents)) {
    throw new Error(`${path.basename(file)} no tiene "documents"`);
  }
  return parsed.documents.map((document: unknown, i: number) => {
    if (!isCutListPdf(document)) throw new Error(`${path.basename(file)}: el documento ${i} no cumple el esquema`);
    return document;
  });
}

function olmoCase(): RealCase {
  const source = modelSourceFor("olmo");
  if (source === null) throw new Error("sin fuente del primer fixture");
  const listing = toListing("olmo", validateFurniture(readDocuments(path.join(REPO_ROOT, "tests", "fixtures", "pdf", "olmo.json"))));
  const dae = observeDae(readFileSync(source.daePath));
  return buildRealCase({ furnitureId: "olmo", listing, dae, toleranceMm: olmoDef.toleranceMm });
}

async function sabrinaCase(sabrinaDir: string): Promise<RealCase> {
  const source = modelSourceFor(LOCAL_FIXTURE_ID, { sabrinaDir });
  if (source === null) return { furnitureId: LOCAL_FIXTURE_ID, status: "no-ejecutado", motivo: "carpeta del segundo fixture ausente" };
  const defFile = path.join(sabrinaDir, "data", "sabrina.def.ts");
  const documentsFile = path.join(sabrinaDir, "fixtures", "sabrina.json");
  for (const file of [defFile, documentsFile]) {
    if (!existsSync(file)) throw new Error(`Falta ${path.basename(file)} en la carpeta del segundo fixture.`);
  }
  const def = ((await import(/* @vite-ignore */ defFile)) as { sabrinaDef: FurnitureDef }).sabrinaDef;
  const listing = toListing(def.furniture.id, validateFurniture(readDocuments(documentsFile)));
  const dae = observeDae(readFileSync(source.daePath));
  return buildRealCase({ furnitureId: def.furniture.id, listing, dae, toleranceMm: def.toleranceMm });
}

/** Primer fixture y segundo fixture, en ese orden. Asíncrona por el `import()` del segundo (plan T11). Necesita `installDom()` si corre fuera de vitest. */
export async function loadRealCases(opts: { sabrinaDir: string }): Promise<RealCase[]> {
  return [olmoCase(), await sabrinaCase(opts.sabrinaDir)];
}
