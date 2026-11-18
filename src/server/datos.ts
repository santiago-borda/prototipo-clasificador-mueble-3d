// S2A-1: raíz de composición de la persistencia (docs/spec-s2a-app-lee-base.md). Solo para el servidor: ningún
// módulo "use client" importa src/server/ (PB-13 enmendada; no se usa `server-only`, sería una dependencia nueva).
// Es el único lugar fuera de src/persistence/ y db/ que importa src/persistence/sql/.
//   - con DATABASE_URL: la implementación en SQL (la URL nunca se imprime: lleva la clave);
//   - sin ella: la de memoria, con la misma semilla del Olmo que `db:seed` (`seedOlmo`).
// S2A-2: `resolveQrTarget` resuelve un qrId de /p/<qrId> contra la base. Solo /p/<qrId> lee de la base.

import { targetFromDef, type QrTarget } from "@/lib/qrTarget";
import { createMemoryPersistence } from "@/persistence/memory";
import {
  BaseNoLocalError,
  CodigoRepetidoEnVersionError,
  DocumentoInvalidoError,
  MuebleInvalidoError,
  PersistenciaNoDisponibleError,
  QrDuplicadoError,
  ReferenciaDeOtroTenantError,
  TenantInexistenteError,
  TenantRequeridoError,
  VersionInmutableError,
  type Persistence,
} from "@/persistence/ports";
import { createSqlPersistence } from "@/persistence/sql";
import { createDb } from "@/persistence/sql/connection";
import { seedOlmo } from "../../db/seed";

// Una sola instancia por proceso. En globalThis para que la recarga de `next dev` no abra un pool nuevo por edición.
const SLOT = Symbol.for("pfg.s2a.persistence");
type Slot = { [SLOT]?: Promise<Persistence> };

async function openPersistence(): Promise<Persistence> {
  const url = process.env.DATABASE_URL;
  if (url) return createSqlPersistence(createDb(url));
  const memory = createMemoryPersistence();
  await seedOlmo(memory);
  return memory;
}

export function getPersistence(): Promise<Persistence> {
  const slot = globalThis as Slot;
  if (!slot[SLOT]) {
    const opening = openPersistence();
    // Si falla al abrir, el próximo pedido lo vuelve a intentar.
    opening.catch(() => {
      if (slot[SLOT] === opening) delete slot[SLOT];
    });
    slot[SLOT] = opening;
  }
  return slot[SLOT];
}

/** Cierra la persistencia abierta (si hay) y la olvida: el próximo pedido la vuelve a abrir con el entorno de ese momento. */
export async function closePersistence(): Promise<void> {
  const slot = globalThis as Slot;
  const current = slot[SLOT];
  delete slot[SLOT];
  if (current) await current.then((p) => p.close()).catch(() => {});
}

/** Las excepciones con nombre del contrato: son errores de datos o de uso, no de conexión. Se propagan tal cual. */
const CONTRATO = [
  TenantRequeridoError,
  TenantInexistenteError,
  CodigoRepetidoEnVersionError,
  QrDuplicadoError,
  VersionInmutableError,
  ReferenciaDeOtroTenantError,
  MuebleInvalidoError,
  DocumentoInvalidoError,
  BaseNoLocalError,
  PersistenciaNoDisponibleError,
];

/** Lo que se registra de la causa: nombre y código, sin el mensaje (podría traer datos de la conexión). */
function describeCause(cause: unknown): string {
  if (!(cause instanceof Error)) return "causa desconocida";
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? `${cause.name} ${code}` : cause.name;
}

/**
 * Destino de un qrId según la base, con la misma forma que `resolveQr`. undefined si no existe o si su versión
 * no está publicada (incluye `reemplazada`) o el QR está revocado: /p/<qrId> responde 404, como hoy (S2A-4).
 * Si la base no responde lanza `PersistenciaNoDisponibleError` y lo registra; nunca cae a los datos estáticos.
 */
export async function resolveQrTargetWith(persistence: Persistence, qrId: string): Promise<QrTarget | undefined> {
  try {
    const resolution = await persistence.qr.resolve(qrId);
    if (!resolution || resolution.status !== "publicada") return undefined;
    if (resolution.kind === "piece" && resolution.revoked) return undefined;

    const def = await persistence.furniture.getFurnitureDef(resolution.tenantId, resolution.designVersionId);
    if (!def) throw new DocumentoInvalidoError("design_version");
    const target = targetFromDef(def, qrId);
    // El qrId resolvió en la base pero no aparece en el mueble leído (o con otro nivel): dato inconsistente.
    if (!target || target.kind !== resolution.kind) throw new DocumentoInvalidoError("qr_code");
    return target;
  } catch (error) {
    if (CONTRATO.some((type) => error instanceof type)) throw error;
    const unavailable = new PersistenciaNoDisponibleError({ cause: error });
    console.error(`${unavailable.name}: ${unavailable.message} (${describeCause(error)}; qrId ${qrId})`);
    throw unavailable;
  }
}

export async function resolveQrTarget(qrId: string): Promise<QrTarget | undefined> {
  let persistence: Persistence;
  try {
    persistence = await getPersistence();
  } catch (error) {
    const unavailable = new PersistenciaNoDisponibleError({ cause: error });
    console.error(`${unavailable.name}: ${unavailable.message} (${describeCause(error)}; al abrir la persistencia)`);
    throw unavailable;
  }
  return resolveQrTargetWith(persistence, qrId);
}
