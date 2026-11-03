// Parser de TextoPdf (docs/spec-esquema-pdf.md §8.2, TP-25, 26, 34, 50–52, 83–90). Entradas sintéticas: ningún PDF
// de OpenCutList tiene capa de texto todavía (consulta 58), así que esto no prueba el formato real de los textos.

import { describe, expect, it } from "vitest";
import { parseCutListText } from "@/pdf/parseText";
import type { CutListPdf, EdgeStrip, EdgeStrips, PdfReading, PdfTextElement, PdfTextInput } from "@/pdf/types";
import { validateCutListPdf } from "@/pdf/validate";
import { HAS_SABRINA_FIXTURE, olmoDocuments, sabrinaDocuments } from "./helpers/pdfFixtures";
import { ICON, PAGE_WIDTH, UNIFORM_EDGES, renderCutList, withoutSource } from "./helpers/pdfTextLayout";

const BLANCO_DOC = 0;
const GAUDI_DOC = 1;

function parsed(input: PdfTextInput): CutListPdf {
  const reading: PdfReading = parseCutListText(input);
  if (!reading.ok) throw new Error(`${reading.reason}: ${reading.detail}`);
  return reading.document;
}
function failure(input: PdfTextInput) {
  const reading = parseCutListText(input);
  return reading.ok ? "ok" : reading.reason;
}
const edit = (input: PdfTextInput, change: (elements: PdfTextElement[]) => PdfTextElement[]): PdfTextInput => ({
  ...input,
  elements: change([...input.elements]),
});
const noEdges = (): EdgeStrips => ({ s1: null, s2: null, s3: null, s4: null });
const strip = (material = "Gaudi"): EdgeStrip => ({ label: `Canto ${material} ~ 0 mm x 22 mm`, material, widthMm: 22, thicknessText: "~ 0 mm" });

/** Gaudi del Olmo con la variante completa y las marcas pedidas por fila (índice de subcolumna). */
function withMarks(marks: readonly (readonly (keyof EdgeStrips)[])[]): CutListPdf {
  const doc = olmoDocuments()[GAUDI_DOC];
  doc.columns = { adjusted: true, edgeStrips: true };
  doc.boards[0].pieces.forEach((piece, i) => {
    const edges = noEdges();
    for (const key of marks[i] ?? []) edges[key] = strip();
    piece.edges = edges;
  });
  return doc;
}
const edgeKeys = (doc: CutListPdf, board = 0) =>
  doc.boards[board].pieces.map((piece) => (piece.edges === "columna-ausente" ? "ausente" : (["s1", "s2", "s3", "s4"] as const).filter((k) => piece.edges !== "columna-ausente" && piece.edges[k] !== null)));

describe("TP-50: de elementos de texto a CutListPdf", () => {
  it.each([
    ["frases", {}],
    ["palabras sueltas", { words: true }],
  ])("los 3 PDF del Olmo quedan iguales al fixture, con %s", (_name, options) => {
    for (const doc of olmoDocuments()) {
      expect(withoutSource(parsed(renderCutList(doc, options)))).toEqual(withoutSource(doc));
    }
  });

  it("llena source con lo que recibe, y el resultado pasa la validación", () => {
    const doc = olmoDocuments()[BLANCO_DOC];
    const result = parsed(renderCutList(doc));
    expect(result.source).toEqual({
      fileName: doc.source.fileName,
      pdfId: "sha256:prueba",
      reader: "texto-pdf",
      readerVersion: "prueba/1",
      producer: doc.source.producer,
      hasTextLayer: true,
    });
    const validated = validateCutListPdf(result);
    expect(validated.status === "validado" && validated.rows.every((row) => row.level === "segura")).toBe(true);
  });

  it("TP-02: \"Ajustadas\" se detecta en columns y sus valores se ignoran", () => {
    const doc = withMarks([]);
    const result = parsed(renderCutList(doc));
    expect(result.columns).toEqual({ adjusted: true, edgeStrips: true });
    expect(result.boards[0].pieces[0]).toMatchObject({ finalL: 550, finalA: 440 });
  });

  describe.skipIf(!HAS_SABRINA_FIXTURE)("segundo fixture (local)", () => {
    it("los 3 PDF de Sabrina quedan iguales al fixture", () => {
      // Se compara el JSON: una falla no debe imprimir datos del fixture.
      const sorted = (doc: CutListPdf) => {
        const copy = structuredClone(doc);
        for (const b of copy.boards) if (b.diagram !== "pendiente") b.diagram.sort((x, y) => (x.letter < y.letter ? -1 : 1));
        return JSON.stringify(withoutSource(copy));
      };
      const same = sabrinaDocuments().map((doc) => sorted(parsed(renderCutList(doc))) === sorted(doc));
      expect(same).toEqual([true, true, true]);
    });

    it("TP-88: con las columnas medidas en cada hoja de Sabrina, todas las marcas caen en su subcolumna", () => {
      // Medido el 3/11 en los trazados, en local (spec §8.2): centros de s1 a s4 y centro del rótulo, por hoja.
      const measured: Record<string, { columns: number[]; label: number }> = {
        "0/0": { columns: [429.5, 468.5, 508.0, 547.9], label: 488.8 },
        "1/0": { columns: [446.8, 481.3, 515.9, 550.5], label: 498.5 },
        "1/1": { columns: [449.4, 481.0, 510.7, 548.6], label: 498.2 },
      };
      const same = sabrinaDocuments().flatMap((doc, d) => {
        if (!doc.columns.edgeStrips) return [];
        const options = {
          edgeCenters: (b: number) => measured[`${d}/${b}`].columns,
          edgeLabelCenter: (b: number) => measured[`${d}/${b}`].label,
        };
        const result = parsed(renderCutList(doc, options));
        return doc.boards.map((_, b) => JSON.stringify(edgeKeys(result, b)) === JSON.stringify(edgeKeys(doc, b)) && result.pending.length === 0);
      });
      expect(same).toEqual([true, true, true]);
    });
  });
});

describe("TP-51: determinismo", () => {
  it("la misma entrada da el mismo JSON, y el orden de los elementos no cambia nada", () => {
    const input = renderCutList(withMarks([["s1"], ["s2", "s3"]]));
    const first = JSON.stringify(parsed(input));
    expect(JSON.stringify(parsed(input))).toBe(first);
    expect(JSON.stringify(parsed({ ...input, elements: [...input.elements].reverse() }))).toBe(first);
  });
});

describe("TP-52: sin capa de texto (el caso del parser; la lectura de bytes es de la extracción)", () => {
  it("sin elementos o solo con espacios", () => {
    const input = renderCutList(olmoDocuments()[BLANCO_DOC]);
    expect(failure({ ...input, elements: [] })).toBe("sin-capa-de-texto");
    expect(failure({ ...input, elements: [{ page: 1, x: 0, y: 0, width: 1, height: 1, text: "  " }] })).toBe("sin-capa-de-texto");
  });
});

describe("estructura y unidad", () => {
  const base = () => renderCutList(olmoDocuments()[BLANCO_DOC]);

  it("otra unidad: unidad-no-soportada", () => {
    expect(failure(edit(base(), (els) => els.map((e) => (e.text === "Milimetro" ? { ...e, text: "Pulgada" } : e))))).toBe("unidad-no-soportada");
  });

  it("sin unidad o sin título: estructura-no-reconocida", () => {
    expect(failure(edit(base(), (els) => els.filter((e) => e.text !== "Milimetro")))).toBe("estructura-no-reconocida");
    expect(failure(edit(base(), (els) => els.filter((e) => !(e.page === 1 && e.y === 40 && e.x === 40))))).toBe("estructura-no-reconocida");
  });

  it("sin página de resumen ni hojas: estructura-no-reconocida", () => {
    expect(failure(edit(base(), (els) => els.filter((e) => e.page !== 1)))).toBe("estructura-no-reconocida");
    expect(failure(edit(base(), (els) => els.filter((e) => e.page === 1)))).toBe("estructura-no-reconocida");
  });

  it("números de hoja que no son 1..N: estructura-no-reconocida", () => {
    const doc = olmoDocuments()[GAUDI_DOC];
    doc.boards[0].total = 2;
    expect(failure(renderCutList(doc))).toBe("estructura-no-reconocida");
  });

  it("hojas con columnas distintas: estructura-no-reconocida", () => {
    const doc = olmoDocuments()[GAUDI_DOC];
    const second = structuredClone(doc.boards[0]);
    doc.boards[0].total = 2;
    second.index = 2;
    second.total = 2;
    second.pages = [3];
    doc.boards.push(second);
    const input = renderCutList(doc);
    // La hoja 2 pierde "Ajustadas": no existe en la 1 y se agrega solo en la 2.
    const extra: PdfTextElement = { page: 3, x: 230, y: 452, width: 36, height: 7, text: "Ajustadas" };
    expect(failure({ ...input, elements: [...input.elements, extra] })).toBe("estructura-no-reconocida");
  });

  it("sin encabezado de tabla en la primera página de la hoja: estructura-no-reconocida", () => {
    expect(failure(edit(base(), (els) => els.filter((e) => e.text !== "Finales")))).toBe("estructura-no-reconocida");
  });
});

describe("valores no leídos", () => {
  const base = () => renderCutList(olmoDocuments()[GAUDI_DOC]);

  it("una celda ilegible da null con su pending, y la fila queda dudosa", () => {
    const input = edit(base(), (els) => els.filter((e) => e.text !== "440 mm" && !(e.text === "1" && e.x < 160 && e.y === 740)));
    const doc = parsed(input);
    expect(doc.boards[0].pieces[0].finalA).toBeNull();
    expect(doc.pending.map((p) => p.path)).toContain("boards[0].pieces[0].finalA");
    const validated = validateCutListPdf(doc);
    expect(validated.status === "validado" && validated.rows[0].reasons).toEqual(["campo-pendiente"]);
  });

  it("una cantidad que no es un entero da null con su pending", () => {
    const doc = parsed(edit(base(), (els) => els.map((e) => (e.text === "2" && e.x < 160 && e.y === 500 ? { ...e, text: "2?" } : e))));
    expect(doc.boards[0].pieces[0].quantity).toBeNull();
    expect(doc.pending.map((p) => p.path)).toContain("boards[0].pieces[0].quantity");
  });

  it("sin letras en el diagrama: diagram pendiente con su pending", () => {
    const doc = parsed(edit(base(), (els) => els.filter((e) => !(e.page === 2 && e.y >= 80 && e.y < 440))));
    expect(doc.boards[0].diagram).toBe("pendiente");
    expect(doc.pending.map((p) => p.path)).toContain("boards[0].diagram");
    expect(validateCutListPdf(doc).status).toBe("validado");
  });

  it("sin cifras del resumen ni del pie: null con su pending", () => {
    const doc = parsed(edit(base(), (els) => els.filter((e) => !["Tasa de llenado", "Eficiencia"].includes(e.text))));
    expect(doc.summary.fillRatePct).toBeNull();
    expect(doc.boards[0].efficiencyPct).toBeNull();
    expect(doc.pending.map((p) => p.path)).toEqual(expect.arrayContaining(["summary.fillRatePct", "boards[0].efficiencyPct"]));
    expect(validateCutListPdf(doc).status).toBe("validado");
  });
});

describe("designación (§7.1)", () => {
  it("TP-34: código partido con un ícono en el medio", () => {
    const doc = parsed(renderCutList(olmoDocuments()[BLANCO_DOC]));
    expect(doc.boards[0].pieces[0].code).toBe("0001-01-M01-C01");
    expect(doc.boards[0].pieces[0].name).toBe("Mesa/Techo escritorio");
    expect(doc.pending).toEqual([]);
  });

  it("el ícono pegado al texto del renglón también se descarta", () => {
    const input = edit(renderCutList(olmoDocuments()[BLANCO_DOC]), (els) =>
      els.filter((e) => e.text !== ICON).map((e) => (e.text === "0001-01-" ? { ...e, text: `0001-01-${ICON}` } : e)),
    );
    expect(parsed(input).boards[0].pieces[0].code).toBe("0001-01-M01-C01");
  });

  it("nombre en varios renglones", () => {
    const original = olmoDocuments()[BLANCO_DOC];
    original.boards[0].pieces[0].name = "Un nombre bastante largo para partir en dos";
    expect(parsed(renderCutList(original)).boards[0].pieces[0].name).toBe("Un nombre bastante largo para partir en dos");
  });

  it("guiones bajos de más: el código queda tal cual y lo señala la validación", () => {
    const original = olmoDocuments()[BLANCO_DOC];
    original.boards[0].pieces[0].code = "_0001-01-M01-C01__";
    const doc = parsed(renderCutList(original));
    expect(doc.boards[0].pieces[0].code).toBe("_0001-01-M01-C01__");
    const validated = validateCutListPdf(doc);
    expect(validated.status === "validado" && validated.rows[0].reasons).toEqual(["nombre-anomalo"]);
  });

  it("TP-35: formato inválido: el renglón 1 va a pending y la validación lo marca", () => {
    const original = olmoDocuments()[BLANCO_DOC];
    original.boards[0].pieces[0].code = "0001-1-M01-C04";
    const doc = parsed(renderCutList(original));
    expect(doc.boards[0].pieces[0].code).toBe("0001-1-M");
    expect(doc.pending.map((p) => p.path)).toContain("boards[0].pieces[0].code");
    const validated = validateCutListPdf(doc);
    expect(validated.status === "validado" && validated.rows[0].reasons).toEqual(expect.arrayContaining(["formato-invalido", "campo-pendiente"]));
  });

  it("TP-35: designación vacía: código null y nombre vacío, con sus pending", () => {
    const input = edit(renderCutList(olmoDocuments()[BLANCO_DOC]), (els) =>
      els.filter((e) => !(e.page === 2 && e.y >= 500 && e.y < 560 && e.x >= 60 && e.x < 130)),
    );
    const doc = parsed(input);
    expect(doc.boards[0].pieces[0]).toMatchObject({ code: null, name: "" });
    expect(doc.pending.map((p) => p.path)).toEqual(expect.arrayContaining(["boards[0].pieces[0].code", "boards[0].pieces[0].name"]));
    const validated = validateCutListPdf(doc);
    expect(validated.status === "validado" && validated.rows[0].reasons).toContain("codigo-ausente");
  });
});

describe("marcas de canto (RP3, §8.2)", () => {
  it("TP-25: el texto de la celda, sin convertir el espesor", () => {
    const doc = parsed(renderCutList(withMarks([["s2", "s3"]])));
    const edges = doc.boards[0].pieces[0].edges;
    expect(edges).not.toBe("columna-ausente");
    if (edges === "columna-ausente") return;
    expect(edges.s2).toEqual({ label: "Canto Gaudi ~ 0 mm x 22 mm", material: "Gaudi", widthMm: 22, thicknessText: "~ 0 mm" });
    expect(doc.pending).toEqual([]);
  });

  it("TP-25: admite \"~0 mm\" y \"×\", tal cual", () => {
    const original = withMarks([["s2"]]);
    const piece = original.boards[0].pieces[0];
    if (piece.edges !== "columna-ausente") piece.edges.s2 = { label: "Canto Cedro ~0 mm × 22 mm", material: "Cedro", widthMm: 22, thicknessText: "~0 mm" };
    expect(parsed(renderCutList(original)).boards[0].pieces[0].edges).toEqual(piece.edges);
  });

  it("texto de canto que no se entiende: label tal cual, campos null con su pending", () => {
    const original = withMarks([["s2", "s3"]]);
    const piece = original.boards[0].pieces[0];
    if (piece.edges !== "columna-ausente") piece.edges.s2 = { label: "Canto ilegible", material: null, widthMm: null, thicknessText: null };
    const doc = parsed(renderCutList(original));
    expect(doc.boards[0].pieces[0].edges).toEqual(piece.edges);
    expect(doc.pending.map((p) => p.path)).toContain("boards[0].pieces[0].edges.s2.material");
    expect(validateCutListPdf(doc).status).toBe("validado");
  });

  it("TP-26: mover los íconos del encabezado no cambia nada", () => {
    const input = renderCutList(withMarks([["s1"], ["s2", "s3"], ["s4"]]));
    const moved = edit(input, (els) => els.map((e) => (e.text === ICON && e.y === 478 ? { ...e, x: e.x + 30 } : e)));
    expect(JSON.stringify(parsed(moved))).toBe(JSON.stringify(parsed(input)));
  });

  it("cada marca cae en su subcolumna, con paso uniforme y sin columna de cantos ausente", () => {
    const marks = [["s1"], ["s2"], ["s3"], ["s4"], ["s1", "s2", "s3", "s4"], []] as const;
    expect(edgeKeys(parsed(renderCutList(withMarks(marks))))).toEqual(marks);
  });

  it("TP-88: columnas desiguales; una página sin filas de marcas contiguas usa el paso de la hoja", () => {
    // Como Sabrina Cedro 2/2: separaciones 31,6 / 29,7 / 37,9; la p. 3 solo tiene marcas en s1 y s4 (99,2 pt).
    const unequal = [449.4, 481, 510.7, 548.6];
    const marks = [["s1", "s3", "s4"], ["s3", "s4"], ["s3"], ["s1", "s4"], ["s1", "s4"], ["s1", "s4"]] as const;
    const original = withMarks(marks);
    original.boards[0].pages = [2, 3];
    const doc = parsed(renderCutList(original, { edgeCenters: () => unequal }));
    expect(doc.boards[0].pages).toEqual([2, 3]);
    expect(edgeKeys(doc)).toEqual(marks);
    expect(doc.pending).toEqual([]);
  });

  it("TP-89: sin fila con 2 marcas usa la constante", () => {
    const marks = [["s1"], ["s2"], ["s3"], ["s4"]] as const;
    expect(edgeKeys(parsed(renderCutList(withMarks(marks))))).toEqual([...marks, [], []]);
    // Columnas angostas (paso 34,5): la constante también alcanza.
    const narrow = [446.8, 481.3, 515.9, 550.5];
    expect(edgeKeys(parsed(renderCutList(withMarks(marks), { edgeCenters: () => narrow })))).toEqual([...marks, [], []]);
  });

  it("TP-89: una distancia mayor que el tope no se usa como paso", () => {
    const marks = [["s1", "s4"], ["s2"], ["s3"]] as const;
    expect(edgeKeys(parsed(renderCutList(withMarks(marks))))).toEqual([...marks, [], [], []]);
  });

  it("TP-90: una marca fuera de la banda va a pending, sin adivinar", () => {
    const far = [UNIFORM_EDGES[0], UNIFORM_EDGES[1], UNIFORM_EDGES[2], 640];
    const doc = parsed(renderCutList(withMarks([["s3", "s4"]]), { edgeCenters: () => far }));
    expect(edgeKeys(doc)[0]).toEqual(["s3"]);
    expect(doc.pending.map((p) => p.path)).toContain("boards[0].pieces[0].edges");
    const validated = validateCutListPdf(doc);
    expect(validated.status === "validado" && validated.rows[0].reasons).toEqual(["campo-pendiente"]);
  });

  it("TP-90: dos marcas en una misma subcolumna: ninguna se asigna", () => {
    const close = [UNIFORM_EDGES[0], UNIFORM_EDGES[0] + 8, UNIFORM_EDGES[2], UNIFORM_EDGES[3]];
    const doc = parsed(renderCutList(withMarks([["s1", "s2"], ["s4"]]), { edgeCenters: () => close }));
    expect(edgeKeys(doc).slice(0, 2)).toEqual([[], []]);
    expect(doc.pending.map((p) => p.path)).toEqual(expect.arrayContaining(["boards[0].pieces[0].edges", "boards[0].pieces[1].edges"]));
  });

  it("TP-90: sin ancho de página no hay tope ni constante: las marcas van a pending", () => {
    const doc = parsed({ ...renderCutList(withMarks([["s1"], ["s2", "s3"]])), pageWidths: [] });
    expect(edgeKeys(doc).slice(0, 2)).toEqual([[], []]);
    expect(doc.pending.map((p) => p.path)).toEqual(expect.arrayContaining(["boards[0].pieces[0].edges", "boards[0].pieces[1].edges"]));
  });

  it("TP-90: texto en la zona de cantos sin \"Canto\" va a pending", () => {
    const input = renderCutList(withMarks([["s2"]]));
    const extra: PdfTextElement = { page: 2, x: 540, y: 515, width: 10, height: 5.5, text: "xx" };
    const doc = parsed({ ...input, elements: [...input.elements, extra] });
    expect(edgeKeys(doc)[0]).toEqual(["s2"]);
    expect(doc.pending.map((p) => p.path)).toContain("boards[0].pieces[0].edges");
  });

  it("la constante es relativa al ancho de página, no un valor absoluto", () => {
    expect(PAGE_WIDTH * 0.066).toBeCloseTo(39.29, 1);
  });
});

describe("hoja multipágina (INV-15 (b))", () => {
  const blanco = () => renderCutList(olmoDocuments()[BLANCO_DOC]);

  it("TP-83: une las páginas de una hoja, con la segunda sin encabezado de tabla", () => {
    const original = olmoDocuments()[BLANCO_DOC];
    const input = renderCutList(original);
    expect(input.elements.some((e) => e.page === 3 && e.text === "Finales")).toBe(false);
    const doc = parsed(input);
    expect(doc.boards).toHaveLength(1);
    expect(doc.boards[0].pages).toEqual([2, 3]);
    expect(doc.boards[0].pieces.map((p) => p.letter)).toEqual(original.boards[0].pieces.map((p) => p.letter));
    expect(doc.boards[0].pieceCount).toBe(20);
    expect(doc.boards[0].efficiencyPct).toBe(55.14);
  });

  it("una continuación que sí repite el encabezado de la tabla también se une", () => {
    const input = blanco();
    const repeated = input.elements.filter((e) => e.page === 2 && e.y >= 452 && e.y <= 478).map((e) => ({ ...e, page: 3, y: e.y - 400 }));
    const shifted = input.elements.map((e) => (e.page === 3 && e.y >= 70 ? { ...e, y: e.y + 30 } : e));
    const doc = parsed({ ...input, elements: [...shifted, ...repeated] });
    expect(doc.boards[0].pieces).toHaveLength(13);
  });

  it("TP-84: la última página sin pie", () => {
    expect(failure(edit(blanco(), (els) => els.filter((e) => e.text !== "20 piezas")))).toBe("hoja-incompleta");
  });

  it("TP-85: pie en una página intermedia", () => {
    const moved = edit(blanco(), (els) => els.map((e) => (e.text === "20 piezas" ? { ...e, page: 2, y: 830 } : e)));
    expect(failure(moved)).toBe("hoja-incompleta");
  });

  it("TP-86: otro espesor, otro total, sin \"i / N\" y páginas no consecutivas", () => {
    expect(failure(edit(blanco(), (els) => els.map((e) => (e.page === 3 && e.text === "Blanco nature / 18 mm" ? { ...e, text: "Blanco nature / 3 mm" } : e))))).toBe("hoja-incompleta");
    expect(failure(edit(blanco(), (els) => els.filter((e) => !(e.page === 3 && e.text === "Blanco nature / 18 mm"))))).toBe("hoja-incompleta");
    expect(failure(edit(blanco(), (els) => els.map((e) => (e.page === 3 && e.text === "1 / 1" ? { ...e, text: "1 / 2" } : e))))).toBe("hoja-incompleta");
    expect(failure(edit(blanco(), (els) => els.filter((e) => !(e.page === 3 && e.text === "1 / 1"))))).toBe("hoja-incompleta");
    expect(failure(edit(blanco(), (els) => els.map((e) => (e.page === 3 ? { ...e, page: 4 } : e))))).toBe("hoja-incompleta");
  });

  it("TP-87: letras de diagrama en una continuación", () => {
    const input = blanco();
    const letter: PdfTextElement = { page: 3, x: 300, y: 55, width: 4, height: 7, text: "A" };
    expect(failure({ ...input, elements: [...input.elements, letter] })).toBe("hoja-incompleta");
  });

  it("texto suelto antes de la primera fila de una continuación no se atribuye a nadie", () => {
    const input = blanco();
    const stray: PdfTextElement = { page: 3, x: 300, y: 55, width: 40, height: 7, text: "suelto" };
    expect(failure({ ...input, elements: [...input.elements, stray] })).toBe("estructura-no-reconocida");
  });

  it("dos hojas, cada una con sus páginas", () => {
    const doc = olmoDocuments()[GAUDI_DOC];
    const second = structuredClone(doc.boards[0]);
    doc.boards[0].total = 2;
    doc.boards[0].pages = [2, 3];
    second.index = 2;
    second.total = 2;
    second.pages = [4, 5];
    doc.boards.push(second);
    const result = parsed(renderCutList(doc));
    expect(result.boards.map((b) => [b.index, b.total, b.pages])).toEqual([[1, 2, [2, 3]], [2, 2, [4, 5]]]);
    expect(result.boards[1].pieces).toHaveLength(6);
  });
});
