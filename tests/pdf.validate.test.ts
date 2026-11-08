// Validador del esquema del PDF (docs/test-plan-esquema-pdf.md). Los casos se derivan del fixture del Olmo
// cambiando un solo campo (mutación mínima).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCode } from "@/pdf/code";
import { edgeStripsToEdgeIds } from "@/pdf/edges";
import { PDF_REASONS, REJECTING_REASONS } from "@/pdf/reasons";
import type { CutListPdf, EdgeStrip, EdgeStrips } from "@/pdf/types";
import { validateCutListPdf, validateFurniture, type DocumentValidation, type ValidatedDocument } from "@/pdf/validate";
import { HAS_SABRINA_FIXTURE, olmoDocuments, sabrinaDocuments } from "./helpers/pdfFixtures";

const [BLANCO, GAUDI, FONDO] = [0, 1, 2];
const olmo = (i = BLANCO): CutListPdf => olmoDocuments()[i];

function accepted(result: DocumentValidation): ValidatedDocument {
  if (result.status !== "validado") throw new Error(`rechazado: ${result.findings.map((f) => `${f.reason} ${f.path}`).join("; ")}`);
  return result;
}
const reasonsOf = (result: DocumentValidation) => [...new Set(result.findings.map((f) => f.reason))];
const rejectedWith = (input: unknown) => {
  const result = validateCutListPdf(input);
  expect(result.status).toBe("rechazado");
  return reasonsOf(result);
};
const strip = (material = "Gaudi"): EdgeStrip => ({ label: `Canto ${material} ~ 0 mm x 22 mm`, material, widthMm: 22, thicknessText: "~ 0 mm" });
const noEdges = (): EdgeStrips => ({ s1: null, s2: null, s3: null, s4: null });

/** Un material con dos hojas válidas: Gaudi partido en A–D (hoja 1) y E–F (hoja 2). */
function twoSheets(): CutListPdf {
  const doc = olmo(GAUDI);
  const first = doc.boards[0];
  const second = structuredClone(first);
  first.total = 2;
  first.pieces = first.pieces.slice(0, 4);
  first.pieceCount = 8;
  first.diagram = [{ letter: "A", count: 2 }, { letter: "B", count: 2 }, { letter: "C", count: 2 }, { letter: "D", count: 2 }];
  second.index = 2;
  second.total = 2;
  second.pages = [3];
  second.pieces = second.pieces.slice(4);
  second.pieceCount = 2;
  second.diagram = [{ letter: "E", count: 1 }, { letter: "F", count: 1 }];
  doc.boards.push(second);
  doc.summary.boards[0].count = 2;
  return doc;
}

describe("catálogo de razones", () => {
  it("es cerrado y sin repetidos", () => {
    expect(new Set(PDF_REASONS).size).toBe(PDF_REASONS.length);
    expect(PDF_REASONS).toContain("hoja-incompleta");
    expect(PDF_REASONS).toContain("campo-pendiente");
  });

  it("es el mismo catálogo de spec-esquema §7.3, en el mismo orden (incluye canteado-sin-definir)", () => {
    const spec = readFileSync(path.resolve(__dirname, "..", "docs", "spec-esquema-pdf.md"), "utf8");
    const line = spec.split(/\r?\n/).find((l) => l.startsWith("Catálogo cerrado de razones:"));
    expect(line).toBeDefined();
    const listed = [...(line ?? "").matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
    expect(PDF_REASONS).toEqual(listed);
  });

  it("canteado-sin-definir es informativa: no rechaza documentos", () => {
    expect(PDF_REASONS).toContain("canteado-sin-definir");
    expect(REJECTING_REASONS).not.toContain("canteado-sin-definir");
  });
});

describe("lectura y estructura", () => {
  it("TP-01: el Olmo completo es válido, con 21 códigos y sin filas dudosas", () => {
    const furniture = validateFurniture(olmoDocuments());
    expect(furniture.status).toBe("publicable");
    expect(furniture.findings).toEqual([]);
    for (const document of furniture.documents) {
      const validated = accepted(document);
      expect(validated.findings).toEqual([]);
      expect(validated.rows.every((row) => row.level === "segura" && row.reasons.length === 0)).toBe(true);
    }
    expect(furniture.totals).toHaveLength(21);
    expect(furniture.totals.reduce((sum, t) => sum + (t.total ?? 0), 0)).toBe(33);
  });

  it("TP-02: \"Ajustadas\" no entra; finalL y finalA quedan como están", () => {
    const doc = olmo();
    doc.columns.adjusted = true;
    const { document } = accepted(validateCutListPdf(doc));
    expect(document.columns.adjusted).toBe(true);
    expect(Object.keys(document.boards[0].pieces[0]).sort()).toEqual(["code", "edges", "finalA", "finalL", "letter", "name", "quantity"]);
    expect(document.boards[0].pieces[0].finalL).toBe(980);
  });

  it("TP-03: INV-1 cumple (Blanco nature: 20 = pieceCount)", () => {
    const doc = olmo();
    expect(doc.boards[0].pieces.reduce((s, p) => s + (p.quantity ?? 0), 0)).toBe(20);
    expect(reasonsOf(validateCutListPdf(doc))).not.toContain("suma-tablero-no-coincide");
  });

  it("TP-04: INV-1 falla con una cantidad +1", () => {
    const doc = olmo();
    doc.boards[0].pieces[0].quantity = 2;
    expect(reasonsOf(validateCutListPdf(doc))).toContain("suma-tablero-no-coincide");
  });

  it("TP-05: INV-2 cumple con varios tableros", () => {
    expect(accepted(validateCutListPdf(twoSheets())).findings).toEqual([]);
  });

  it("TP-06: INV-2 falla con parts -1", () => {
    const doc = olmo();
    doc.summary.boards[0].parts -= 1;
    expect(reasonsOf(validateCutListPdf(doc))).toEqual(["suma-resumen-no-coincide"]);
  });

  it("TP-07: INV-2 falla por hojas (count 2 con una sola)", () => {
    const doc = olmo();
    doc.summary.boards[0].count = 2;
    expect(reasonsOf(validateCutListPdf(doc))).toEqual(["suma-resumen-no-coincide"]);
  });

  it("TP-08: INV-3 cumple en los diagramas del Olmo", () => {
    for (const doc of olmoDocuments()) expect(reasonsOf(validateCutListPdf(doc))).not.toContain("diagrama-no-coincide");
  });

  it("TP-09: INV-3 falla por count, por letra sin fila y por fila sin letra", () => {
    const fewer = olmo();
    const diagram = fewer.boards[0].diagram;
    if (diagram === "pendiente") throw new Error("el fixture trae diagrama");
    diagram[3].count -= 1;
    const fewerResult = accepted(validateCutListPdf(fewer));
    expect(reasonsOf(fewerResult)).toEqual(["diagrama-no-coincide"]);
    expect(fewerResult.rows.filter((r) => r.level === "dudosa").map((r) => r.letter)).toEqual(["D"]);

    const extra = olmo();
    (extra.boards[0].diagram as { letter: string; count: number }[]).push({ letter: "Z", count: 1 });
    expect(reasonsOf(validateCutListPdf(extra))).toEqual(["diagrama-no-coincide"]);

    const missing = olmo();
    (missing.boards[0].diagram as { letter: string; count: number }[]).shift();
    expect(reasonsOf(validateCutListPdf(missing))).toEqual(["diagrama-no-coincide"]);
  });

  it("TP-16: INV-5 falla con dos filas de la misma letra; cumple en el fixture", () => {
    expect(reasonsOf(validateCutListPdf(olmo()))).not.toContain("letra-duplicada-en-tablero");
    const doc = olmo();
    doc.boards[0].pieces[1].letter = "A";
    expect(reasonsOf(validateCutListPdf(doc))).toContain("letra-duplicada-en-tablero");
  });

  it("TP-17: INV-8 falla con L mayor que el tablero; cumple rotada", () => {
    const big = olmo();
    big.boards[0].pieces[0].finalL = 2751;
    expect(reasonsOf(validateCutListPdf(big))).toContain("pieza-mayor-que-tablero");

    const rotated = olmo();
    rotated.boards[0].pieces[0].finalL = 1000;
    rotated.boards[0].pieces[0].finalA = 2700;
    expect(reasonsOf(validateCutListPdf(rotated))).not.toContain("pieza-mayor-que-tablero");
  });

  it("TP-18: INV-13 falla con 101; fillRatePct distinto de efficiencyPct no es razón", () => {
    const doc = olmo();
    doc.boards[0].efficiencyPct = 101;
    expect(reasonsOf(validateCutListPdf(doc))).toEqual(["porcentaje-invalido"]);

    const fill = olmo();
    fill.summary.fillRatePct = -1;
    expect(reasonsOf(validateCutListPdf(fill))).toEqual(["porcentaje-invalido"]);

    const differ = olmo();
    expect(differ.summary.fillRatePct).not.toBe(differ.boards[0].efficiencyPct);
    expect(accepted(validateCutListPdf(differ)).findings).toEqual([]);
  });

  it("TP-19: INV-0 rechaza null sin pending, cantidad 0 y cantidad 1,5", () => {
    const noPending = olmo();
    noPending.summary.cutCount = null;
    expect(rejectedWith(noPending)).toEqual(["esquema-invalido"]);
    for (const quantity of [0, 1.5]) {
      const doc = olmo();
      doc.boards[0].pieces[0].quantity = quantity;
      expect(rejectedWith(doc)).toEqual(["esquema-invalido"]);
    }
    expect(rejectedWith(null)).toEqual(["esquema-invalido"]);
    expect(rejectedWith({ schema: "otro" })).toEqual(["esquema-invalido"]);
  });

  it("INV-0: unidad distinta de mm se rechaza como unidad-no-soportada", () => {
    const doc: unknown = { ...olmo(), header: { ...olmo().header, unit: "in" } };
    expect(rejectedWith(doc)).toEqual(["unidad-no-soportada"]);
  });
});

describe("filas con campos no leídos", () => {
  it("TP-91: null con su pending no rechaza; la fila queda dudosa y no dispara INV-1 ni INV-8", () => {
    const doc = olmo();
    doc.boards[0].pieces[2].finalA = null;
    doc.boards[0].pieces[3].quantity = null;
    doc.pending.push(
      { path: "boards[0].pieces[2].finalA", reason: "ilegible" },
      { path: "boards[0].pieces[3].quantity", reason: "ilegible" },
    );
    const result = accepted(validateCutListPdf(doc));
    expect(reasonsOf(result)).toEqual(["campo-pendiente"]);
    expect(result.rows.filter((r) => r.level === "dudosa").map((r) => r.letter)).toEqual(["C", "D"]);
  });

  it("TP-92: un pending fuera de una fila no vuelve dudosa ninguna fila; INV-3 queda sin verificar", () => {
    const doc = olmo();
    doc.summary.cutCount = null;
    doc.boards[0].diagram = "pendiente";
    doc.pending.push({ path: "summary.cutCount", reason: "ilegible" }, { path: "boards[0].diagram", reason: "ilegible" });
    const result = accepted(validateCutListPdf(doc));
    expect(result.findings).toEqual([]);
    expect(result.rows.every((r) => r.level === "segura")).toBe(true);

    const unmarked = olmo();
    unmarked.boards[0].diagram = "pendiente";
    expect(rejectedWith(unmarked)).toEqual(["esquema-invalido"]);
  });

  it("TP-93: excepciones de INV-0", () => {
    const doc = olmo();
    doc.source.producer = null;
    expect(doc.source.pdfId).toBeNull();
    expect(accepted(validateCutListPdf(doc)).findings).toEqual([]);

    const withStrips = olmo();
    withStrips.columns.edgeStrips = true;
    for (const piece of withStrips.boards[0].pieces) piece.edges = noEdges();
    expect(validateCutListPdf({ ...withStrips, boards: withStrips.boards }).status).toBe("validado");

    const real = olmo();
    real.source.reader = "texto-pdf";
    expect(rejectedWith(real)).toEqual(["esquema-invalido"]);
    real.source.pdfId = "sha256:abc";
    expect(validateCutListPdf(real).status).toBe("validado");
  });

  it("TP-94: una razón de tablero marca solo las filas de esa hoja", () => {
    const doc = twoSheets();
    doc.boards[0].pieceCount = 9;
    doc.summary.boards[0].parts = 11;
    const result = accepted(validateCutListPdf(doc));
    expect(reasonsOf(result)).toEqual(["suma-tablero-no-coincide"]);
    expect(result.rows.filter((r) => r.board === 0).every((r) => r.level === "dudosa")).toBe(true);
    expect(result.rows.filter((r) => r.board === 1).every((r) => r.level === "segura")).toBe(true);
  });

  it("una razón de documento marca todas las filas", () => {
    const doc = twoSheets();
    doc.summary.boards[0].parts += 1;
    const result = accepted(validateCutListPdf(doc));
    expect(result.rows.every((r) => r.level === "dudosa" && r.reasons.includes("suma-resumen-no-coincide"))).toBe(true);
  });
});

describe("L y A", () => {
  it("TP-10: L < A se conserva sin razones (INV-7)", () => {
    const doc = olmo();
    doc.boards[0].pieces[0].finalL = 100;
    doc.boards[0].pieces[0].finalA = 1200;
    const result = accepted(validateCutListPdf(doc));
    expect(result.findings).toEqual([]);
    expect(result.document.boards[0].pieces[0]).toMatchObject({ finalL: 100, finalA: 1200 });
  });
});

describe("varios tableros y unicidad", () => {
  /** Dos hojas con el código de la fila A también en la hoja 2. */
  function repeated(): CutListPdf {
    const doc = twoSheets();
    const copy = structuredClone(doc.boards[0].pieces[0]);
    copy.quantity = 3;
    doc.boards[0].pieces[0].quantity = 1;
    doc.boards[0].pieceCount -= 1;
    doc.boards[1].pieces.push(copy);
    doc.boards[1].pieceCount += 3;
    doc.boards[0].diagram = "pendiente";
    doc.boards[1].diagram = "pendiente";
    doc.pending.push({ path: "boards[0].diagram", reason: "sintético" }, { path: "boards[1].diagram", reason: "sintético" });
    doc.summary.boards[0].parts = doc.boards[0].pieceCount + doc.boards[1].pieceCount;
    return doc;
  }

  it("TP-12: un código en dos tableros suma (INV-12), sin razones", () => {
    const furniture = validateFurniture([repeated()]);
    expect(furniture.findings).toEqual([]);
    expect(accepted(furniture.documents[0]).findings).toEqual([]);
    expect(furniture.totals.find((t) => t.code === "0001-01-M01-C14")?.total).toBe(4);
  });

  it("INV-12: un total con una cantidad ilegible es null, no una suma parcial", () => {
    const doc = repeated();
    doc.boards[0].pieces[0].quantity = null;
    doc.pending.push({ path: "boards[0].pieces[0].quantity", reason: "ilegible" });
    expect(validateFurniture([doc]).totals.find((t) => t.code === "0001-01-M01-C14")?.total).toBeNull();
  });

  it("TP-13: INV-4 marca las dos filas", () => {
    const doc = olmo();
    doc.boards[0].pieces[1].code = doc.boards[0].pieces[0].code;
    const result = accepted(validateCutListPdf(doc));
    expect(reasonsOf(result)).toContain("codigo-duplicado-en-tablero");
    expect(result.rows.filter((r) => r.reasons.includes("codigo-duplicado-en-tablero")).map((r) => r.letter)).toEqual(["A", "B"]);
  });

  it("TP-14: INV-11 distinta medida", () => {
    const doc = repeated();
    doc.boards[1].pieces[2].finalA = 441;
    const furniture = validateFurniture([doc]);
    expect(furniture.findings.map((f) => f.reason)).toContain("codigo-con-distintas-medidas");
    expect(furniture.status).toBe("borrador");
    expect(accepted(furniture.documents[0]).rows.filter((r) => r.level === "dudosa")).toHaveLength(2);
  });

  it("TP-15: INV-11 distinto nombre y distinto canteado", () => {
    const named = repeated();
    named.boards[1].pieces[2].name = "Otro";
    expect(validateFurniture([named]).findings.map((f) => f.reason)).toContain("codigo-con-distinto-nombre");

    const edged = repeated();
    edged.columns.edgeStrips = true;
    for (const b of edged.boards) for (const p of b.pieces) p.edges = noEdges();
    edged.boards[1].pieces[2].edges = { ...noEdges(), s2: strip() };
    expect(validateFurniture([edged]).findings.map((f) => f.reason)).toContain("codigo-con-distinto-canteado");
  });

  it("TP-36: INV-10 un código en dos PDF", () => {
    const docs = olmoDocuments();
    docs[BLANCO].boards[0].pieces[0].code = docs[GAUDI].boards[0].pieces[0].code;
    const furniture = validateFurniture(docs);
    expect(furniture.findings.map((f) => f.reason)).toContain("codigo-con-distinto-material");
    expect(accepted(furniture.documents[BLANCO]).rows[0].reasons).toContain("codigo-con-distinto-material");
    expect(accepted(furniture.documents[GAUDI]).rows[0].reasons).toContain("codigo-con-distinto-material");
  });

  it("TP-37: INV-6 código con otra letra en otra hoja: dudosa, no rechazo; cumple si conserva la letra", () => {
    expect(reasonsOf(validateCutListPdf(repeated()))).not.toContain("letra-inconsistente");
    const doc = repeated();
    doc.boards[1].pieces[2].letter = "K";
    const result = accepted(validateCutListPdf(doc));
    expect(reasonsOf(result)).toEqual(["letra-inconsistente"]);
    expect(result.rows.filter((r) => r.level === "dudosa")).toHaveLength(2);
  });
});

describe("cantos", () => {
  it("TP-20: las cuatro marcas, en orden alfabético", () => {
    expect(edgeStripsToEdgeIds({ s1: strip(), s2: strip(), s3: strip(), s4: strip() })).toEqual(["corto-A", "corto-B", "largo-A", "largo-B"]);
  });

  it("TP-21: una marca por subcolumna", () => {
    expect(edgeStripsToEdgeIds({ ...noEdges(), s1: strip() })).toEqual(["largo-B"]);
    expect(edgeStripsToEdgeIds({ ...noEdges(), s2: strip() })).toEqual(["largo-A"]);
    expect(edgeStripsToEdgeIds({ ...noEdges(), s3: strip() })).toEqual(["corto-A"]);
    expect(edgeStripsToEdgeIds({ ...noEdges(), s4: strip() })).toEqual(["corto-B"]);
  });

  it("TP-22: columna presente sin marcas", () => {
    expect(edgeStripsToEdgeIds(noEdges())).toEqual([]);
  });

  it("TP-24: INV-9 falla en los dos sentidos; cumple con columna y marcas", () => {
    const withStrips = olmo();
    withStrips.boards[0].pieces[0].edges = noEdges();
    const result = accepted(validateCutListPdf(withStrips));
    expect(reasonsOf(result)).toEqual(["cantos-inconsistentes"]);
    expect(result.rows[0].level).toBe("dudosa");

    const absent = olmo();
    absent.columns.edgeStrips = true;
    expect(reasonsOf(validateCutListPdf(absent))).toEqual(["cantos-inconsistentes"]);

    const ok = olmo();
    ok.columns.edgeStrips = true;
    for (const piece of ok.boards[0].pieces) piece.edges = { ...noEdges(), s3: strip() };
    expect(accepted(validateCutListPdf(ok)).findings).toEqual([]);
  });
});

describe("código", () => {
  it("TP-30 y TP-31: canónico", () => {
    expect(normalizeCode("0001-01-M01-C04")).toEqual({ state: "canonico", code: "0001-01-M01-C04" });
    expect(normalizeCode("_0001-01-M01-C04")).toEqual({ state: "canonico", code: "0001-01-M01-C04" });
  });

  it("TP-32 y TP-33: anómalo", () => {
    for (const raw of ["_0001-01-M01-C01__", "__0001-01-M01-C01", "0001-01-M01-C01_", "__0001-01-M01-C01__"]) {
      expect(normalizeCode(raw)).toEqual({ state: "anomalo", code: "0001-01-M01-C01" });
    }
    const doc = olmo();
    doc.boards[0].pieces[0].code = "_0001-01-M01-C01__";
    const result = accepted(validateCutListPdf(doc));
    expect(result.rows[0]).toMatchObject({ level: "dudosa", code: "0001-01-M01-C01", reasons: ["nombre-anomalo"] });
  });

  it("TP-35: ausente y formato inválido no entran a los totales", () => {
    expect(normalizeCode(null)).toEqual({ state: "ausente", code: null });
    expect(normalizeCode("  ")).toEqual({ state: "ausente", code: null });
    expect(normalizeCode("0001-1-M01-C04")).toEqual({ state: "invalido", code: null });

    const docs = olmoDocuments();
    docs[BLANCO].boards[0].pieces[0].code = "";
    docs[BLANCO].boards[0].pieces[1].code = "0001-1-M01-C04";
    const furniture = validateFurniture(docs);
    const rows = accepted(furniture.documents[BLANCO]).rows;
    expect(rows[0].reasons).toEqual(["codigo-ausente"]);
    expect(rows[1].reasons).toEqual(["formato-invalido"]);
    expect(furniture.totals).toHaveLength(19);

    const nullCode = olmo();
    nullCode.boards[0].pieces[0].code = null;
    expect(rejectedWith(nullCode)).toEqual(["esquema-invalido"]);
    nullCode.pending.push({ path: "boards[0].pieces[0].code", reason: "ilegible" });
    const reasons = accepted(validateCutListPdf(nullCode)).rows[0].reasons;
    expect(reasons).toContain("codigo-ausente");
    expect(reasons).toContain("campo-pendiente");
  });
});

describe("fuentes", () => {
  it("TP-53: una salida de OCR idéntica al fixture nunca es segura", () => {
    const doc = olmo();
    doc.source.reader = "ocr-llm";
    doc.source.pdfId = "sha256:abc";
    const result = accepted(validateCutListPdf(doc));
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.level === "dudosa" && r.reasons.includes("origen-ocr"))).toBe(true);
  });

  it("TP-54: una salida de OCR sin boards se rechaza y no se repara", () => {
    const { boards, ...rest } = olmo();
    expect(boards).toBeDefined();
    expect(rejectedWith({ ...rest, source: { ...rest.source, reader: "ocr-llm", pdfId: "sha256:abc" } })).toEqual(["esquema-invalido"]);
  });
});

describe("INV-15 (a): páginas de la hoja", () => {
  it("TP-80: hojas en [2, 3] y [4]", () => {
    const doc = twoSheets();
    doc.boards[0].pages = [2, 3];
    doc.boards[1].pages = [4];
    expect(accepted(validateCutListPdf(doc)).findings).toEqual([]);
  });

  it("TP-81: páginas no consecutivas", () => {
    const doc = olmo();
    doc.boards[0].pages = [2, 4];
    expect(rejectedWith(doc)).toEqual(["hoja-incompleta"]);
  });

  it("TP-82: incluye el resumen o se solapa con otra hoja", () => {
    const summary = olmo();
    summary.boards[0].pages = [1, 2];
    expect(rejectedWith(summary)).toEqual(["hoja-incompleta"]);

    const overlap = twoSheets();
    overlap.boards[0].pages = [2, 3];
    overlap.boards[1].pages = [3, 4];
    expect(rejectedWith(overlap)).toEqual(["hoja-incompleta"]);
  });

  it("INV-0: pages ausente se rechaza como esquema inválido", () => {
    const doc: unknown = { ...olmo(), boards: olmo().boards.map(({ pages, ...rest }) => ({ ...rest, ignored: pages })) };
    expect(rejectedWith(doc)).toEqual(["esquema-invalido"]);
  });
});

describe("listado: bloqueo (INV-14)", () => {
  it("TP-62: un documento rechazado bloquea", () => {
    const docs: unknown[] = olmoDocuments();
    docs[FONDO] = { schema: "otro" };
    expect(validateFurniture(docs).status).toBe("bloqueado");
  });

  it("TP-63: una fila dudosa deja solo un borrador", () => {
    const docs = olmoDocuments();
    docs[FONDO].boards[0].pieces[0].code = "0001-1-M01-C20";
    expect(validateFurniture(docs).status).toBe("borrador");
  });

  it("sin documentos no hay listado", () => {
    expect(validateFurniture([]).status).toBe("bloqueado");
  });
});

describe("R4 y privacidad", () => {
  describe.skipIf(!HAS_SABRINA_FIXTURE)("segundo fixture (local)", () => {
    it("TP-71: INV-0 a INV-13 y INV-15 (a) cumplen", () => {
      // Solo se comparan nombres de razones: una falla no debe imprimir datos del fixture.
      const furniture = validateFurniture(sabrinaDocuments());
      const reasons = [...new Set([...furniture.findings, ...furniture.documents.flatMap((d) => d.findings)].map((f) => f.reason))];
      expect(reasons).toEqual([]);
      expect(furniture.documents.map((d) => d.status)).toEqual(["validado", "validado", "validado"]);
      expect(furniture.status).toBe("publicable");
    });
  });

  it("TP-72: nada privado en el repo", () => {
    const tracked = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/);
    expect(tracked.filter((f) => /^(Sabrina|Olmo)\//.test(f) || /\.pdf$/i.test(f))).toEqual([]);
  });
});
