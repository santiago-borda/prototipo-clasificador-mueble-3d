// npm run ocr:real -- <ruta al PDF> [--transcripcion <ruta al JSON>] [--reenviar]
// SPEC-B2 (docs/spec-ocr-prueba-real.md): prueba MANUAL, con UN único PDF real, a correr por una persona con su propia
// clave. NUNCA en CI ni desde la app. Punto de entrada delgado: la lógica y sus pruebas están en scripts/ocr-real/.
//
// Reglas (CLAUDE.md, "Extracción OCR / Cloud Vision"):
// - GOOGLE_APPLICATION_CREDENTIALS (ruta a la clave, fuera del repo): este script no la lee; la toma el cliente.
// - PROCESAMIENTO_EXTERNO=permitir y OCR_LISTA_BLANCA (archivo con el sha256 del PDF, fuera del repo).
// - Salidas solo en .ocr-data/real/. Por consola, solo conteos: nunca contenido del PDF, nombres, hashes ni errores.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import type { VisionFileResponse } from "@/pdf/ocr/vision";
import { runOcrReal, type OcrRealIo } from "./ocr-real/run";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".ocr-data", "real");

/** El cliente solo se crea si todos los rechazos previos a la red pasaron (los pasos 1 a 5 no lo necesitan). */
let client: ImageAnnotatorClient | null = null;

const io: OcrRealIo = {
  env: process.env,
  readBytes: (file) => (existsSync(file) ? new Uint8Array(readFileSync(file)) : null),
  readText: (file) => (existsSync(file) ? readFileSync(file, "utf8") : null),
  exists: (file) => existsSync(file),
  mkdirp: (dir) => void mkdirSync(dir, { recursive: true }),
  writeText: (file, text) => writeFileSync(file, text),
  vision: {
    batchAnnotateFiles: async (request) => {
      client ??= new ImageAnnotatorClient();
      const [{ inputConfig, features, pages }] = request.requests;
      const [response] = await client.batchAnnotateFiles({ requests: [{ inputConfig: { content: Buffer.from(inputConfig.content), mimeType: inputConfig.mimeType }, features, pages }] });
      return [{ responses: response.responses as readonly VisionFileResponse[] | undefined }];
    },
  },
  log: (line) => console.log(line),
};

runOcrReal(process.argv.slice(2), io, { outDir: OUT_DIR })
  .then(({ exitCode }) => {
    process.exitCode = exitCode;
  })
  .catch(() => {
    // Ningún mensaje de error: podría incluir texto o rutas del documento.
    console.log("rechazado: error-interno");
    process.exitCode = 1;
  });
