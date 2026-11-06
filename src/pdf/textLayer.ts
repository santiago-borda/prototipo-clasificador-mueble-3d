// ¿El PDF tiene capa de texto? (docs/spec-esquema-pdf.md §8.2: sin `/Font` → `sin-capa-de-texto`, sin caer a OCR).
// Pura y sin librerías de PDF: busca recursos de fuente en el texto sin comprimir del archivo. No extrae texto
// (eso sigue PENDIENTE, consulta 58). Con object streams comprimidos (`/ObjStm`) no puede ver los diccionarios.

export type TextLayerProbe = "sin-capa-de-texto" | "con-fuentes" | "desconocido";

export function probeTextLayer(pdf: Uint8Array): TextLayerProbe {
  let raw = "";
  for (let i = 0; i < pdf.length; i += 1) raw += String.fromCharCode(pdf[i]);
  if (!raw.startsWith("%PDF-")) return "desconocido";
  if (/\/Font\b/.test(raw)) return "con-fuentes";
  if (/\/ObjStm\b/.test(raw)) return "desconocido";
  return "sin-capa-de-texto";
}
