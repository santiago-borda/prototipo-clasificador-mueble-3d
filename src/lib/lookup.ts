import { olmoDef } from "@/data/furniture.mock";
import { pieceMatchesInstance } from "@/data/mapping";
import { loadOptionalFurniture } from "@/data/optionalFurniture";
import { createRegistry } from "@/data/registry";
import type { Furniture, FurnitureDef, Module, PieceType } from "@/data/types";
import { componentCode, shortCode } from "@/model/ids";

// Olmo siempre; los muebles opcionales (carpetas ignoradas por git) solo si están presentes.
const registry = createRegistry([olmoDef, ...loadOptionalFurniture()]);

export function listFurniture(): readonly FurnitureDef[] {
  return registry.defs;
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

export function getModule(def: FurnitureDef, moduleId: string): Module | undefined {
  return def.modules.find((m) => m.id === moduleId);
}

// --- Resolución de cualquier QR (mueble, módulo o pieza) -------------------------------------

export type QrKind = "furniture" | "module" | "piece";

export type QrTarget =
  | { kind: "furniture"; qrId: string; def: FurnitureDef; furniture: Furniture; modules: readonly Module[] }
  | {
      kind: "module";
      qrId: string;
      def: FurnitureDef;
      module: Module;
      /** Tipos de pieza que pertenecen al módulo. */
      pieces: readonly PieceType[];
      /** Códigos de los componentes del módulo en el .dae. */
      componentCodes: readonly string[];
    }
  | { kind: "piece"; qrId: string; def: FurnitureDef; piece: PieceType; module: Module | undefined };

export function resolveQr(qrId: string): QrTarget | undefined {
  const def = registry.findDefByQrId(qrId);
  if (!def) return undefined;

  if (qrId === def.furniture.qrId) return { kind: "furniture", qrId, def, furniture: def.furniture, modules: def.modules };

  const mod = def.modules.find((m) => m.qrId === qrId);
  if (mod) {
    const pieces = def.pieceTypes.filter((piece) => piece.moduleId === mod.id);
    return { kind: "module", qrId, def, module: mod, pieces, componentCodes: pieces.map((piece) => piece.code) };
  }

  const piece = def.pieceTypes.find((p) => p.qrId === qrId);
  return piece ? { kind: "piece", qrId, def, piece, module: getModule(def, piece.moduleId) } : undefined;
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

/** Todos los QR de todos los muebles registrados. */
export function listQrEntries(): QrEntry[] {
  return registry.defs.flatMap(listQrEntriesOf);
}
