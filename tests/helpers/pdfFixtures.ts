// Acceso a los fixtures del PDF. El de Sabrina es local (carpeta ignorada): las pruebas que lo usan se saltean si falta.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isCutListPdf } from "@/pdf/validate";
import type { CutListPdf } from "@/pdf/types";

const ROOT = path.resolve(__dirname, "..", "..");
export const SABRINA_FIXTURE = path.join(ROOT, "Sabrina", "fixtures", "sabrina.json");
export const HAS_SABRINA_FIXTURE = existsSync(SABRINA_FIXTURE);

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

/** Copia nueva en cada llamada: las pruebas la mutan. */
export const olmoDocuments = (): CutListPdf[] => readDocuments(path.join(ROOT, "tests", "fixtures", "pdf", "olmo.json"));

export const sabrinaDocuments = (): CutListPdf[] => readDocuments(SABRINA_FIXTURE);

