// IE-7 / IE-8: mueble que muestra el visor embebido, armado en el navegador a partir del .dae del zip del ERP.
// Función pura (lee solo `geometry.boundingBox`, sin three ni React).
//
// No se usa la lista de piezas del ERP (pierde los componentes dentro de grupos; relevamiento del 16/11): los tipos
// de pieza salen del .dae con el mismo cargador del visor. Todo lo que el .dae no trae es **ASUMIDO**:
//   - nombre «Pieza C04» (último segmento del código, como en los menús);
//   - medidas: caja de la geometría de la primera instancia, de mayor a menor (largo, ancho, espesor), en mm con
//     un decimal; en una pieza girada fuera de los ejes la caja es más grande que la pieza;
//   - material: el primer material del .dae que cubre la pieza; canteado sin dato (`null`, «Canto: pendiente»);
//   - un solo módulo («Modelo del ERP»): el ERP no tiene nivel de módulo.
// Los qrId llevan el prefijo `erp-<clave>-` y no se imprimen: son solo para navegar dentro del iframe.

import type { FurnitureDef, Module, PieceType } from "@/data/types";
import { measureDimsMm } from "@/importer/dims";
import { componentCode, shortCode } from "@/model/ids";
import type { FurnitureModel, FurniturePart } from "@/model/types";

export type ErpFurnitureDef = Omit<FurnitureDef, "modelUrl">;

/** Clave del mueble en el registro del navegador: proyecto y Documento, en minúsculas y sin símbolos raros. */
export function claveErp(erpProyectoId: string, documentoId: string): string {
  return `${erpProyectoId}-${documentoId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function medidasMm(part: FurniturePart): [number, number, number] {
  const box = part.geometry.boundingBox;
  if (!box) return [0, 0, 0];
  const mm = (v: number) => Math.round(v * 10000) / 10; // metros -> mm, un decimal
  const lados = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map(mm).sort((a, b) => b - a);
  return [lados[0], lados[1], lados[2]];
}

export function defDesdeModeloErp(
  model: FurnitureModel,
  opciones: { erpProyectoId: string; documentoId: string; nombre: string },
): ErpFurnitureDef {
  const clave = claveErp(opciones.erpProyectoId, opciones.documentoId);
  const prefijo = `erp-${clave}`;
  const furnitureId = prefijo;
  const modulo: Module = { id: "mod-erp", qrId: `${prefijo}-modulo`, furnitureId, name: "Modelo del ERP" };

  const porCodigo = new Map<string, FurniturePart[]>();
  for (const part of model.parts) {
    const code = componentCode(part.instanceId);
    if (!code) continue;
    const lista = porCodigo.get(code);
    if (lista) lista.push(part);
    else porCodigo.set(code, [part]);
  }
  const codigos = [...porCodigo.keys()].sort();

  // Como en el importador: si dos códigos terminan igual, el qrId usa el código completo.
  const cortos = new Map<string, number>();
  for (const code of codigos) cortos.set(shortCode(code), (cortos.get(shortCode(code)) ?? 0) + 1);
  const sufijo = (code: string) => ((cortos.get(shortCode(code)) ?? 0) > 1 ? code : shortCode(code)).toLowerCase();

  const pieceTypes: PieceType[] = codigos.map((code) => {
    const partes = porCodigo.get(code)!;
    const [lengthMm, widthMm, thicknessMm] = medidasMm(partes[0]);
    return {
      qrId: `${prefijo}-${sufijo(code)}`,
      code,
      name: `Pieza ${shortCode(code)}`,
      moduleId: modulo.id,
      lengthMm,
      widthMm,
      thicknessMm,
      material: partes[0].surfaces[0]?.material ?? "Sin dato",
      quantity: partes.length,
      edgeBanding: null,
      notes: null,
    };
  });

  return {
    furniture: {
      id: furnitureId,
      qrId: `${prefijo}-mueble`,
      name: opciones.nombre,
      dimsMm: measureDimsMm(model.parts),
      designVersion: "ERP",
      newerVersionAvailable: false,
      edgeBandSpec: { type: "ABS", widthMm: 0, thicknessMm: 0, status: "provisorio", note: "el ERP no informa el canto" },
    },
    modules: [modulo],
    pieceTypes,
    toleranceMm: 2,
  };
}
