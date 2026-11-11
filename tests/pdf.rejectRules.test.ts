// OR-18 (docs/spec-ocr-prueba-real.md §11; spec-revision-ocr-real §6.1, enmienda C2): cada sitio de rechazo del parser
// tiene un `rule` propio de un catálogo cerrado y `page` es un número solo si el rechazo es de una página.
// Prueba estática sobre el código de src/pdf/parseText.ts: no depende de ningún PDF.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDF_REJECT_RULES } from "@/pdf/rejectRules";
import { parseCutListText } from "@/pdf/parseText";

const SOURCE = readFileSync(path.resolve(__dirname, "..", "src", "pdf", "parseText.ts"), "utf8");
const SITES = [...SOURCE.matchAll(/new ReadFailure\(\s*"([a-z-]+)",\s*([^,]+),/g)].map((m) => ({ rule: m[1], page: m[2].trim() }));

describe("OR-18 catálogo de reglas de rechazo", () => {
  it("todos los sitios de rechazo pasan una regla literal (ninguno se escapa del patrón)", () => {
    expect(SITES.length).toBe((SOURCE.match(/new ReadFailure\(/g) ?? []).length);
    expect(SITES.length).toBeGreaterThanOrEqual(21);
  });

  it("un id por sitio: ningún id repetido, y el catálogo no tiene ids sin sitio", () => {
    const rules = SITES.map((site) => site.rule);
    expect(new Set(rules).size).toBe(rules.length);
    expect([...rules].sort()).toEqual(Object.keys(PDF_REJECT_RULES).sort());
  });

  it("page es null solo en los rechazos de documento, y un número en los de una página", () => {
    for (const site of SITES) {
      const scope = PDF_REJECT_RULES[site.rule as keyof typeof PDF_REJECT_RULES].scope;
      expect(site.page === "null", `${site.rule}: page = ${site.page}`).toBe(scope === "documento");
    }
  });

  it("R-11 (aprobada el 11/11/2026): el catálogo suma resumen-celda-duplicada y resumen-fila-ambigua", () => {
    for (const rule of ["resumen-celda-duplicada", "resumen-fila-ambigua"]) {
      expect(Object.keys(PDF_REJECT_RULES), rule).toContain(rule);
      expect(SITES.map((site) => site.rule), rule).toContain(rule);
    }
  });

  it("ningún id contiene texto del documento: solo minúsculas y guiones", () => {
    for (const rule of Object.keys(PDF_REJECT_RULES)) expect(rule).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("el rechazo devuelto lleva reason, rule y page (sin texto: un documento vacío)", () => {
    const reading = parseCutListText({ fileName: "x", pdfId: null, producer: null, readerVersion: "prueba/1", pageWidths: [], elements: [] });
    expect(reading).toEqual({ ok: false, reason: "sin-capa-de-texto", detail: expect.any(String), rule: "documento-sin-texto", page: null });
  });
});
