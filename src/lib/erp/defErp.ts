// IE-5: mueble que muestra el visor embebido, armado en el navegador a partir del .dae del zip que el ERP envió
// (POST /api/trabajos) y que este sistema guardó (IE-10).
// Función pura (lee solo `geometry.boundingBox`, sin three ni React). Desde el importador del CSV
// (docs/spec-importador-csv-envio.md IC-8), el visor usa `defDesdeListadoErp` si el trabajo tiene listado; esta
// función queda para los trabajos sin listado.
//
// No se usa la lista de piezas del ERP (pierde los componentes dentro de grupos; relevamiento del 16/11): los tipos
// de pieza salen del .dae con el mismo cargador del visor. Todo lo que el .dae no trae es **ASUMIDO**:
//   - nombre «Pieza C04» (último segmento del código, como en los menús);
//   - medidas: caja de la geometría de la primera instancia, de mayor a menor (largo, ancho, espesor), en mm con
//     un decimal; en una pieza girada fuera de los ejes la caja es más grande que la pieza;
//   - material: el primer material del .dae que cubre la pieza; canteado sin dato (`null`, «Canto: pendiente»);
//   - un solo módulo («Modelo del ERP»): el ERP no tiene nivel de módulo.
// Los qrId llevan el prefijo `erp-<clave>-` y no se imprimen: son solo para navegar dentro del iframe.

import { checkAssociation } from "@/data/mapping";
import type { FurnitureDef, Module, PieceType } from "@/data/types";
import type { PiezaDelListado } from "@/lib/csv-ocl/envio";
import { measureDimsMm } from "@/importer/dims";
import { componentCode, shortCode } from "@/model/ids";
import type { FurnitureModel, FurniturePart } from "@/model/types";
import { verifyModel } from "@/model/verifyModel";

export type ErpFurnitureDef = Omit<FurnitureDef, "modelUrl">;

/**
 * Clave del mueble en el registro del navegador: los primeros 12 caracteres hexadecimales del UUID del trabajo (un
 * trabajo = un modelo guardado). Corta para que los qrId no sean larguísimos; dentro de un navegador no choca.
 */
export function claveErp(trabajoUuid: string): string {
  return trabajoUuid.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
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
  opciones: { trabajoUuid: string; nombre: string },
): ErpFurnitureDef {
  const clave = claveErp(opciones.trabajoUuid);
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

// --- IC-8 e IC-9 (docs/spec-importador-csv-envio.md): el mueble sale del listado del CSV ---

/** Lo que sirve GET /api/erp/proyectos/{uuid}/listado (IC-6). */
export interface ListadoErp {
  trabajoUuid: string;
  listadoId: string;
  piezas: PiezaDelListado[];
  tipos: number;
  piezasTotales: number;
  metrosCanto: number;
  avisos: { fila: number; columna: string; mensaje: string }[];
}

/** "0,2 mm" → 0.2; otra cosa → 0 (el espesor del CSV es solo informativo). */
function espesorDeTexto(texto: string | null): number {
  const m = /^(\d+(?:,\d+)?) mm$/.exec(texto ?? "");
  return m ? Number(m[1].replace(",", ".")) : 0;
}

/**
 * IC-8: un tipo de pieza por fila del listado, con nombre, medidas finales, material, cantidad y canteado del CSV.
 * `qrId` igual que `defDesdeModeloErp`. Un nombre vacío en el CSV se muestra como «Pieza C04» (ASUMIDO, como hoy).
 */
export function defDesdeListadoErp(
  model: FurnitureModel,
  listado: Pick<ListadoErp, "piezas">,
  opciones: { trabajoUuid: string; nombre: string },
): ErpFurnitureDef {
  const clave = claveErp(opciones.trabajoUuid);
  const prefijo = `erp-${clave}`;
  const furnitureId = prefijo;
  const modulo: Module = { id: "mod-erp", qrId: `${prefijo}-modulo`, furnitureId, name: "Modelo del ERP" };

  const piezas = [...listado.piezas].sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
  const cortos = new Map<string, number>();
  for (const p of piezas) cortos.set(shortCode(p.codigo), (cortos.get(shortCode(p.codigo)) ?? 0) + 1);
  const sufijo = (code: string) => ((cortos.get(shortCode(code)) ?? 0) > 1 ? code : shortCode(code)).toLowerCase();

  const pieceTypes: PieceType[] = piezas.map((p) => ({
    qrId: `${prefijo}-${sufijo(p.codigo)}`,
    code: p.codigo,
    name: p.nombre !== "" ? p.nombre : `Pieza ${shortCode(p.codigo)}`,
    moduleId: modulo.id,
    lengthMm: p.largoMm,
    widthMm: p.anchoMm,
    thicknessMm: p.espesorMm,
    material: p.material,
    quantity: p.cantidad,
    edgeBanding: [...p.canteado],
    notes: null,
  }));

  const canto = piezas.find((p) => p.canto)?.canto ?? null;
  return {
    furniture: {
      id: furnitureId,
      qrId: `${prefijo}-mueble`,
      name: opciones.nombre,
      dimsMm: measureDimsMm(model.parts),
      designVersion: "ERP",
      newerVersionAvailable: false,
      edgeBandSpec: canto
        ? { type: "ABS", widthMm: canto.anchoMm ?? 0, thicknessMm: espesorDeTexto(canto.espesorTexto), status: "provisorio", note: "del CSV de OpenCutList, que redondea el espesor a un decimal" }
        : { type: "ABS", widthMm: 0, thicknessMm: 0, status: "provisorio", note: "el listado no trae piezas con canto" },
    },
    modules: [modulo],
    pieceTypes,
    toleranceMm: 2,
  };
}

export interface CruceErp {
  /** Sin diferencias entre el listado y el modelo 3D. */
  coincide: boolean;
  /** Texto de cada diferencia (cantidades, medidas, instancias sin tipo de pieza). */
  diferencias: string[];
}

/**
 * IC-9: cruce del listado con el .dae, con las funciones de /importar: `verifyModel` (cantidades y medidas con la
 * tolerancia del mueble) y `checkAssociation` (instancias que ningún tipo reclama o que reclaman varios). No cambia
 * el estado del trabajo.
 */
export function cruceErp(model: FurnitureModel, def: Pick<ErpFurnitureDef, "pieceTypes" | "toleranceMm">): CruceErp {
  const verificacion = verifyModel(model.parts, def.pieceTypes, { toleranceMm: def.toleranceMm });
  const asociacion = checkAssociation(
    model.parts.map((p) => p.instanceId),
    def.pieceTypes,
  );
  const diferencias = [
    ...verificacion.warnings,
    ...asociacion.orphans.map((id) => `${id}: la pieza del modelo 3D no está en el listado del CSV.`),
    ...asociacion.ambiguous.map((id) => `${id}: la pieza del modelo 3D coincide con más de una fila del listado.`),
  ];
  return { coincide: diferencias.length === 0, diferencias };
}
