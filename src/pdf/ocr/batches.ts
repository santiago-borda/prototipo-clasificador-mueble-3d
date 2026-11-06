// Reparto de las páginas de un PDF en pedidos al OCR (docs/spec-extraccion-pdf.md §8). Función pura.
// El tamaño es un parámetro: depende del proveedor y de cómo se manden las páginas (PDF inline o imágenes, P-12).
// Cloud Vision `files:annotate` síncrono acepta hasta 5 páginas por pedido.

/** Páginas 1..pageCount en lotes consecutivos de a lo sumo `batchSize`, en orden. */
export function pageBatches(pageCount: number, batchSize: number): number[][] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new RangeError(`Cantidad de páginas inválida: ${pageCount}.`);
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError(`Tamaño de lote inválido: ${batchSize}.`);
  const batches: number[][] = [];
  for (let first = 1; first <= pageCount; first += batchSize) {
    const last = Math.min(first + batchSize - 1, pageCount);
    batches.push(Array.from({ length: last - first + 1 }, (_, i) => first + i));
  }
  return batches;
}
