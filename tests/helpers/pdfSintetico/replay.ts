// Replay de la respuesta REAL de Cloud Vision a los PDF sintéticos (TS-13, 10/11), reducida a palabras y cajas.
// Archivos en tests/fixtures/pdf-sintetico/replay/: solo datos sintéticos (código de proyecto 9999). Sin red.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { PdfTextElement, PdfTextInput } from "@/pdf/types";

const REPLAY_DIR = path.resolve(__dirname, "..", "..", "fixtures", "pdf-sintetico", "replay");

export type ReplayId = "S1" | "S2" | "S3";

type ReplayWord = readonly [page: number, text: string, x: number, y: number, width: number, height: number];

interface ReplayFile {
  fileName: string;
  pdfId: string;
  pageCount: number;
  pageWidths: { page: number; width: number }[];
  words: ReplayWord[];
}

function isWord(value: unknown): value is ReplayWord {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    typeof value[0] === "number" &&
    typeof value[1] === "string" &&
    value.slice(2).every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function parseReplay(json: unknown, id: ReplayId): ReplayFile {
  if (typeof json !== "object" || json === null) throw new Error(`replay ${id}: no es un objeto`);
  const { fileName, pdfId, pageCount, pageWidths, words } = json as Record<string, unknown>;
  if (typeof fileName !== "string" || typeof pdfId !== "string" || typeof pageCount !== "number") throw new Error(`replay ${id}: faltan campos`);
  if (!Array.isArray(pageWidths) || !Array.isArray(words) || !words.every(isWord)) throw new Error(`replay ${id}: palabras o anchos inválidos`);
  return { fileName, pdfId, pageCount, pageWidths: pageWidths as ReplayFile["pageWidths"], words };
}

const toElement = ([page, text, x, y, width, height]: ReplayWord): PdfTextElement => ({ page, text, x, y, width, height });

/** Entrada del parser tal como la dejaría `visionToTextInput` con la respuesta real guardada. */
export function loadReplay(id: ReplayId): PdfTextInput {
  const file = parseReplay(JSON.parse(readFileSync(path.join(REPLAY_DIR, `${id}.json`), "utf8")), id);
  return {
    fileName: file.fileName,
    pdfId: file.pdfId,
    producer: null,
    readerVersion: "replay/vision-10-11",
    pageWidths: file.pageWidths,
    elements: file.words.map(toElement),
  };
}

export const REPLAY_FILES: readonly string[] = (["S1", "S2", "S3"] as const).map((id) => path.join(REPLAY_DIR, `${id}.json`));
