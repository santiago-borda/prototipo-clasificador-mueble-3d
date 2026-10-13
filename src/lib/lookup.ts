import { furniture, modules, pieceTypes } from "@/data/furniture.mock";
import { moduleExtraComponents, pieceInstanceMapping } from "@/data/mapping";
import type { Furniture, Module, ResolvedPieceType } from "@/data/types";
import { componentCode } from "@/model/ids";

const resolved: readonly ResolvedPieceType[] = pieceTypes.map((piece) => ({
  ...piece,
  instanceIds: pieceInstanceMapping[piece.code] ?? [],
}));

export function getFurniture(): Furniture {
  return furniture;
}

export function listPieces(): readonly ResolvedPieceType[] {
  return resolved;
}

export function getPieceByQrId(qrId: string): ResolvedPieceType | undefined {
  return resolved.find((piece) => piece.qrId === qrId);
}

/** Búsqueda inversa: a qué tipo de pieza pertenece una instancia del 3D. */
export function getPieceByInstanceId(instanceId: string): ResolvedPieceType | undefined {
  return resolved.find((piece) => piece.instanceIds.includes(instanceId));
}

export function getModule(moduleId: string): Module | undefined {
  return modules.find((m) => m.id === moduleId);
}

export function listModules(): readonly Module[] {
  return modules;
}

// --- Resolución de cualquier QR (mueble, módulo o pieza) -------------------------------------

export type QrKind = "furniture" | "module" | "piece";

export type QrTarget =
  | { kind: "furniture"; qrId: string; furniture: Furniture; modules: readonly Module[] }
  | {
      kind: "module";
      qrId: string;
      module: Module;
      /** Tipos de pieza con ficha que pertenecen al módulo. */
      pieces: readonly ResolvedPieceType[];
      /** Códigos de todos los componentes del módulo en el .dae (con y sin ficha). */
      componentCodes: readonly string[];
      /** Códigos que están en el .dae pero todavía no tienen ficha. */
      codesWithoutSheet: readonly string[];
    }
  | { kind: "piece"; qrId: string; piece: ResolvedPieceType };

export function resolveQr(qrId: string): QrTarget | undefined {
  if (qrId === furniture.qrId) return { kind: "furniture", qrId, furniture, modules };

  const mod = modules.find((m) => m.qrId === qrId);
  if (mod) {
    const pieces = resolved.filter((piece) => piece.moduleId === mod.id);
    const withoutSheet = moduleExtraComponents[mod.id] ?? [];
    return {
      kind: "module",
      qrId,
      module: mod,
      pieces,
      componentCodes: [...pieces.map((piece) => piece.code), ...withoutSheet],
      codesWithoutSheet: withoutSheet,
    };
  }

  const piece = getPieceByQrId(qrId);
  return piece ? { kind: "piece", qrId, piece } : undefined;
}

/** ¿Esta instancia del 3D hay que resaltarla para el QR dado? (El mueble completo no resalta nada.) */
export function isInstanceHot(target: QrTarget | undefined, instanceId: string): boolean {
  if (!target) return false;
  if (target.kind === "piece") return target.piece.instanceIds.includes(instanceId);
  if (target.kind === "module") {
    const code = componentCode(instanceId);
    return code !== null && target.componentCodes.includes(code);
  }
  return false;
}

export interface QrEntry {
  qrId: string;
  kind: QrKind;
  /** Texto corto grande: "_04", "Módulo", "Mueble". */
  code: string;
  title: string;
  subtitle: string;
}

/** Todos los QR del mueble: el mueble, sus módulos y cada tipo de pieza. */
export function listQrEntries(): QrEntry[] {
  return [
    { qrId: furniture.qrId, kind: "furniture", code: "Mueble", title: furniture.name, subtitle: "Mueble completo" },
    ...modules.map<QrEntry>((m) => ({ qrId: m.qrId, kind: "module", code: "Módulo", title: m.name, subtitle: furniture.name })),
    ...resolved.map<QrEntry>((piece) => ({
      qrId: piece.qrId,
      kind: "piece",
      code: piece.code,
      title: piece.name,
      subtitle: `${getModule(piece.moduleId)?.name ?? ""} · x${piece.quantity}`,
    })),
  ];
}
