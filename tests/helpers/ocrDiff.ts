// Comparación de una lectura contra el documento esperado, para CA-1 (ningún valor distinto sin `pending`).
// Los mismos criterios que usa tests/pdf.ocrRealLike.test.ts: `generatedAt` se compara ignorando espacios (N-1) y un
// campo distinto está cubierto si su ruta, o un prefijo suyo, tiene `pending`.

import type { CutListPdf } from "@/pdf/types";
import { withoutSource } from "./pdfTextLayout";

/** N-1: `generatedAt` se compara ignorando espacios. */
export const sameDate = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/** Rutas de los campos (hojas del árbol) con un valor distinto del esperado. */
export function differences(got: unknown, want: unknown, at = ""): string[] {
  if (at === "header.generatedAt" && typeof got === "string" && typeof want === "string") return sameDate(got, want) ? [] : [at];
  if (Array.isArray(got) && Array.isArray(want)) {
    const length = Math.max(got.length, want.length);
    return Array.from({ length }, (_, i) => differences(got[i], want[i], `${at}[${i}]`)).flat();
  }
  if (got && want && typeof got === "object" && typeof want === "object") {
    const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
    return [...keys].flatMap((key) => differences((got as Record<string, unknown>)[key], (want as Record<string, unknown>)[key], at === "" ? key : `${at}.${key}`));
  }
  return Object.is(got, want) ? [] : [at];
}

/** Un campo distinto está cubierto si su ruta (o un prefijo de ella) tiene `pending`. */
export const covered = (document: CutListPdf, field: string) =>
  document.pending.some((p) => field === p.path || field.startsWith(`${p.path}.`) || field.startsWith(`${p.path}[`));

/** Campos distintos del esperado y sin `pending`: lo que CA-1 exige que sea vacío. */
export const unmarkedAgainst = (document: CutListPdf, expected: CutListPdf): string[] =>
  differences(withoutSource({ ...document, pending: [] }), withoutSource({ ...expected, pending: [] })).filter((field) => !covered(document, field));
