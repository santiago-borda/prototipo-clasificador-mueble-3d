import { olmoDef } from "@/data/furniture.mock";
import { pieceMatchesInstance } from "@/data/mapping";
import { loadOptionalFurniture } from "@/data/optionalFurniture";
import { createRegistry } from "@/data/registry";
import type { FurnitureDef, PieceType } from "@/data/types";
import { componentCode, shortCode } from "@/model/ids";
import { getModule, targetFromDef, type QrKind, type QrTarget } from "./qrTarget";

export { getModule, targetFromDef, type QrKind, type QrTarget };

// Olmo siempre; los muebles opcionales (carpetas ignoradas por git) solo si están presentes.
const baseDefs: readonly FurnitureDef[] = [olmoDef, ...loadOptionalFurniture()];

// Fuente adicional: muebles importados (/importar), registrados solo en el navegador al abrir /prueba/<id>.
// En el servidor queda vacía, así que la generación estática de /p/<qrId> no cambia.
const importedDefs = new Map<string, FurnitureDef>(); // importId -> mueble
const importIdByFurniture = new Map<string, string>(); // furniture.id -> importId
let registry = createRegistry(baseDefs);

/**
 * Registra un mueble importado (sin modelUrl: el .dae lo sirve /api/importaciones/<id>/modelo). Es inocuo si ya
 * estaba registrado. Si sus qrId chocan con los existentes lanza Error y el registro queda como estaba.
 */
export function registerImportedFurniture(importId: string, imported: Omit<FurnitureDef, "modelUrl">): FurnitureDef {
  const existing = importedDefs.get(importId);
  if (existing) return existing;
  const def: FurnitureDef = { ...imported, modelUrl: `/api/importaciones/${importId}/modelo` };
  registry = createRegistry([...registry.defs, def]); // si lanza, `registry` no se toca
  importedDefs.set(importId, def);
  importIdByFurniture.set(def.furniture.id, importId);
  return def;
}

export function getImportedFurnitureDef(importId: string): FurnitureDef | undefined {
  return importedDefs.get(importId);
}

/** Todos los muebles registrados, incluidos los importados en esta sesión del navegador. */
export function listFurniture(): readonly FurnitureDef[] {
  return registry.defs;
}

/** Solo los muebles fijos de la app (Olmo y, en local, Sabrina): los que llevan QR impresos en /qr. */
export function listBaseFurniture(): readonly FurnitureDef[] {
  return baseDefs;
}

/** Link a la ficha de un qrId: /p/<qrId>, o /prueba/<importId>[/<qrId>] si el mueble es una importación. */
export function qrHref(qrId: string): string {
  const def = registry.findDefByQrId(qrId);
  const importId = def ? importIdByFurniture.get(def.furniture.id) : undefined;
  if (!def || !importId) return `/p/${qrId}`;
  return qrId === def.furniture.qrId ? `/prueba/${importId}` : `/prueba/${importId}/${qrId}`;
}

/** Mueble que se muestra cuando no hay un QR seleccionado. */
export function defaultFurnitureDef(): FurnitureDef {
  return registry.defs[0];
}

export function getFurnitureDef(furnitureId: string): FurnitureDef | undefined {
  return registry.getDef(furnitureId);
}

/** Mueble al que pertenece un qrId (de mueble, módulo o pieza). */
export function getFurnitureDefByQrId(qrId: string | null): FurnitureDef | undefined {
  return qrId ? registry.findDefByQrId(qrId) : undefined;
}

/** Búsqueda inversa: a qué tipo de pieza de ESE mueble pertenece una instancia del 3D (coincidencia exacta de código). */
export function getPieceByInstanceId(def: FurnitureDef, instanceId: string): PieceType | undefined {
  return def.pieceTypes.find((piece) => pieceMatchesInstance(piece, instanceId));
}

// --- Resolución de cualquier QR (mueble, módulo o pieza) -------------------------------------

// Registro estático: lo usan /, /qr, /escanear y /prueba (fuera de S2A). /p/<qrId> resuelve contra la base
// (`resolveQrTarget`, src/server/datos.ts; docs/spec-s2a-app-lee-base.md S2A-2).
export function resolveQr(qrId: string): QrTarget | undefined {
  const def = registry.findDefByQrId(qrId);
  return def ? targetFromDef(def, qrId) : undefined;
}

/** ¿Esta instancia del 3D hay que resaltarla para el QR dado? (El mueble completo no resalta nada.) */
export function isInstanceHot(target: QrTarget | undefined, instanceId: string): boolean {
  if (!target) return false;
  if (target.kind === "piece") return pieceMatchesInstance(target.piece, instanceId);
  if (target.kind === "module") {
    const code = componentCode(instanceId);
    return code !== null && target.componentCodes.includes(code);
  }
  return false;
}

export interface QrEntry {
  qrId: string;
  furnitureId: string;
  kind: QrKind;
  /** Texto corto grande: "C04", "Módulo", "Mueble". */
  code: string;
  title: string;
  subtitle: string;
}

/** Todos los QR de un mueble: el mueble, sus módulos y cada tipo de pieza. */
export function listQrEntriesOf(def: FurnitureDef): QrEntry[] {
  const { furniture, modules, pieceTypes } = def;
  return [
    { qrId: furniture.qrId, furnitureId: furniture.id, kind: "furniture", code: "Mueble", title: furniture.name, subtitle: "Mueble completo" },
    ...modules.map<QrEntry>((m) => ({ qrId: m.qrId, furnitureId: furniture.id, kind: "module", code: "Módulo", title: m.name, subtitle: furniture.name })),
    ...pieceTypes.map<QrEntry>((piece) => ({
      qrId: piece.qrId,
      furnitureId: furniture.id,
      kind: "piece",
      code: shortCode(piece.code),
      title: piece.name,
      subtitle: `${getModule(def, piece.moduleId)?.name ?? ""} · x${piece.quantity}`,
    })),
  ];
}

/** Todos los QR de los muebles fijos de la app (los importados no entran: no tienen etiquetas impresas). */
export function listQrEntries(): QrEntry[] {
  return baseDefs.flatMap(listQrEntriesOf);
}
