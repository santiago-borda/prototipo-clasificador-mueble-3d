// Lista blanca local de `ocr:real` (docs/spec-ocr-prueba-real.md §5). Pura: recibe el TEXTO del archivo.
// Un sha256 por línea (con o sin "sha256:"), `#` comenta, líneas vacías se ignoran, minúsculas, BOM ignorado.
// El hash del PDF real vive solo en el archivo del usuario, fuera del repo: nunca acá.

export type WhitelistRejection = "lista-blanca-ausente" | "lista-blanca-vacia" | "lista-blanca-invalida" | "lista-blanca-multiple";

export type WhitelistResult = { ok: true; pdfId: string } | { ok: false; reason: WhitelistRejection };

const SHA256 = /^[0-9a-f]{64}$/;

/** `text` = contenido del archivo, o `null`/`undefined` si no existe. Fail-closed; este script es de un solo PDF. */
export function parseWhitelist(text: string | null | undefined): WhitelistResult {
  if (text === null || text === undefined) return { ok: false, reason: "lista-blanca-ausente" };
  const entries = new Set<string>();
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const hex = line.toLowerCase().replace(/^sha256:/, "");
    if (!SHA256.test(hex)) return { ok: false, reason: "lista-blanca-invalida" };
    entries.add(hex);
  }
  if (entries.size === 0) return { ok: false, reason: "lista-blanca-vacia" };
  if (entries.size > 1) return { ok: false, reason: "lista-blanca-multiple" };
  return { ok: true, pdfId: `sha256:${[...entries][0]}` };
}
