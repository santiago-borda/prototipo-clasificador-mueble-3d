// Fixture sintético: TS-01 a TS-12 (docs/spec-fixture-sintetico.md §9). TS-13 es manual: npm run ocr:sintetico.
// Sin red y sin datos reales: el PDF se genera en memoria desde tests/fixtures/pdf-sintetico/fuente.ts.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pageBatches } from "@/pdf/ocr/batches";
import { BanderaEnDesusoError, pdfIdOf, puedeEnviar } from "@/pdf/ocr/gate";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import { visionToTextInput, type VisionFileResponse } from "@/pdf/ocr/vision";
import { parseCutListText } from "@/pdf/parseText";
import { probeTextLayer } from "@/pdf/textLayer";
import type { CutListPdf, PdfTextElement, PdfTextInput } from "@/pdf/types";
import { validateCutListPdf } from "@/pdf/validate";
import { FUENTE, LEYENDA, SUBJECT } from "./fixtures/pdf-sintetico/fuente";
import { HAS_SABRINA_FIXTURE, olmoDocuments, sabrinaDocuments } from "./helpers/pdfFixtures";
import { buildAll, buildSynthetic, idealInput, idealWords, visionPage, visionResponses, type SyntheticDocument } from "./helpers/pdfSintetico/outputs";
import { edgeCenters } from "./helpers/pdfSintetico/layout";
import { withoutSource } from "./helpers/pdfTextLayout";
import { ocrRealLikeExpected } from "./helpers/ocrRealLike";

const ROOT = path.resolve(__dirname, "..");
const FIXTURE_DIR = path.join(ROOT, "tests", "fixtures", "pdf-sintetico");
const manifest = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "manifiesto.json"), "utf8")) as {
  synthetic: boolean;
  subject: string;
  files: { id: string; fileName: string; pages: number; sha256: string }[];
};
const expected = (id: string) => JSON.parse(readFileSync(path.join(FIXTURE_DIR, "esperado", `${id}.json`), "utf8")) as CutListPdf;
const synthetic = buildAll();
const byId = (id: string) => synthetic.find((s) => s.doc.id === id) as SyntheticDocument;
const syntheticHashes = new Set(manifest.files.map((file) => file.sha256));

function read(input: PdfTextInput): CutListPdf {
  const reading = parseCutListText(input);
  if (!reading.ok) throw new Error(`${reading.reason}: ${reading.detail}`);
  return reading.document;
}

function vision(s: SyntheticDocument, files: VisionFileResponse[]) {
  return visionToTextInput(files, { fileName: s.doc.fileName, pdfId: s.pdfId, producer: null, readerVersion: "vision/simulada", pageCount: s.layout.pageCount });
}

function readVision(s: SyntheticDocument, elements: PdfTextElement[] = idealWords(s)): CutListPdf {
  const conversion = vision(s, visionResponses(s, pageBatches(s.layout.pageCount, 5), elements));
  if (!conversion.ok) throw new Error(conversion.detail);
  const reading = parseOcrWords(conversion.input);
  if (!reading.ok) throw new Error(`${reading.reason}: ${reading.detail}`);
  return reading.document;
}

/** "Errores seguros": filas `segura` cuyo contenido no es el esperado. Tiene que dar 0 siempre (§8). */
function safeErrors(document: CutListPdf, truth: CutListPdf): number {
  const validation = validateCutListPdf(document);
  if (validation.status !== "validado") return 0;
  return validation.rows.filter((row) => row.level === "segura" && JSON.stringify(document.boards[row.board].pieces[row.piece]) !== JSON.stringify(truth.boards[row.board]?.pieces[row.piece])).length;
}

const sortElements = (elements: readonly PdfTextElement[]) => [...elements].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x || (a.text < b.text ? -1 : 1));

/** Palabras de S1 con una función aplicada a la que cumple `match` (página, texto y, si hace falta, x). */
function perturb(s: SyntheticDocument, match: (e: PdfTextElement) => boolean, change: (e: PdfTextElement) => PdfTextElement | null): PdfTextElement[] {
  const elements = idealWords(s);
  const index = elements.findIndex(match);
  if (index < 0) throw new Error("La perturbación no encontró la palabra.");
  const changed = change(elements[index]);
  return changed === null ? elements.filter((_, i) => i !== index) : elements.map((e, i) => (i === index ? changed : e));
}

describe("TS-01 determinismo", () => {
  it("generar dos veces da los mismos bytes y el sha256 del manifiesto", () => {
    for (const s of synthetic) {
      const again = buildSynthetic(s.doc);
      expect(Buffer.from(again.pdf).equals(Buffer.from(s.pdf))).toBe(true);
      expect(manifest.files.find((file) => file.id === s.doc.id)?.sha256).toBe(s.pdfId);
    }
    expect(manifest.files).toHaveLength(FUENTE.length);
  });
});

describe("TS-02 sin capa de texto", () => {
  it("el PDF generado no tiene /Font: sin-capa-de-texto", () => {
    for (const s of synthetic) expect(probeTextLayer(s.pdf)).toBe("sin-capa-de-texto");
  });

  it("un PDF con /Font tiene fuentes; algo que no es PDF no se decide", () => {
    const enc = (text: string) => new TextEncoder().encode(text);
    expect(probeTextLayer(enc("%PDF-1.4\n1 0 obj << /Type /Page /Resources << /Font << /F1 2 0 R >> >> >> endobj"))).toBe("con-fuentes");
    expect(probeTextLayer(enc("%PDF-1.5\n1 0 obj << /Type /ObjStm /N 3 >> endobj"))).toBe("desconocido");
    expect(probeTextLayer(enc("no es un PDF"))).toBe("desconocido");
  });
});

describe("TS-03 marcado", () => {
  it("leyenda en cada página, prefijo, /Subject y manifiesto", () => {
    expect(manifest.synthetic).toBe(true);
    expect(manifest.subject).toBe(SUBJECT);
    for (const s of synthetic) {
      expect(s.doc.fileName.startsWith("sintetico-")).toBe(true);
      expect(new TextDecoder().decode(s.pdf)).toContain(`/Subject (${SUBJECT})`);
      for (let page = 1; page <= s.layout.pageCount; page += 1) {
        expect(s.layout.texts.some((t) => t.page === page && t.text === LEYENDA)).toBe(true);
        expect(visionPage(idealWords(s), page).fullTextAnnotation?.text).toContain(LEYENDA);
      }
      expect(manifest.files.find((file) => file.id === s.doc.id)).toMatchObject({ fileName: s.doc.fileName, pages: s.layout.pageCount });
    }
  });
});

describe("TS-04 parser con los elementos ideales", () => {
  it.each(FUENTE.map((doc) => doc.id))("%s es igual a esperado/ y valida sin razones", (id) => {
    const document = read(idealInput(byId(id)));
    expect(withoutSource(document)).toEqual(withoutSource(expected(id)));
    const validation = validateCutListPdf(document);
    expect(validation.status).toBe("validado");
    if (validation.status === "validado") expect(validation.findings).toEqual([]);
  });

  it("esperado/ cumple el esquema y los invariantes por sí solo", () => {
    for (const doc of FUENTE) {
      const validation = validateCutListPdf(expected(doc.id));
      expect(validation.status).toBe("validado");
      if (validation.status === "validado") expect(validation.findings).toEqual([]);
    }
  });
});

describe("TS-05 adaptador de Vision con la respuesta simulada ideal", () => {
  it.each(FUENTE.map((doc) => doc.id))("%s: mismas palabras, mismo documento, toda fila dudosa por origen-ocr", (id) => {
    const s = byId(id);
    const conversion = vision(s, visionResponses(s, pageBatches(s.layout.pageCount, 5)));
    expect(conversion.ok).toBe(true);
    if (!conversion.ok) return;
    const got = sortElements(conversion.input.elements);
    const want = sortElements(idealWords(s));
    expect(got).toHaveLength(want.length);
    // Tolerancia de coordenadas: 1e-6 pt (ida y vuelta por coordenadas normalizadas).
    got.forEach((element, i) => {
      expect(element.text).toBe(want[i].text);
      expect(element.page).toBe(want[i].page);
      for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(element[key] - want[i][key])).toBeLessThan(1e-6);
    });

    const reading = parseOcrWords(conversion.input);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.document.source).toMatchObject({ reader: "ocr-llm", hasTextLayer: false, pdfId: s.pdfId });
    expect(withoutSource(reading.document)).toEqual(withoutSource(expected(id)));
    const validation = validateCutListPdf(reading.document);
    expect(validation.status).toBe("validado");
    if (validation.status === "validado") expect(validation.rows.every((row) => row.level === "dudosa" && row.reasons.includes("origen-ocr"))).toBe(true);
  });
});

describe("TS-06 variantes negativas", () => {
  const s1 = byId("S1");
  const truth = expected("S1");
  const reasonsOf = (document: CutListPdf, board: number, piece: number) => {
    const validation = validateCutListPdf(document);
    if (validation.status !== "validado") throw new Error("rechazado");
    return validation.rows.find((row) => row.board === board && row.piece === piece)?.reasons ?? [];
  };

  it("V1: un dígito cambiado en una medida deja la fila dudosa, nunca segura", () => {
    const document = readVision(s1, perturb(s1, (e) => e.page === 2 && e.text === "487" && e.x > 370, (e) => ({ ...e, text: "481" })));
    expect(document.boards[0].pieces[0].finalA).toBe(481);
    expect(reasonsOf(document, 0, 0)).toContain("origen-ocr");
    expect(safeErrors(document, truth)).toBe(0);
  });

  it("V2: palabra faltante en la designación → campo-pendiente (nombre) o código inválido", () => {
    const noName = readVision(s1, perturb(s1, (e) => e.text === "Lateral", () => null));
    expect(reasonsOf(noName, 0, 0)).toContain("campo-pendiente");
    const noCodeTail = readVision(s1, perturb(s1, (e) => e.text === "M01-C02", () => null));
    expect(reasonsOf(noCodeTail, 0, 1)).toEqual(expect.arrayContaining(["campo-pendiente", "formato-invalido"]));
    expect(safeErrors(noName, truth) + safeErrors(noCodeTail, truth)).toBe(0);
  });

  it("V3: código con __ final → nombre-anomalo", () => {
    const document = readVision(s1, perturb(s1, (e) => e.text === "9999-91-M01-C01", (e) => ({ ...e, text: `${e.text}__`, width: e.width + 2 * 4.2 })));
    expect(document.boards[0].pieces[0].code).toBe("9999-91-M01-C01__");
    expect(reasonsOf(document, 0, 0)).toContain("nombre-anomalo");
    expect(safeErrors(document, truth)).toBe(0);
  });

  it("V4: el mismo código dos veces en un tablero → codigo-duplicado-en-tablero", () => {
    const document = readVision(s1, perturb(s1, (e) => e.text === "M01-C02", (e) => ({ ...e, text: "M01-C01" })));
    expect(reasonsOf(document, 0, 0)).toContain("codigo-duplicado-en-tablero");
    expect(reasonsOf(document, 0, 1)).toContain("codigo-duplicado-en-tablero");
    expect(safeErrors(document, truth)).toBe(0);
  });

  it("V5: pie ausente o repetido → hoja-incompleta", () => {
    const words = idealWords(s1);
    const withoutFooter = words.filter((e) => !(e.page === 3 && e.text === "piezas"));
    const conversion = vision(s1, visionResponses(s1, [[1, 2, 3]], withoutFooter));
    expect(conversion.ok && parseOcrWords(conversion.input)).toMatchObject({ ok: false, reason: "hoja-incompleta" });

    const footer = words.filter((e) => e.page === 3 && (e.text === "10" || e.text === "piezas") && e.x > 200 && e.x < 300);
    expect(footer).toHaveLength(2);
    const repeated = [...words, ...footer.map((e) => ({ ...e, page: 2, y: 820 }))];
    const again = vision(s1, visionResponses(s1, [[1, 2, 3]], repeated));
    expect(again.ok && parseOcrWords(again.input)).toMatchObject({ ok: false, reason: "hoja-incompleta" });
  });

  it("V6: una marca de canto a más de medio paso → ese lado a pending, el resto igual", () => {
    const input = idealInput(s1);
    const c4 = edgeCenters(FUENTE[0].boards[0].edgeGaps)[3];
    const rowB = 560;
    const moved = input.elements.map((e) =>
      e.page === 2 && Math.abs(e.x + e.width / 2 - c4) < 1 && e.y > rowB && e.y < rowB + 50 ? { ...e, x: e.x + 25 } : e,
    );
    expect(moved.filter((e, i) => e !== input.elements[i])).toHaveLength(4);
    const document = read({ ...input, elements: moved });
    const b = document.boards[0].pieces[1];
    expect(b.edges !== "columna-ausente" && b.edges.s4).toBe(null);
    expect(document.pending.map((p) => p.path)).toContain("boards[0].pieces[1].edges");
    expect(reasonsOf(document, 0, 1)).toContain("campo-pendiente");
    expect(document.boards[0].pieces.filter((_, p) => p !== 1)).toEqual(truth.boards[0].pieces.filter((_, p) => p !== 1));
    expect(safeErrors(document, truth)).toBe(0);
  });

  it("V7: páginas fuera de orden se ordenan; repetidas, faltantes o con error no se mezclan", () => {
    const s2 = byId("S2");
    const inOrder = vision(s2, visionResponses(s2, [[1, 2, 3, 4, 5], [6]]));
    const shuffled = vision(s2, visionResponses(s2, [[6], [5, 3, 1, 4, 2]]));
    expect(shuffled).toEqual(inOrder);
    expect(vision(s2, visionResponses(s2, [[1, 2, 3, 4, 5], [5, 6]]))).toMatchObject({ ok: false, reason: "estructura-no-reconocida" });
    expect(vision(s2, visionResponses(s2, [[1, 2, 3, 4, 5]]))).toMatchObject({ ok: false, reason: "estructura-no-reconocida" });
    const failed = visionResponses(s2, [[1, 2, 3, 4, 5], [6]]);
    failed[1].responses = [{ error: { code: 3, message: "simulado" }, context: { pageNumber: 6 } }];
    expect(vision(s2, failed)).toMatchObject({ ok: false, reason: "lectura-fallida" });
  });
});

describe("TS-07 cantos", () => {
  it("0 marcas mal asignadas en S1 y S2, incluida la hoja con s1 + s4 y la de paso de respaldo", () => {
    let wrong = 0;
    let marks = 0;
    for (const id of ["S1", "S2"]) {
      const document = read(idealInput(byId(id)));
      document.boards.forEach((board, b) =>
        board.pieces.forEach((piece, p) => {
          const want = expected(id).boards[b].pieces[p].edges;
          for (const key of ["s1", "s2", "s3", "s4"] as const) {
            const got = piece.edges === "columna-ausente" ? undefined : piece.edges[key];
            const truth = want === "columna-ausente" ? undefined : want[key];
            if (truth) marks += 1;
            if (JSON.stringify(got) !== JSON.stringify(truth)) wrong += 1;
          }
        }),
      );
    }
    expect(marks).toBeGreaterThan(40);
    expect(wrong).toBe(0);
  });

  it("S2: la página 5 solo trae s1 y s4, y la hoja 3 ninguna fila con dos marcas", () => {
    const fuente = FUENTE[1];
    const page5 = fuente.boards[1].pieces.slice(fuente.boards[1].rowsPerPage[0]);
    expect(page5.every((piece) => piece.edges.join() === "s1,s4")).toBe(true);
    expect(fuente.boards[2].pieces.every((piece) => piece.edges.length <= 1)).toBe(true);
    // Subcolumnas de ancho distinto dentro de cada hoja (§5).
    for (const board of fuente.boards) expect(new Set(board.edgeGaps).size).toBe(3);
  });
});

describe("TS-08 lotes", () => {
  it("S2 (6 páginas) va en 2 pedidos de 5 + 1 y se une en orden", () => {
    const s2 = byId("S2");
    expect(pageBatches(6, 5)).toEqual([[1, 2, 3, 4, 5], [6]]);
    const batched = vision(s2, visionResponses(s2, pageBatches(6, 5)));
    const single = vision(s2, visionResponses(s2, pageBatches(6, 6)));
    expect(batched).toEqual(single);
  });

  it("el tamaño de lote es un parámetro y se valida", () => {
    expect(pageBatches(3, 1)).toEqual([[1], [2], [3]]);
    expect(pageBatches(2, 10)).toEqual([[1, 2]]);
    expect(() => pageBatches(3, 0)).toThrow(RangeError);
    expect(() => pageBatches(0, 5)).toThrow(RangeError);
    expect(() => pageBatches(3, 2.5)).toThrow(RangeError);
  });
});

describe("TS-09 columnas ausentes", () => {
  it("S3: edgeStrips = false y ninguna fila con 'sin canto' inventado", () => {
    const document = read(idealInput(byId("S3")));
    expect(document.columns).toEqual({ adjusted: false, edgeStrips: false });
    expect(document.boards.flatMap((board) => board.pieces).every((piece) => piece.edges === "columna-ausente")).toBe(true);
  });
});

describe("TS-10 compuerta", () => {
  const lists = { synthetic: syntheticHashes, whitelist: new Set<string>() };
  const fake = new TextEncoder().encode(`%PDF-1.4\n<< /Subject (${SUBJECT}) /Title (sintetico-S1) >>\n${LEYENDA}\n`);

  it("sintético sin bandera: pasa, por hash", () => {
    for (const s of synthetic) expect(puedeEnviar(s.pdf, {}, lists)).toEqual({ ok: true, pdfId: s.pdfId, via: "sintetico" });
  });

  it("PDF desconocido con metadatos y leyenda de sintético: bloqueado", () => {
    expect(puedeEnviar(fake, {}, lists).ok).toBe(false);
    expect(puedeEnviar(fake, { PROCESAMIENTO_EXTERNO: "permitir" }, lists).ok).toBe(false);
  });

  it("real con bandera y sin hash: bloqueado; con hash en la lista blanca: pasa", () => {
    expect(puedeEnviar(fake, { PROCESAMIENTO_EXTERNO: "permitir" }, lists)).toMatchObject({ ok: false });
    expect(puedeEnviar(fake, { PROCESAMIENTO_EXTERNO: "si" }, { ...lists, whitelist: new Set([pdfIdOf(fake)]) })).toMatchObject({ ok: false });
    expect(puedeEnviar(fake, { PROCESAMIENTO_EXTERNO: "permitir" }, { ...lists, whitelist: new Set([pdfIdOf(fake)]) })).toMatchObject({ ok: true, via: "lista-blanca" });
  });

  it("PERMITIR_DATOS_REALES definida: error explícito, aun para el sintético", () => {
    expect(() => puedeEnviar(synthetic[0].pdf, { PERMITIR_DATOS_REALES: "1" }, lists)).toThrow(BanderaEnDesusoError);
    expect(() => puedeEnviar(synthetic[0].pdf, { PERMITIR_DATOS_REALES: "" }, lists)).toThrow(BanderaEnDesusoError);
    expect(() => puedeEnviar(fake, { PERMITIR_DATOS_REALES: "1", PROCESAMIENTO_EXTERNO: "permitir" }, { ...lists, whitelist: new Set([pdfIdOf(fake)]) })).toThrow(BanderaEnDesusoError);
  });

  // Espía de fetch (tests/setup/sinRed.ts): cualquier llamada de la suite falla; en este archivo solo la del autocontrol.
  const calls = () => (globalThis as { __llamadasDeRed?: { calls: number } }).__llamadasDeRed?.calls;
  const SELF_TEST_CALLS = 1;

  it("fetch está bloqueado en la suite", async () => {
    await expect(fetch("https://example.invalid/")).rejects.toThrow(/no usa red/);
  });

  afterAll(() => {
    expect(calls()).toBe(SELF_TEST_CALLS);
  });
});

describe("TS-11 TP-72", () => {
  let tracked: string | null = null;
  try {
    tracked = execFileSync("git", ["ls-files", "*.pdf"], { cwd: ROOT, encoding: "utf8" });
  } catch {
    tracked = null;
  }
  it.skipIf(tracked === null)("git ls-files no lista ningún .pdf (se saltea si no hay git)", () => {
    expect(tracked?.trim()).toBe("");
  });
});

// --- TS-12: sin datos reales ---
//
// La lista prohibida no se escribe en claro: son los SHA-256 de los términos normalizados (sin tildes, minúsculas):
// nombres de los muebles reales (y el nombre anterior del primero), materiales reales y el código de proyecto real.
// LÍMITE: un hash de una palabra común se revierte probando un diccionario; esto evita que la lista quede a la
// vista o salga en un grep, no protege contra quien la busque a propósito (spec §9, TS-12).
const FORBIDDEN = new Set([
  "a93236bfd01d62d26119600f3a77a5847d7c206fb88da21e38333b8ad5ba2262",
  "8e016391c88c77d6773deab343b91f53bb64bfbc9ca18101844cb84c3d01e561",
  "c49b876c05fd376922883ceaf5b7e7871ae4ae9f24e79958f3fc70efe114627d",
  "f3c0c787e8a05ea93bc2f7bc21afebff9e7f55b7a6ea0718df471fde7b4f560d",
  "80765ddc1df45e60b086d5889b8a0bc2ca979a0678362cbbdec8f261c32f9685",
  "a438d667cb3de993b022780b3aeafe52a5261be98fe3ca80a56939dcc4685242",
  "f1d392b07dc26f16e827b6e87f15fa1775fda2a9a192b88d208e26b95353d5ee",
  "888b19a43b151683c87895f6211d9f8640f97bdc8ef32f03dbe057c8f5e56d32",
]);
const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Grupos de 1 a 3 palabras seguidas, normalizados. */
function grams(text: string): Set<string> {
  const tokens = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) for (let k = 1; k <= 3 && i + k <= tokens.length; k += 1) out.add(tokens.slice(i, i + k).join(" "));
  return out;
}

const scanned = [
  path.join(FIXTURE_DIR, "fuente.ts"),
  path.join(FIXTURE_DIR, "manifiesto.json"),
  ...readdirSync(path.join(FIXTURE_DIR, "esperado")).map((file) => path.join(FIXTURE_DIR, "esperado", file)),
  // Replays de la respuesta real de Vision (10/11): palabras y cajas de los PDF sintéticos, sin datos reales.
  ...readdirSync(path.join(FIXTURE_DIR, "replay")).map((file) => path.join(FIXTURE_DIR, "replay", file)),
  // TS-12b (spec-revision-ocr-real §5.3, CA-6): el fixture en memoria con la geometría de la corrida real.
  path.join(ROOT, "tests", "helpers", "ocrRealLike.ts"),
];
const syntheticPairs = new Set([
  ...FUENTE.flatMap((doc) => doc.boards.flatMap((board) => board.pieces.map((p) => [p.finalL, p.finalA].sort((a, b) => a - b).join("x")))),
  // TS-12b: las piezas del documento que arma tests/helpers/ocrRealLike.ts.
  ...ocrRealLikeExpected().boards.flatMap((board) => board.pieces.flatMap((p) => (p.finalL !== null && p.finalA !== null ? [[p.finalL, p.finalA].sort((a, b) => a - b).join("x")] : []))),
]);
const realPairs = (documents: CutListPdf[]) =>
  documents.flatMap((d) => d.boards.flatMap((b) => b.pieces.flatMap((p) => (p.finalL !== null && p.finalA !== null ? [[p.finalL, p.finalA].sort((x, y) => x - y).join("x")] : []))));

describe("TS-12 sin datos reales", () => {
  it("la fuente, el manifiesto y esperado/ no contienen ningún término de la lista prohibida", () => {
    // Se cuentan los archivos con coincidencias, sin imprimir cuál término coincidió.
    const hits = scanned.filter((file) => [...grams(readFileSync(file, "utf8"))].some((gram) => FORBIDDEN.has(sha(gram))));
    expect(hits.map((file) => path.basename(file))).toEqual([]);
  });

  it("todos los códigos son del proyecto 9999", () => {
    for (const file of scanned) {
      const codes = readFileSync(file, "utf8").match(/\d{4}-\d{2}-M\d{2}-C\d{2}/g) ?? [];
      expect(codes.filter((code) => !code.startsWith("9999-"))).toEqual([]);
    }
  });

  it("autocontrol: el hash detecta los materiales y el título del primer fixture real", () => {
    const documents = olmoDocuments();
    for (const document of documents) expect(FORBIDDEN.has(sha(normalize(document.header.material)))).toBe(true);
    expect(documents.some((document) => [...grams(document.header.project)].some((gram) => FORBIDDEN.has(sha(gram))))).toBe(true);
  });

  it("ninguna medida de pieza (L, A) repite una del primer fixture", () => {
    const real = new Set(realPairs(olmoDocuments()));
    expect(real.size).toBeGreaterThan(0);
    expect([...syntheticPairs].filter((pair) => real.has(pair))).toEqual([]);
  });

  it.skipIf(!HAS_SABRINA_FIXTURE)("ninguna medida de pieza (L, A) repite una del segundo fixture (se saltea: falta la carpeta local Sabrina/)", () => {
    const real = new Set(realPairs(sabrinaDocuments()));
    expect(real.size).toBeGreaterThan(0);
    expect([...syntheticPairs].filter((pair) => real.has(pair))).toEqual([]);
  });
});
