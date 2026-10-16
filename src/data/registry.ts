// Registro de muebles. Función pura: sin React ni three.
//
// Por qué existe: los códigos de pieza solo son únicos DENTRO de un mueble. Olmo y Sabrina comparten
// `0001-01-M01-C01..C15`, así que una búsqueda global por código ligaría piezas de Sabrina a fichas de Olmo.
// Solución: todo vive bajo un `FurnitureDef`; la asociación instancia -> tipo de pieza se hace dentro del
// mueble del QR que se está viendo, y los qrId (que llevan prefijo de mueble: `olmo-c04`, `sabrina-c11`)
// son únicos entre todos los muebles registrados.

import type { FurnitureDef } from "./types";

export interface Registry {
  readonly defs: readonly FurnitureDef[];
  /** Mueble por id. */
  getDef(furnitureId: string): FurnitureDef | undefined;
  /** Mueble al que pertenece un qrId (de mueble, módulo o pieza). */
  findDefByQrId(qrId: string): FurnitureDef | undefined;
}

/**
 * Arma el registro. Lanza Error si hay ids de mueble o qrId repetidos (aserción de arranque: un qrId
 * repetido haría que una etiqueta impresa abra la ficha equivocada), o si un tipo de pieza apunta a un
 * módulo que no existe.
 */
export function createRegistry(defs: readonly FurnitureDef[]): Registry {
  if (defs.length === 0) throw new Error("El registro necesita al menos un mueble.");

  const furnitureIds = new Set<string>();
  const qrOwner = new Map<string, FurnitureDef>();

  const claimQr = (qrId: string, def: FurnitureDef) => {
    const owner = qrOwner.get(qrId);
    if (owner) {
      throw new Error(`El qrId "${qrId}" está repetido (muebles "${owner.furniture.id}" y "${def.furniture.id}").`);
    }
    qrOwner.set(qrId, def);
  };

  for (const def of defs) {
    const id = def.furniture.id;
    if (furnitureIds.has(id)) throw new Error(`El mueble "${id}" está registrado dos veces.`);
    furnitureIds.add(id);

    claimQr(def.furniture.qrId, def);
    for (const mod of def.modules) claimQr(mod.qrId, def);

    const moduleIds = new Set(def.modules.map((mod) => mod.id));
    for (const piece of def.pieceTypes) {
      if (!moduleIds.has(piece.moduleId)) {
        throw new Error(`${id}: la pieza ${piece.code} apunta al módulo "${piece.moduleId}", que no existe.`);
      }
      claimQr(piece.qrId, def);
    }
  }

  return {
    defs,
    getDef: (furnitureId) => defs.find((def) => def.furniture.id === furnitureId),
    findDefByQrId: (qrId) => qrOwner.get(qrId),
  };
}
