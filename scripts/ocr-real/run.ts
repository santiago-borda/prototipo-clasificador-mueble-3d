// Lógica de `npm run ocr:real` (docs/spec-ocr-prueba-real.md §4): una corrida manual, un único PDF real, con las
// dependencias INYECTADAS (`OcrRealIo`) para probarla con datos sintéticos y sin red. Aquí no hay `process`, `fs` ni
// el cliente de Vision: los pone `scripts/ocr-real.ts`. No se agrega nada en `src/`.
//
// Todo rechazo de los pasos 1 a 7 ocurre ANTES de cualquier llamada de red (el 6 es la única) y sale con código 1.
// La consola solo imprime líneas de `summary.ts`: texto fijo y números.

import path from "node:path";
import { puedeEnviar } from "@/pdf/ocr/gate";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import { visionToTextInput, type VisionFileResponse } from "@/pdf/ocr/vision";
import type { PdfReading } from "@/pdf/types";
import { compareReading, isTranscription, type Comparison } from "./compare";
import { formatSummary, rejectionLine, type Rejection } from "./summary";
import { parseWhitelist } from "./whitelist";

/** Páginas que se piden de forma explícita (§6). */
export const REQUESTED_PAGES: readonly number[] = [1, 2, 3, 4, 5];
export const READER_VERSION = "vision-files-annotate/real";

export interface VisionRequest {
  requests: [
    {
      inputConfig: { content: Uint8Array; mimeType: "application/pdf" };
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }];
      pages: number[];
    },
  ];
}

/** Lo que usa el script del cliente real: `[respuesta, ...]`, como `ImageAnnotatorClient.batchAnnotateFiles`. */
export interface VisionPort {
  batchAnnotateFiles(request: VisionRequest): Promise<readonly [{ responses?: readonly VisionFileResponse[] | null }, ...unknown[]]>;
}

export interface OcrRealIo {
  env: Readonly<Record<string, string | undefined>>;
  readBytes(file: string): Uint8Array | null;
  readText(file: string): string | null;
  exists(file: string): boolean;
  mkdirp(dir: string): void;
  writeText(file: string, text: string): void;
  vision: VisionPort;
  log(line: string): void;
}

export interface OcrRealOptions {
  /** `<raíz del repo>/.ocr-data/real`. Es la única carpeta donde se escribe. */
  outDir: string;
}

export interface OcrRealResult {
  exitCode: number;
}

interface Args {
  pdfPath: string;
  transcriptionPath: string | null;
  resend: boolean;
}

/** Una sola ruta de PDF; `--transcripcion <ruta>` y `--reenviar` son las únicas banderas. */
function parseArgs(argv: readonly string[]): Args | null {
  const positional: string[] = [];
  let transcriptionPath: string | null = null;
  let resend = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--reenviar") resend = true;
    else if (arg === "--transcripcion") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--") || transcriptionPath !== null) return null;
      transcriptionPath = value;
      i += 1;
    } else if (arg.startsWith("--")) return null;
    else positional.push(arg);
  }
  if (positional.length !== 1) return null;
  return { pdfPath: positional[0], transcriptionPath, resend };
}

type PageCheck = { ok: true; totalPages: number; file: VisionFileResponse } | { ok: false; reason: "paginas-excedidas" | "paginas-no-confirmadas" };

/** §6: "no puedo confirmar que son 5 o menos" equivale a negarse. */
function checkPages(files: readonly VisionFileResponse[]): PageCheck {
  if (files.length !== 1) return { ok: false, reason: "paginas-no-confirmadas" };
  const file = files[0];
  const total = file.totalPages;
  if (typeof total !== "number" || !Number.isInteger(total) || total < 1) return { ok: false, reason: "paginas-no-confirmadas" };
  if (total > REQUESTED_PAGES.length) return { ok: false, reason: "paginas-excedidas" };
  if ((file.responses ?? []).length !== total) return { ok: false, reason: "paginas-no-confirmadas" };
  return { ok: true, totalPages: total, file };
}

const asJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Respuesta guardada: `{ files: [...] }`. Cualquier otra forma no se puede usar. */
function parseCache(text: string): VisionFileResponse[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { files } = parsed as { files?: unknown };
    return Array.isArray(files) ? (files as VisionFileResponse[]) : null;
  } catch {
    return null;
  }
}

export async function runOcrReal(argv: readonly string[], io: OcrRealIo, options: OcrRealOptions): Promise<OcrRealResult> {
  const reject = (reason: Rejection): OcrRealResult => {
    io.log(rejectionLine(reason));
    return { exitCode: 1 };
  };

  // Paso 1 y 2: credenciales y lista blanca (la entrada mal formada también se rechaza antes de la red).
  if (!io.env.GOOGLE_APPLICATION_CREDENTIALS) return reject("sin-credenciales");
  const listPath = io.env.OCR_LISTA_BLANCA;
  const whitelist = parseWhitelist(listPath ? io.readText(listPath) : null);
  if (!whitelist.ok) return reject(whitelist.reason);

  // Paso 3: una sola ruta, que existe y empieza con %PDF-.
  const args = parseArgs(argv);
  if (!args) return reject("entrada-invalida");
  const pdf = io.readBytes(args.pdfPath);
  if (!pdf || new TextDecoder("latin1").decode(pdf.subarray(0, 5)) !== "%PDF-") return reject("entrada-invalida");

  // Paso 4: compuerta por sha256. Con PERMITIR_DATOS_REALES definida lanza y no se envía nada.
  let decision;
  try {
    decision = puedeEnviar(pdf, io.env, { synthetic: new Set<string>(), whitelist: new Set([whitelist.pdfId]) });
  } catch {
    return reject("compuerta");
  }
  if (!decision.ok || decision.via !== "lista-blanca") return reject("compuerta");
  const hex = decision.pdfId.replace("sha256:", "");
  const visionFile = path.join(options.outDir, `${hex}.vision.json`);

  // Paso 5: caché. Con la respuesta guardada y sin --reenviar no hay red.
  let files: VisionFileResponse[];
  let fresh = false;
  const cachedText = !args.resend && io.exists(visionFile) ? io.readText(visionFile) : null;
  if (cachedText !== null) {
    const cached = parseCache(cachedText);
    if (!cached) return reject("conversion-fallida");
    files = cached;
  } else {
    // Paso 6: un único pedido, PDF inline, páginas explícitas. Del error del proveedor no se imprime nada.
    try {
      const [response] = await io.vision.batchAnnotateFiles({
        requests: [{ inputConfig: { content: pdf, mimeType: "application/pdf" }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], pages: [...REQUESTED_PAGES] }],
      });
      files = [...(response.responses ?? [])];
    } catch {
      return reject("proveedor-error");
    }
    fresh = true;
  }

  // Paso 7: total de páginas, antes de guardar o leer nada.
  const pages = checkPages(files);
  if (!pages.ok) return reject(pages.reason);

  // Paso 8: guardar la respuesta cruda, convertir y leer.
  io.mkdirp(options.outDir);
  if (fresh) io.writeText(visionFile, asJson({ readerVersion: READER_VERSION, files }));
  const conversion = visionToTextInput(files, {
    fileName: path.basename(args.pdfPath),
    pdfId: decision.pdfId,
    producer: null,
    readerVersion: READER_VERSION,
    pageCount: pages.totalPages,
  });
  if (!conversion.ok) return reject("conversion-fallida");
  const reading: PdfReading = parseOcrWords(conversion.input);
  io.writeText(path.join(options.outDir, `${hex}.lectura.json`), asJson(reading));

  // Paso 9: comparación opcional.
  let comparison: Comparison | null = null;
  if (args.transcriptionPath !== null) {
    const text = io.readText(args.transcriptionPath);
    let truth: unknown = null;
    try {
      truth = text === null ? null : JSON.parse(text);
    } catch {
      truth = null;
    }
    if (!isTranscription(truth)) return reject("transcripcion-invalida");
    comparison = compareReading(reading, truth);
    io.writeText(path.join(options.outDir, `${hex}.comparacion.json`), asJson(comparison));
  }

  for (const line of formatSummary({ pages: pages.totalPages, words: conversion.input.elements.length, reading, comparison })) io.log(line);
  return { exitCode: 0 };
}
