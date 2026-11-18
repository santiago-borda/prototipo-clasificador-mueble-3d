// npm run ocr:real -- <ruta al PDF> --paginas <n> [--transcripcion <ruta al JSON>] [--reenviar]
// SPEC-B2 v0.4 (docs/spec-ocr-prueba-real.md): prueba MANUAL, con UN PDF real por corrida, a correr por una persona con su
// propia clave. NUNCA en CI ni desde la app. Punto de entrada delgado: la lógica y sus pruebas están en scripts/ocr-real/.
//
// --paginas <n> es OBLIGATORIO (enmienda D, E-1): cuántas páginas tiene el PDF (1 a 5; Cedro 18: 5, Blanco 18: 3). Vision
// lo confirma después con totalPages y el pedido lleva pages [1..n].
//
// UN hash por vez (D-2): para correr otro PDF, reemplazá a mano el hash de OCR_LISTA_BLANCA y registralo (SPEC-B2 §12).
// La compuerta va ANTES que la caché (E-2): con el hash de otro PDF en la lista no se relee la respuesta guardada. Para
// releer la caché del Cedro 18 hay que RESTITUIR su hash en la lista.
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
