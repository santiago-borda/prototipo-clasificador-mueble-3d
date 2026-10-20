// Armado del FurnitureDef de una importación a partir de las filas del CSV (R3). Función pura.
// Convención ya asumida del prototipo: largo 1 = largo-A, largo 2 = largo-B, corto 1 = corto-A, corto 2 = corto-B
// (la aplica `readListing`). Los módulos salen de modulo_nro y modulo_nombre.

import type { EdgeBandSpec, Furniture, FurnitureDef, PieceType } from "@/data/types";
import { shortCode } from "@/model/ids";
import type { ListingRow } from "./listing";

/** Mueble importado: igual que `FurnitureDef` pero sin `modelUrl` (lo agrega quien registra la importación). */
export type ImportedFurnitureDef = Omit<FurnitureDef, "modelUrl">;

export interface BuildDefOptions {
  /** 16 caracteres hexadecimales. Los qrId y el id del mueble llevan sus primeros 8. */
  importId: string;
  /** Medidas generales (D9): salen de la caja del .dae, sin valor por defecto. */
  dimsMm: Furniture["dimsMm"];
}

export function importPrefix(importId: string): string {
  return `prueba-${importId.slice(0, 8)}`;
}

export function buildFurnitureDef(rows: readonly ListingRow[], { importId, dimsMm }: BuildDefOptions): ImportedFurnitureDef {
  const prefix = importPrefix(importId);
  // D10: el `mueble_id` del CSV ("olmo") chocaría con el Olmo real, así que el id y el nombre llevan el prefijo.
  const furnitureId = prefix;

  const firstBanded = rows.find((row) => row.edgeBanding)?.edgeBanding;
  const edgeBandSpec: EdgeBandSpec = firstBanded
    ? { type: "ABS", widthMm: firstBanded.widthMm, thicknessMm: firstBanded.thicknessMm, status: "provisorio" }
    : { type: "ABS", widthMm: 0, thicknessMm: 0, status: "provisorio", note: "el listado no trae piezas con canto" };

  const furniture: Furniture = {
    id: furnitureId,
    qrId: `${prefix}-mueble`,
    name: `${prefix} ${rows[0]?.mueble ?? ""}`.trim(),
    dimsMm,
    designVersion: "prueba",
    newerVersionAvailable: false,
    edgeBandSpec,
  };

  const moduleNames = new Map<number, string>();
  for (const row of rows) if (!moduleNames.has(row.moduloNro)) moduleNames.set(row.moduloNro, row.moduloNombre);
  const modules = [...moduleNames]
    .sort(([a], [b]) => a - b)
    .map(([nro, name]) => ({ id: `mod-${nro}`, qrId: `${prefix}-mod-${nro}`, furnitureId, name }));

  // qrId de pieza: `c<NN>`. Si dos códigos terminan igual (0001-01-M01-C04 y 0001-02-M02-C04), cada uno usa su
  // código completo para que los qrId no se repitan.
  const shortCounts = new Map<string, number>();
  for (const row of rows) shortCounts.set(shortCode(row.codigo), (shortCounts.get(shortCode(row.codigo)) ?? 0) + 1);
  const qrSuffix = (code: string) => ((shortCounts.get(shortCode(code)) ?? 0) > 1 ? code : shortCode(code)).toLowerCase();

  const pieceTypes: PieceType[] = rows.map((row) => ({
    qrId: `${prefix}-${qrSuffix(row.codigo)}`,
    code: row.codigo,
    name: row.nombrePieza,
    moduleId: `mod-${row.moduloNro}`,
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    thicknessMm: row.thicknessMm,
    material: row.material,
    quantity: row.quantity,
    edgeBanding: row.edgeBanding?.edges ?? [],
    notes: row.observaciones,
  }));

  return { furniture, modules, pieceTypes, toleranceMm: 2 };
}
