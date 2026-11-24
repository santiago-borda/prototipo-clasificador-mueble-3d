// A qué apunta un qrId dentro de UN mueble. Función pura sobre el `FurnitureDef`, sin registro ni datos estáticos:
// la usan `resolveQr` (registro estático, `lookup.ts`), `resolveQrTarget` (la base, `src/server/datos.ts`, S2A-2)
// y el visor en /p/* (S2A-3), para que el objeto que recibe la ficha tenga siempre la misma forma.

import type { Furniture, FurnitureDef, Module, PieceType } from "@/data/types";

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

export function getModule(def: FurnitureDef, moduleId: string): Module | undefined {
  return def.modules.find((m) => m.id === moduleId);
}

/** El destino de `qrId` en ese mueble (mueble, módulo o pieza); undefined si el qrId no es de ese mueble. */
export function targetFromDef(def: FurnitureDef, qrId: string): QrTarget | undefined {
  if (qrId === def.furniture.qrId) return { kind: "furniture", qrId, def, furniture: def.furniture, modules: def.modules };

  const mod = def.modules.find((m) => m.qrId === qrId);
  if (mod) {
    const pieces = def.pieceTypes.filter((piece) => piece.moduleId === mod.id);
    return { kind: "module", qrId, def, module: mod, pieces, componentCodes: pieces.map((piece) => piece.code) };
  }

  const piece = def.pieceTypes.find((p) => p.qrId === qrId);
  return piece ? { kind: "piece", qrId, def, piece, module: getModule(def, piece.moduleId) } : undefined;
}
