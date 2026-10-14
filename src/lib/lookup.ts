import { furniture, modules, pieceTypes } from "@/data/furniture.mock";
import { pieceMatchesInstance } from "@/data/mapping";
import type { Furniture, Module, PieceType } from "@/data/types";
import { componentCode, shortCode } from "@/model/ids";

export function getFurniture(): Furniture {
  return furniture;
}

export function listPieces(): readonly PieceType[] {
  return pieceTypes;
}

export function getPieceByQrId(qrId: string): PieceType | undefined {
  return pieceTypes.find((piece) => piece.qrId === qrId);
}

/** Búsqueda inversa: a qué tipo de pieza pertenece una instancia del 3D (coincidencia exacta de código). */
export function getPieceByInstanceId(instanceId: string): PieceType | undefined {
  return pieceTypes.find((piece) => pieceMatchesInstance(piece, instanceId));
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
      /** Tipos de pieza que pertenecen al módulo. */
      pieces: readonly PieceType[];
      /** Códigos de los componentes del módulo en el .dae. */
      componentCodes: readonly string[];
    }
  | { kind: "piece"; qrId: string; piece: PieceType };

export function resolveQr(qrId: string): QrTarget | undefined {
  if (qrId === furniture.qrId) return { kind: "furniture", qrId, furniture, modules };

  const mod = modules.find((m) => m.qrId === qrId);
  if (mod) {
    const pieces = pieceTypes.filter((piece) => piece.moduleId === mod.id);
    return { kind: "module", qrId, module: mod, pieces, componentCodes: pieces.map((piece) => piece.code) };
  }

  const piece = getPieceByQrId(qrId);
  return piece ? { kind: "piece", qrId, piece } : undefined;
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
  kind: QrKind;
  /** Texto corto grande: "C04", "Módulo", "Mueble". */
  code: string;
  title: string;
  subtitle: string;
}

/** Todos los QR del mueble: el mueble, sus módulos y cada tipo de pieza. */
export function listQrEntries(): QrEntry[] {
  return [
    { qrId: furniture.qrId, kind: "furniture", code: "Mueble", title: furniture.name, subtitle: "Mueble completo" },
    ...modules.map<QrEntry>((m) => ({ qrId: m.qrId, kind: "module", code: "Módulo", title: m.name, subtitle: furniture.name })),
    ...pieceTypes.map<QrEntry>((piece) => ({
      qrId: piece.qrId,
      kind: "piece",
      code: shortCode(piece.code),
      title: piece.name,
      subtitle: `${getModule(piece.moduleId)?.name ?? ""} · x${piece.quantity}`,
    })),
  ];
}
