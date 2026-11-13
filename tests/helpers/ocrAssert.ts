import { readFileSync } from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import type { CutListPdf, PdfReading } from "@/pdf/types";
import { PDF_REJECT_RULES } from "@/pdf/rejectRules";

export function ok(reading: PdfReading): CutListPdf {
  if (!reading.ok) throw new Error(`${reading.reason} (${reading.rule}, p. ${reading.page})`);
  return reading.document;
}

/** Rechazo con su `rule` y `page`; la página es un número si y solo si la regla es de una página (OR-18). */
export function rejection(reading: PdfReading) {
  expect(reading.ok).toBe(false);
  if (reading.ok) throw new Error("se esperaba un rechazo");
  expect(Object.keys(PDF_REJECT_RULES)).toContain(reading.rule);
  expect(PDF_REJECT_RULES[reading.rule].reason).toBe(reading.reason);
  expect(reading.page === null).toBe(PDF_REJECT_RULES[reading.rule].scope === "documento");
  return { reason: reading.reason, rule: reading.rule, page: reading.page };
}

/** Documento esperado del fixture sintético (S1, S2 o S3). */
export const expectedSynthetic = (id: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, "..", "fixtures", "pdf-sintetico", "esperado", `${id}.json`), "utf8")) as CutListPdf;
