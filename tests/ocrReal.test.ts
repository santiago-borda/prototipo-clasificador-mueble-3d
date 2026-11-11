// SPEC-B2 (docs/spec-ocr-prueba-real.md §11): pruebas del script manual `ocr:real` con DATOS SINTÉTICOS y sin red.
// El cliente de Vision es simulado y las salidas van a un directorio temporal. OR-15 (git) no es de vitest: se verifica
// en la sesión con `git ls-files "*.pdf"` y `git check-ignore -v`.

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pdfIdOf } from "@/pdf/ocr/gate";
import type { VisionFileResponse } from "@/pdf/ocr/vision";
import type { CutListPdf } from "@/pdf/types";
import { classifyPending } from "../scripts/ocr-real/pending";
import { compareReading } from "../scripts/ocr-real/compare";
import { runOcrReal, type OcrRealIo, type VisionRequest } from "../scripts/ocr-real/run";
import { formatSummary } from "../scripts/ocr-real/summary";
import { parseWhitelist } from "../scripts/ocr-real/whitelist";
import { buildAll, idealWords, visionResponses, type SyntheticDocument } from "./helpers/pdfSintetico/outputs";

const [S1, S2] = buildAll() as [SyntheticDocument, SyntheticDocument, SyntheticDocument];
const HEX = (id: string) => id.replace("sha256:", "");
const EXPECTED_S1 = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures", "pdf-sintetico", "esperado", "S1.json"), "utf8")) as CutListPdf;

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "ocr-real-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

interface Harness {
  io: OcrRealIo;
  calls: VisionRequest[];
  lines: string[];
  writes: string[];
  outDir: string;
}

const KEY = "ruta-a-la-clave";
/** `--paginas` es obligatorio (enmienda D, E-1). Las respuestas del fixture sintético tienen 3 páginas. */
const P3 = ["--paginas", "3"];

function harness(options: { files?: VisionFileResponse[] | Error; env?: Record<string, string | undefined>; whitelistText?: string | null } = {}): Harness {
  const calls: VisionRequest[] = [];
  const lines: string[] = [];
  const writes: string[] = [];
  const whitelistPath = path.join(tmp, "secretos", "lista.txt");
  const { files = visionResponses(S1, [[1, 2, 3]]), whitelistText = `${HEX(S1.pdfId)}\n` } = options;
  if (whitelistText !== null) {
    mkdirSync(path.dirname(whitelistPath), { recursive: true });
    writeFileSync(whitelistPath, whitelistText);
  }
  const env = "env" in options ? options.env! : { GOOGLE_APPLICATION_CREDENTIALS: KEY, PROCESAMIENTO_EXTERNO: "permitir", OCR_LISTA_BLANCA: whitelistPath };
  const io: OcrRealIo = {
    env,
    readBytes: (file) => (existsSync(file) ? new Uint8Array(readFileSync(file)) : null),
    readText: (file) => (existsSync(file) ? readFileSync(file, "utf8") : null),
    exists: (file) => existsSync(file),
    mkdirp: (dir) => void mkdirSync(dir, { recursive: true }),
    writeText: (file, text) => {
      writes.push(file);
      writeFileSync(file, text);
    },
    vision: {
      batchAnnotateFiles: async (request) => {
        calls.push(request);
        if (files instanceof Error) throw files;
        return [{ responses: files }];
      },
    },
    log: (line) => lines.push(line),
  };
  return { io, calls, lines, writes, outDir: path.join(tmp, "salida", ".ocr-data", "real") };
}

function pdfFile(synthetic = S1, dir = "entrada-secreta"): string {
  const file = path.join(tmp, dir, `${synthetic.doc.fileName}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, synthetic.pdf);
  return file;
}

const run = (h: Harness, argv: string[]) => runOcrReal(argv, h.io, { outDir: h.outDir });
const outFiles = (h: Harness) => (existsSync(h.outDir) ? readdirSync(h.outDir).sort() : []);

/** Respuesta de Vision para S1 sin texto reconocido: lectura rechazada (sin-capa-de-texto). */
const emptyPages = (): VisionFileResponse[] => [{ responses: [1, 2, 3].map((page) => ({ context: { pageNumber: page } })), totalPages: 3 }];

// --- OR-01 y OR-02: lista blanca ---

describe("OR-01 lista blanca (§5)", () => {
  const hex = "ab".repeat(32);
  it("un hash, con comentarios, líneas vacías, mayúsculas, prefijo sha256: y BOM", () => {
    const text = `﻿# mi lista\r\n\r\nsha256:${hex.toUpperCase()}\r\n# fin\r\n`;
    expect(parseWhitelist(text)).toEqual({ ok: true, pdfId: `sha256:${hex}` });
  });
  it("sin prefijo", () => expect(parseWhitelist(`${hex}\n`)).toEqual({ ok: true, pdfId: `sha256:${hex}` }));
  it("archivo ausente", () => expect(parseWhitelist(null)).toEqual({ ok: false, reason: "lista-blanca-ausente" }));
  it("archivo vacío o solo comentarios", () => {
    expect(parseWhitelist("")).toEqual({ ok: false, reason: "lista-blanca-vacia" });
    expect(parseWhitelist("# nada\n\n")).toEqual({ ok: false, reason: "lista-blanca-vacia" });
  });
  it("una línea que no es un sha256", () => {
    expect(parseWhitelist("no-es-un-hash\n")).toEqual({ ok: false, reason: "lista-blanca-invalida" });
    expect(parseWhitelist(`${hex.slice(1)}\n`)).toEqual({ ok: false, reason: "lista-blanca-invalida" });
    expect(parseWhitelist(`${hex}\nbasura\n`)).toEqual({ ok: false, reason: "lista-blanca-invalida" });
  });
  it("dos hashes distintos", () => expect(parseWhitelist(`${hex}\n${"cd".repeat(32)}\n`)).toEqual({ ok: false, reason: "lista-blanca-multiple" }));
  it("el mismo hash repetido sigue siendo una sola entrada", () => expect(parseWhitelist(`${hex}\nsha256:${hex}\n`)).toEqual({ ok: true, pdfId: `sha256:${hex}` }));
});

describe("OR-02 sin OCR_LISTA_BLANCA", () => {
  it("variable sin definir: lista-blanca-ausente y 0 llamadas", async () => {
    const h = harness({ env: { GOOGLE_APPLICATION_CREDENTIALS: KEY, PROCESAMIENTO_EXTERNO: "permitir" } });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: lista-blanca-ausente"]);
    expect(h.calls).toHaveLength(0);
  });
  it("archivo inexistente: lista-blanca-ausente", async () => {
    const h = harness({ whitelistText: null });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: lista-blanca-ausente"]);
    expect(h.calls).toHaveLength(0);
  });
  it("sin GOOGLE_APPLICATION_CREDENTIALS: sin-credenciales (paso 1, antes de la lista)", async () => {
    const h = harness({ env: { PROCESAMIENTO_EXTERNO: "permitir" } });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: sin-credenciales"]);
    expect(h.calls).toHaveLength(0);
  });
});

// --- OR-03 a OR-05: compuerta y entrada ---

describe("OR-03 compuerta", () => {
  it("hash fuera de la lista blanca", async () => {
    const h = harness({ whitelistText: `${"ab".repeat(32)}\n` });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: compuerta"]);
    expect(h.calls).toHaveLength(0);
    expect(outFiles(h)).toEqual([]);
  });
  it("sin PROCESAMIENTO_EXTERNO", async () => {
    const base = harness();
    const h = harness({ env: { ...base.io.env, PROCESAMIENTO_EXTERNO: undefined } });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: compuerta"]);
    expect(h.calls).toHaveLength(0);
  });
  it("con PERMITIR_DATOS_REALES definida (la compuerta lanza y no se envía nada)", async () => {
    const base = harness();
    const h = harness({ env: { ...base.io.env, PERMITIR_DATOS_REALES: "1" } });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: compuerta"]);
    expect(h.calls).toHaveLength(0);
  });
});

describe("OR-04 PDF del fixture sintético", () => {
  it("la lista sintética va vacía: fuera de la lista blanca queda bloqueado (para eso está ocr:sintetico)", async () => {
    const h = harness({ whitelistText: `${HEX(S2.pdfId)}\n` });
    const result = await run(h, [pdfFile(S1), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: compuerta"]);
    expect(h.calls).toHaveLength(0);
  });
});

describe("OR-05 entrada", () => {
  it("un archivo que no empieza con %PDF-", async () => {
    const h = harness();
    const file = path.join(tmp, "x.pdf");
    writeFileSync(file, "no soy un pdf");
    const result = await run(h, [file, ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: entrada-invalida"]);
    expect(h.calls).toHaveLength(0);
  });
  it("dos rutas, ninguna ruta, ruta inexistente o bandera desconocida", async () => {
    for (const argv of [[pdfFile(S1), pdfFile(S2), ...P3], [...P3], [path.join(tmp, "no-existe.pdf"), ...P3], [pdfFile(S1), ...P3, "--otra"]]) {
      const h = harness();
      const result = await run(h, argv);
      expect(result.exitCode).not.toBe(0);
      expect(h.lines).toEqual(["rechazado: entrada-invalida"]);
      expect(h.calls).toHaveLength(0);
    }
  });
});

// --- OR-06 y OR-07: el pedido y las páginas ---

describe("OR-06 el pedido (enmienda D: páginas 1 a n según --paginas)", () => {
  it.each([
    ["3", [1, 2, 3]],
    ["5", [1, 2, 3, 4, 5]],
    ["1", [1]],
  ])("con --paginas %s: un único batchAnnotateFiles con el PDF inline, DOCUMENT_TEXT_DETECTION y pages %j", async (n, pages) => {
    const h = harness();
    await run(h, [pdfFile(), "--paginas", n]);
    expect(h.calls).toHaveLength(1);
    const { requests } = h.calls[0];
    expect(requests).toHaveLength(1);
    expect(requests[0].pages).toEqual(pages);
    expect(requests[0].features).toEqual([{ type: "DOCUMENT_TEXT_DETECTION" }]);
    expect(requests[0].inputConfig.mimeType).toBe("application/pdf");
    expect(Array.from(requests[0].inputConfig.content)).toEqual(Array.from(S1.pdf));
  });
});

describe("OR-07 verificación de páginas (§6, enmienda D: contra el n declarado)", () => {
  const page = (n: number) => ({ context: { pageNumber: n } });
  const cases: [string, string, VisionFileResponse, string][] = [
    ["totalPages = 6", "5", { responses: [1, 2, 3, 4, 5].map(page), totalPages: 6 }, "paginas-excedidas"],
    ["totalPages ausente", "3", { responses: [1, 2, 3].map(page) }, "paginas-no-confirmadas"],
    ["totalPages = 5.5", "5", { responses: [1, 2, 3, 4, 5].map(page), totalPages: 5.5 }, "paginas-no-confirmadas"],
    ["totalPages = 0", "5", { responses: [], totalPages: 0 }, "paginas-no-confirmadas"],
    ["menos respuestas que totalPages", "3", { responses: [1, 2].map(page), totalPages: 3 }, "paginas-no-confirmadas"],
    ["más respuestas que totalPages", "3", { responses: [1, 2, 3, 4].map(page), totalPages: 3 }, "paginas-no-confirmadas"],
    ["OR-20: totalPages = 5 y --paginas 3", "3", { responses: [1, 2, 3, 4, 5].map(page), totalPages: 5 }, "paginas-no-confirmadas"],
    ["totalPages = 3 y --paginas 5", "5", { responses: [1, 2, 3].map(page), totalPages: 3 }, "paginas-no-confirmadas"],
  ];
  it.each(cases)("%s (--paginas %s): se niega, no escribe ningún archivo y no lee nada", async (_name, n, file, reason) => {
    const h = harness({ files: [file] });
    const result = await run(h, [pdfFile(), "--paginas", n]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual([`rechazado: ${reason}`]);
    expect(h.writes).toEqual([]);
    expect(outFiles(h)).toEqual([]);
    expect(existsSync(h.outDir)).toBe(false);
  });
});

describe("OR-19 --paginas (enmienda D, E-1): rechazo antes de la red", () => {
  const cases: [string, string[], string][] = [
    ["ausente", [], "entrada-invalida"],
    ["sin valor", ["--paginas"], "entrada-invalida"],
    ["0", ["--paginas", "0"], "entrada-invalida"],
    ["negativo", ["--paginas", "-1"], "entrada-invalida"],
    ["2.5", ["--paginas", "2.5"], "entrada-invalida"],
    ["no numérico", ["--paginas", "tres"], "entrada-invalida"],
    ["repetida", ["--paginas", "3", "--paginas", "3"], "entrada-invalida"],
    ["con otra bandera como valor", ["--paginas", "--reenviar"], "entrada-invalida"],
    ["6", ["--paginas", "6"], "paginas-excedidas"],
    ["50", ["--paginas", "50"], "paginas-excedidas"],
  ];
  it.each(cases)("--paginas %s: rechazo antes de la red, 0 llamadas al cliente", async (_name, extra, reason) => {
    const h = harness();
    const result = await run(h, [pdfFile(), ...extra]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual([`rechazado: ${reason}`]);
    expect(h.calls).toHaveLength(0);
    expect(h.writes).toEqual([]);
  });
});

describe("OR-21 la compuerta va antes de la caché (E-2, enmienda D)", () => {
  it("con el hash de otro PDF en la lista y la respuesta guardada del primero: compuerta; la caché no se lee", async () => {
    const first = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    await run(first, [pdfFile(), ...P3]);
    const cached = path.join(first.outDir, `${HEX(S1.pdfId)}.vision.json`);
    expect(existsSync(cached)).toBe(true);

    // La lista habilita ahora otro PDF (un hash por vez, D-2); la respuesta del primero sigue en disco.
    const second = harness({ files: new Error("no debía llamarse"), whitelistText: `${HEX(S2.pdfId)}\n` });
    const touched: string[] = [];
    const { readText, exists } = second.io;
    second.io.readText = (file) => (touched.push(file), readText(file));
    second.io.exists = (file) => (touched.push(file), exists(file));
    const result = await runOcrReal([pdfFile(), ...P3], second.io, { outDir: first.outDir });
    expect(result.exitCode).not.toBe(0);
    expect(second.lines).toEqual(["rechazado: compuerta"]);
    expect(second.calls).toHaveLength(0);
    expect(touched.filter((file) => file.endsWith(".vision.json"))).toEqual([]);
    expect(second.writes).toEqual([]);
  });
});

// --- OR-08, OR-09, OR-10: salidas y consola ---

const TEMPLATES: RegExp[] = [
  /^páginas leídas: \d+$/,
  /^palabras: \d+$/,
  /^lectura: (leído|rechazado \([a-z-]+\))$/,
  /^regla: [a-z]+(-[a-z]+)*$/,
  /^página: (\d+|-)$/,
  /^filas: \d+$/,
  /^pending: code=\d+ name=\d+ finalL=\d+ finalA=\d+ quantity=\d+ cantos=\d+ otros=\d+$/,
  /^hoja-incompleta: (sí|no)$/,
  /^comparación: (iguales=\d+ pending=\d+ distintos-sin-pending=\d+|comparacion-desalineada \(filas ocr=\d+, transcripción=\d+\)|lectura-rechazada)$/,
  /^salidas: \.ocr-data\/real\/$/,
];

describe("OR-08 salidas", () => {
  it("respuesta de 3 páginas: escribe solo bajo .ocr-data/real/ los tres archivos de §8", async () => {
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    const transcription = path.join(tmp, "transcripcion.json");
    writeFileSync(transcription, JSON.stringify({ ...EXPECTED_S1, source: { ...EXPECTED_S1.source, reader: "transcripcion-manual" } }));
    const result = await run(h, [pdfFile(), ...P3, "--transcripcion", transcription]);
    expect(result.exitCode).toBe(0);
    const id = HEX(S1.pdfId);
    expect(outFiles(h)).toEqual([`${id}.comparacion.json`, `${id}.lectura.json`, `${id}.vision.json`]);
    for (const file of h.writes) expect(path.dirname(file)).toBe(h.outDir);
    // Nada fuera de la carpeta de salida (el PDF, la lista y la transcripción no se tocaron).
    expect(existsSync(path.join(tmp, "entrada-secreta", `${id}.vision.json`))).toBe(false);
  });
  it("sin --transcripcion no escribe comparacion.json", async () => {
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    await run(h, [pdfFile(), ...P3]);
    const id = HEX(S1.pdfId);
    expect(outFiles(h)).toEqual([`${id}.lectura.json`, `${id}.vision.json`]);
  });
  it("vision.json no lleva el PDF; lectura.json es el PdfReading con reader ocr-llm", async () => {
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    await run(h, [pdfFile(), ...P3]);
    const id = HEX(S1.pdfId);
    const vision = readFileSync(path.join(h.outDir, `${id}.vision.json`), "utf8");
    expect(vision).not.toContain("%PDF-");
    expect(JSON.parse(vision).files).toHaveLength(1);
    const reading = JSON.parse(readFileSync(path.join(h.outDir, `${id}.lectura.json`), "utf8")) as { ok: boolean; document?: CutListPdf };
    expect(reading.ok).toBe(true);
    expect(reading.document?.source).toMatchObject({ reader: "ocr-llm", readerVersion: "vision-files-annotate/real", pdfId: S1.pdfId });
  });
});

describe("formatSummary", () => {
  it("hoja-incompleta: sí solo cuando la razón del rechazo es hoja-incompleta", () => {
    const incomplete = formatSummary({ pages: 5, words: 10, reading: { ok: false, reason: "hoja-incompleta", detail: "texto con 9999-91-M01-C01", rule: "hoja-sin-pie", page: 3 }, comparison: null });
    expect(incomplete).toContain("lectura: rechazado (hoja-incompleta)");
    expect(incomplete).toContain("hoja-incompleta: sí");
    expect(incomplete.join("\n")).not.toContain("9999");
  });
  it("lectura con pending: los cuenta por tipo", () => {
    const document = structuredClone(EXPECTED_S1);
    document.pending = [
      { path: "boards[0].pieces[0].finalL", reason: "x" },
      { path: "boards[0].pieces[0].edges.s1", reason: "x" },
      { path: "header.project", reason: "x" },
    ];
    const lines = formatSummary({ pages: 3, words: 1, reading: { ok: true, document }, comparison: null });
    expect(lines).toContain("pending: code=0 name=0 finalL=1 finalA=0 quantity=0 cantos=1 otros=1");
    expect(lines).toContain("lectura: leído");
  });
});

describe("OR-09 consola: solo conteos", () => {
  const forbidden = (): string[] => [
    S1.doc.fileName,
    HEX(S1.pdfId),
    tmp,
    "entrada-secreta",
    ...EXPECTED_S1.boards.flatMap((board) => board.pieces.flatMap((piece) => [piece.code ?? "", piece.name])),
  ];
  it("corrida exitosa", async () => {
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    const transcription = path.join(tmp, "transcripcion.json");
    writeFileSync(transcription, JSON.stringify(EXPECTED_S1));
    await run(h, [pdfFile(), ...P3, "--transcripcion", transcription]);
    expect(h.lines.length).toBeGreaterThanOrEqual(7);
    for (const line of h.lines) expect(TEMPLATES.some((t) => t.test(line))).toBe(true);
    for (const text of forbidden()) if (text !== "") expect(h.lines.join("\n")).not.toContain(text);
    expect(h.lines[0]).toBe("páginas leídas: 3");
  });
  it("lectura rechazada: solo la razón del catálogo, sin el detail", async () => {
    const h = harness({ files: emptyPages() });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).toBe(0);
    for (const line of h.lines) expect(TEMPLATES.some((t) => t.test(line))).toBe(true);
    expect(h.lines).toContain("lectura: rechazado (sin-capa-de-texto)");
    expect(h.lines).toContain("regla: documento-sin-texto");
    expect(h.lines).toContain("página: -");
    expect(h.lines).toContain("filas: 0");
    expect(h.lines).toContain("hoja-incompleta: no");
    for (const text of forbidden()) if (text !== "") expect(h.lines.join("\n")).not.toContain(text);
    const id = HEX(S1.pdfId);
    const reading = JSON.parse(readFileSync(path.join(h.outDir, `${id}.lectura.json`), "utf8")) as { ok: boolean; detail?: string };
    expect(reading.ok).toBe(false);
    expect(reading.detail).toBeTruthy();
    expect(h.lines.join("\n")).not.toContain(reading.detail as string);
  });
});

describe("OR-17 diagnóstico del rechazo (D-a): regla y página, nunca el detail", () => {
  const secret = 'El PDF dice "Centimetro 9999-91-M01-C01 Lateral secreto": solo se admite Milimetro.';
  const rejected = (page: number | null) =>
    formatSummary({ pages: 5, words: 1190, reading: { ok: false, reason: "unidad-no-soportada", detail: secret, rule: "resumen-unidad-no-soportada", page }, comparison: null });

  it("imprime regla y página debajo de lectura, con valores del catálogo", () => {
    const lines = rejected(1);
    const at = lines.indexOf("lectura: rechazado (unidad-no-soportada)");
    expect(at).toBeGreaterThan(-1);
    expect(lines.slice(at + 1, at + 3)).toEqual(["regla: resumen-unidad-no-soportada", "página: 1"]);
    for (const line of lines) expect(TEMPLATES.some((t) => t.test(line))).toBe(true);
  });
  it("página null se imprime como '-'", () => {
    expect(rejected(null)).toContain("página: -");
  });
  it("ni el detail ni ningún fragmento suyo aparece", () => {
    const text = rejected(1).join("\n");
    for (const fragment of [secret, "Centimetro", "9999-91", "Lateral", "secreto"]) expect(text).not.toContain(fragment);
  });
  it("una lectura leída no imprime regla ni página", () => {
    const lines = formatSummary({ pages: 3, words: 1, reading: { ok: true, document: structuredClone(EXPECTED_S1) }, comparison: null });
    expect(lines.some((line) => line.startsWith("regla:") || line.startsWith("página:"))).toBe(false);
  });
});

describe("OR-10 error del proveedor", () => {
  it("el mensaje (con texto del documento) no se imprime", async () => {
    const secret = "Lateral 9999-91-M01-C01 703 x 487";
    const h = harness({ files: new Error(`fallo al leer: ${secret}`) });
    const result = await run(h, [pdfFile(), ...P3]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines).toEqual(["rechazado: proveedor-error"]);
    expect(h.writes).toEqual([]);
  });
});

// --- OR-11 y OR-12: funciones puras ---

describe("OR-11 classifyPending", () => {
  it("cuenta por último segmento; cantos por '.edges'; el resto en otros", () => {
    const paths = [
      "boards[0].pieces[0].code",
      "boards[0].pieces[1].name",
      "boards[0].pieces[1].name",
      "boards[0].pieces[2].finalL",
      "boards[1].pieces[0].finalA",
      "boards[1].pieces[0].quantity",
      "boards[0].pieces[0].edges",
      "boards[0].pieces[3].edges.s2.material",
      "header.generatedAt",
      "summary.boards[0].count",
      "boards[0].diagram",
    ];
    expect(classifyPending(paths)).toEqual({ code: 1, name: 2, finalL: 1, finalA: 1, quantity: 1, cantos: 2, otros: 3 });
  });
  it("sin pending, todo en 0", () => expect(classifyPending([])).toEqual({ code: 0, name: 0, finalL: 0, finalA: 0, quantity: 0, cantos: 0, otros: 0 }));
});

describe("OR-12 compareReading", () => {
  const clone = (): CutListPdf => structuredClone(EXPECTED_S1);
  const ok = (document: CutListPdf) => ({ ok: true as const, document });
  const pieces = EXPECTED_S1.boards.flatMap((board) => board.pieces).length;

  it("lectura igual a la transcripción: todo iguales", () => {
    const result = compareReading(ok(clone()), EXPECTED_S1);
    expect(result.result).toBe("comparado");
    if (result.result !== "comparado") return;
    expect(result.counts.pending).toBe(0);
    expect(result.counts.distintosSinPending).toBe(0);
    expect(result.counts.iguales).toBeGreaterThanOrEqual(pieces * 9); // code, name, quantity, finalL, finalA, s1..s4
  });
  it("campo distinto CON pending: cuenta pending, no distinto", () => {
    const doc = clone();
    doc.boards[0].pieces[0].finalL = null;
    doc.pending.push({ path: "boards[0].pieces[0].finalL", reason: "ilegible" });
    const result = compareReading(ok(doc), EXPECTED_S1);
    if (result.result !== "comparado") throw new Error("debía comparar");
    expect(result.counts).toMatchObject({ pending: 1, distintosSinPending: 0 });
  });
  it("campo distinto SIN pending: cuenta distintos-sin-pending", () => {
    const doc = clone();
    doc.boards[0].pieces[0].finalL = 999;
    doc.boards[0].pieces[1].name = "otro";
    const result = compareReading(ok(doc), EXPECTED_S1);
    if (result.result !== "comparado") throw new Error("debía comparar");
    expect(result.counts).toMatchObject({ pending: 0, distintosSinPending: 2 });
    expect(result.detail.filter((f) => f.status === "distinto-sin-pending").map((f) => f.path)).toEqual(["boards[0].pieces[0].finalL", "boards[0].pieces[1].name"]);
  });
  it("marca de canto: presencia y material", () => {
    const doc = clone();
    const strips = doc.boards[0].pieces[0].edges;
    if (strips === "columna-ausente") throw new Error("el fixture trae cantos");
    strips.s3 = { label: "x", material: "Gris Sintético", widthMm: 19, thicknessText: null }; // marca de más
    if (strips.s1) strips.s1 = { ...strips.s1, material: "Otro" }; // material distinto
    const result = compareReading(ok(doc), EXPECTED_S1);
    if (result.result !== "comparado") throw new Error("debía comparar");
    expect(result.counts.distintosSinPending).toBe(2);
  });
  it("una lectura rechazada no se compara", () => {
    expect(compareReading({ ok: false, reason: "estructura-no-reconocida", detail: "x", rule: "resumen-sin-unidad", page: 1 }, EXPECTED_S1)).toEqual({ result: "lectura-rechazada" });
  });
});

// --- OR-13 y OR-14: caché y rutas ---

describe("OR-13 caché", () => {
  it("con la respuesta guardada y sin --reenviar no vuelve a enviar; el resultado es el mismo", async () => {
    const files = visionResponses(S1, [[1, 2, 3]], idealWords(S1));
    const first = harness({ files });
    await run(first, [pdfFile(), ...P3]);
    expect(first.calls).toHaveLength(1);

    const second = harness({ files: new Error("no debía llamarse") });
    const result = await runOcrReal([pdfFile(), ...P3], second.io, { outDir: first.outDir });
    expect(result.exitCode).toBe(0);
    expect(second.calls).toHaveLength(0);
    expect(second.lines).toEqual(first.lines);
  });
  it("con --reenviar vuelve a enviar una vez", async () => {
    const files = visionResponses(S1, [[1, 2, 3]], idealWords(S1));
    const first = harness({ files });
    await run(first, [pdfFile(), ...P3]);
    const second = harness({ files });
    await runOcrReal([pdfFile(), ...P3, "--reenviar"], second.io, { outDir: first.outDir });
    expect(second.calls).toHaveLength(1);
  });
  it("la caché también pasa por la verificación de páginas", async () => {
    const first = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    await run(first, [pdfFile(), ...P3]);
    const cached = path.join(first.outDir, `${HEX(S1.pdfId)}.vision.json`);
    const doc = JSON.parse(readFileSync(cached, "utf8")) as { files: VisionFileResponse[] };
    doc.files[0].totalPages = 9;
    writeFileSync(cached, JSON.stringify(doc));
    const second = harness();
    const result = await runOcrReal([pdfFile(), ...P3], second.io, { outDir: first.outDir });
    expect(result.exitCode).not.toBe(0);
    expect(second.lines).toEqual(["rechazado: paginas-excedidas"]);
    expect(second.calls).toHaveLength(0);
  });
});

describe("OR-14 rutas de salida", () => {
  it("todas bajo outDir, con nombre <hex>.<tipo>.json; ninguna deriva de la ruta del PDF", async () => {
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    const transcription = path.join(tmp, "transcripcion.json");
    writeFileSync(transcription, JSON.stringify(EXPECTED_S1));
    await run(h, [pdfFile(S1, "carpeta con ../espacios y raros"), ...P3, "--transcripcion", transcription]);
    expect(h.writes.length).toBe(3);
    for (const file of h.writes) {
      expect(path.dirname(file)).toBe(h.outDir);
      expect(path.basename(file)).toMatch(/^[0-9a-f]{64}\.(vision|lectura|comparacion)\.json$/);
    }
    expect(h.writes.join("\n")).not.toContain("espacios");
  });
});

// --- OR-16 (nuevo, O-5): comparación desalineada ---

describe("OR-16 comparacion-desalineada", () => {
  it("si la cantidad de filas difiere, no empareja por posición", () => {
    const reading = structuredClone(EXPECTED_S1);
    reading.boards[0].pieces.pop();
    const result = compareReading({ ok: true, document: reading }, EXPECTED_S1);
    expect(result.result).toBe("comparacion-desalineada");
    if (result.result !== "comparacion-desalineada") return;
    expect(result.readingRows).toBe(EXPECTED_S1.boards.flatMap((b) => b.pieces).length - 1);
    expect(result.transcriptionRows).toBe(EXPECTED_S1.boards.flatMap((b) => b.pieces).length);
    expect("counts" in result).toBe(false);
    expect("detail" in result).toBe(false);
  });
  it("si la cantidad de tableros difiere", () => {
    const reading = structuredClone(EXPECTED_S1);
    reading.boards.pop();
    expect(compareReading({ ok: true, document: reading }, EXPECTED_S1).result).toBe("comparacion-desalineada");
  });
  it("mismo total de filas pero repartido distinto entre tableros: también desalineada", () => {
    const transcription = structuredClone(EXPECTED_S1);
    const reading = structuredClone(EXPECTED_S1);
    const moved = reading.boards[0].pieces.pop();
    if (!moved || reading.boards.length < 2) return; // el fixture de un solo tablero no aplica
    reading.boards[1].pieces.push(moved);
    expect(compareReading({ ok: true, document: reading }, transcription).result).toBe("comparacion-desalineada");
  });
  it("de punta a punta: sale con 0, imprime la línea y comparacion.json no lleva campos emparejados", async () => {
    const short = structuredClone(EXPECTED_S1);
    short.boards[0].pieces.pop();
    const transcription = path.join(tmp, "transcripcion.json");
    writeFileSync(transcription, JSON.stringify(short));
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    const result = await run(h, [pdfFile(), ...P3, "--transcripcion", transcription]);
    expect(result.exitCode).toBe(0);
    expect(h.lines.find((line) => line.startsWith("comparación:"))).toMatch(/^comparación: comparacion-desalineada \(filas ocr=\d+, transcripción=\d+\)$/);
    const json = JSON.parse(readFileSync(path.join(h.outDir, `${HEX(S1.pdfId)}.comparacion.json`), "utf8")) as Record<string, unknown>;
    expect(json.result).toBe("comparacion-desalineada");
    expect(json.detail).toBeUndefined();
  });
  it("transcripción que no es un CutListPdf: transcripcion-invalida", async () => {
    const bad = path.join(tmp, "mala.json");
    writeFileSync(bad, JSON.stringify({ hola: 1 }));
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    const result = await run(h, [pdfFile(), ...P3, "--transcripcion", bad]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines.at(-1)).toBe("rechazado: transcripcion-invalida");
  });
  it("transcripción con reader distinto de transcripcion-manual: transcripcion-invalida", async () => {
    const bad = path.join(tmp, "otra.json");
    writeFileSync(bad, JSON.stringify({ ...EXPECTED_S1, source: { ...EXPECTED_S1.source, reader: "ocr-llm" } }));
    const h = harness({ files: visionResponses(S1, [[1, 2, 3]], idealWords(S1)) });
    const result = await run(h, [pdfFile(), ...P3, "--transcripcion", bad]);
    expect(result.exitCode).not.toBe(0);
    expect(h.lines.at(-1)).toBe("rechazado: transcripcion-invalida");
  });
});

// Los scripts de una sola salida de red: la lógica no usa fetch (la suite además lo bloquea).
describe("sin red", () => {
  it("la lógica no hace ningún fetch", async () => {
    const counter = (globalThis as { __llamadasDeRed?: { calls: number } }).__llamadasDeRed;
    const before = counter?.calls ?? 0;
    await run(harness(), [pdfFile(), ...P3]);
    expect(counter?.calls ?? 0).toBe(before);
    expect(pdfIdOf(S1.pdf)).toBe(S1.pdfId);
  });
});
