// npm run ocr:sintetico — TS-13 (docs/spec-fixture-sintetico.md §9): prueba EN VIVO, manual, nunca en CI.
// Manda los PDF del fixture sintético a Cloud Vision `files:annotate` (PDF inline, lotes de 5 páginas) y compara
// la lectura con esperado/*.json. NO es una métrica de calidad del OCR: los glifos no son los de los PDF reales.
//
// Reglas (CLAUDE.md, "Extracción OCR / Cloud Vision"):
// - Credenciales solo por GOOGLE_APPLICATION_CREDENTIALS (ruta a la clave en $HOME\.secrets\gcp). Este script no la lee.
// - Solo PDF de la lista sintética (manifiesto): la compuerta decide por sha256 antes de cualquier llamada de red.
// - Las respuestas se guardan solo en .ocr-data/sintetico/<sha256>.json. Por consola, solo conteos y rutas.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { pageBatches } from "@/pdf/ocr/batches";
import { puedeEnviar } from "@/pdf/ocr/gate";
import { parseOcrWords } from "@/pdf/ocr/readWords";
import { visionToTextInput, type VisionFileResponse } from "@/pdf/ocr/vision";
import { buildAll } from "../tests/helpers/pdfSintetico/outputs";

/** Límite de páginas por pedido de `files:annotate` síncrono. */
const VISION_BATCH = 5;
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".ocr-data", "sintetico");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "pdf-sintetico");

/** Rutas JSON de las hojas que difieren (solo para contarlas; no se imprime el texto leído). */
function differences(a: unknown, b: unknown, at = ""): string[] {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return Object.is(a, b) ? [] : [at];
  if (Array.isArray(a) !== Array.isArray(b)) return [at];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) => differences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${at}.${key}`));
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS (ruta absoluta a la clave, fuera del repo).");
  const manifest = JSON.parse(readFileSync(path.join(FIXTURE, "manifiesto.json"), "utf8")) as { synthetic: boolean; files: { sha256: string }[] };
  if (manifest.synthetic !== true) throw new Error("El manifiesto no está marcado como sintético.");
  const lists = { synthetic: new Set(manifest.files.map((file) => file.sha256)), whitelist: new Set<string>() };

  const client = new ImageAnnotatorClient();
  mkdirSync(OUT, { recursive: true });

  for (const synthetic of buildAll()) {
    // Compuerta ANTES de la red. Con PERMITIR_DATOS_REALES definida, lanza y no se envía nada.
    const decision = puedeEnviar(synthetic.pdf, process.env, lists);
    if (!decision.ok || decision.via !== "sintetico") throw new Error(`${synthetic.doc.fileName}: bloqueado por la compuerta (${decision.ok ? decision.via : decision.motivo}).`);

    const batches = pageBatches(synthetic.layout.pageCount, VISION_BATCH);
    const files: VisionFileResponse[] = [];
    for (const pages of batches) {
      const [response] = await client.batchAnnotateFiles({
        requests: [{ inputConfig: { content: Buffer.from(synthetic.pdf), mimeType: "application/pdf" }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], pages }],
      });
      files.push(...((response.responses ?? []) as VisionFileResponse[]));
    }
    const outFile = path.join(OUT, `${decision.pdfId.replace("sha256:", "")}.json`);
    writeFileSync(outFile, `${JSON.stringify({ fileName: synthetic.doc.fileName, pdfId: decision.pdfId, batches, files }, null, 2)}\n`);

    const conversion = visionToTextInput(files, {
      fileName: synthetic.doc.fileName,
      pdfId: decision.pdfId,
      producer: null,
      readerVersion: "vision-files-annotate/sintetico",
      pageCount: synthetic.layout.pageCount,
    });
    if (!conversion.ok) {
      console.log(`${synthetic.doc.fileName}: ${batches.length} pedidos; conversión: ${conversion.reason}. Respuesta en ${path.relative(ROOT, outFile)}`);
      continue;
    }
    const reading = parseOcrWords(conversion.input);
    const expected = JSON.parse(readFileSync(path.join(FIXTURE, "esperado", `${synthetic.doc.id}.json`), "utf8")) as Record<string, unknown>;
    const summary = reading.ok
      ? (() => {
          const { source, ...document } = reading.document;
          void source;
          const { source: expectedSource, ...rest } = expected;
          void expectedSource;
          return `lectura ok, ${document.pending.length} pendientes, ${differences(document, rest).length} campos distintos de esperado/`;
        })()
      : `lectura: ${reading.reason}`;
    console.log(`${synthetic.doc.fileName}: ${batches.length} pedidos, ${conversion.input.elements.length} palabras; ${summary}. Respuesta en ${path.relative(ROOT, outFile)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
