// S2: datos semilla. Carga el primer fixture (Escritorio Olmo: 21 tipos de pieza, 33 piezas físicas) desde lo que ya
// está en el repo (`olmoDef` y el .dae público), en la carpintería de desarrollo (S2-D9). El segundo fixture queda local.
// Usa solo los repositorios: sirve igual contra memoria y contra SQL. Correrlo dos veces no duplica nada.

import { readFileSync } from "node:fs";
import path from "node:path";
import { olmoDef } from "@/data/furniture.mock";
import { modelId } from "@/engine/hash";
import type { Persistence } from "@/persistence/ports";

/** Carpintería fija de desarrollo: no hay carpinterías reales hasta S4. */
export const DEV_TENANT = { id: "desarrollo", name: "Desarrollo" } as const;
const SEED_AUTHOR = "seed";

export interface SeedResult {
  tenantId: string;
  designVersionId: string;
  /** false si el mueble ya estaba cargado y no se tocó nada. */
  created: boolean;
  pieceTypes: number;
  physicalPieces: number;
}

function olmoModelId(): string {
  const file = path.join(process.cwd(), "public", olmoDef.modelUrl);
  return modelId(readFileSync(file));
}

export async function seedOlmo(p: Persistence): Promise<SeedResult> {
  const tenant = (await p.tenants.get(DEV_TENANT.id)) ?? (await p.tenants.create(DEV_TENANT));
  const counts = {
    pieceTypes: olmoDef.pieceTypes.length,
    physicalPieces: olmoDef.pieceTypes.reduce((n, piece) => n + piece.quantity, 0),
  };

  const existing = await p.qr.resolve(olmoDef.furniture.qrId);
  if (existing) {
    if (existing.tenantId !== tenant.id) throw new Error("El primer fixture ya está cargado en otra carpintería.");
    return { tenantId: tenant.id, designVersionId: existing.designVersionId, created: false, ...counts };
  }

  const ref = await p.furniture.saveDesignVersion(tenant.id, { def: olmoDef, modelId: olmoModelId(), createdBy: SEED_AUTHOR });
  // Se publica para que el qrId de mueble resuelva (S2-I8). Es un dato de desarrollo, no una publicación a operarios.
  await p.furniture.publish(tenant.id, ref.designVersionId, SEED_AUTHOR);
  return { tenantId: tenant.id, designVersionId: ref.designVersionId, created: true, ...counts };
}
