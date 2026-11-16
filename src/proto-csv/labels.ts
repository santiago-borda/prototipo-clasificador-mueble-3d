// Vista previa de QR y etiquetas del "Publicar" simulado (docs/spec-proto-csv-ocl.md §4.3). Función pura.
// Los QR van SOLO como texto de URL: no se genera ninguna imagen escaneable (dominio de producción sin definir,
// consulta 59). El dominio es una constante de prueba que no se usa para desplegar ni sale de NEXT_PUBLIC_BASE_URL.

import { shortCode } from "@/model/ids";
import type { CsvPiece } from "./parse";

export const QR_TEST_BASE = "https://taller-test.casamueble.com.ar/q/";
export const PREVIEW_MARK = "VISTA PREVIA — NO SE IMPRIME";

const SIDE_LABEL: Record<"s1" | "s2" | "s3" | "s4", string> = { s1: "inferior", s2: "superior", s3: "izquierdo", s4: "derecho" };

export interface LabelPreview {
  /** "C01 · 1/2". */
  title: string;
  code: string;
  /** "700 × 400 × 18 mm" (L × A × espesor, finales, en el orden del CSV). */
  dims: string;
  material: string;
  /** "Canto: superior, izquierdo" o "Sin canto". */
  edges: string;
  qrUrlText: string;
  /** Siempre `PREVIEW_MARK`. */
  mark: string;
}

export interface QrPreview {
  code: string;
  qrId: string;
  /** Texto de la URL (no se codifica en ninguna imagen). */
  qrUrlText: string;
  labels: LabelPreview[];
}

const mm = (n: number) => String(n).replace(".", ",");

/** Un QR (texto) por tipo de pieza y N etiquetas por tipo según su cantidad. `id8`: los 8 primeros hex de la carga. */
export function qrPreview(id8: string, pieces: readonly CsvPiece[]): QrPreview[] {
  return [...pieces]
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((piece) => {
      const short = shortCode(piece.code);
      const qrId = `${id8}-${short.toLowerCase()}`;
      const qrUrlText = `${QR_TEST_BASE}${qrId}`;
      const sides = (["s2", "s1", "s3", "s4"] as const).filter((s) => piece.strips[s] !== null).map((s) => SIDE_LABEL[s]);
      const labels = Array.from({ length: piece.quantity }, (_, i) => ({
        title: `${short} · ${i + 1}/${piece.quantity}`,
        code: piece.code,
        dims: `${mm(piece.lengthMm)} × ${mm(piece.widthMm)} × ${mm(piece.thicknessMm)} mm`,
        material: piece.material,
        edges: sides.length === 0 ? "Sin canto" : `Canto: ${sides.join(", ")}`,
        qrUrlText,
        mark: PREVIEW_MARK,
      }));
      return { code: piece.code, qrId, qrUrlText, labels };
    });
}
