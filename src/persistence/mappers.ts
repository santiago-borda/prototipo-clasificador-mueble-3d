// S2: fila <-> tipo del dominio. Funciones puras, sin kysely, pg ni next (B9).
// Las usan las dos implementaciones, así que lo que se guarda y lo que se lee es lo mismo en memoria y en SQL.

import type { EdgeBandSpec, EdgeId, FurnitureDef, Module, PieceType } from "@/data/types";
import type { AssociationRun } from "@/engine/types";
import {
  CodigoRepetidoEnVersionError,
  DESIGN_VERSION_STATUSES,
  DocumentoInvalidoError,
  MuebleInvalidoError,
  QrDuplicadoError,
  type DesignVersionStatus,
  type NewDesignVersion,
} from "./ports";
import type { DesignVersionRow, EngineRunRow, FurnitureRow, ModuleRow, PieceTypeRow, QrCodeRow } from "./rows";

const EDGE_IDS: readonly EdgeId[] = ["largo-A", "largo-B", "corto-A", "corto-B"];
const EDGE_BAND_STATUSES: readonly EdgeBandSpec["status"][] = ["provisorio", "confirmado"];

// --- Validación de lo que entra -------------------------------------------------------------------

/**
 * Aserciones sobre el mueble antes de tocar la base: módulos y códigos únicos, cada pieza en un módulo que existe
 * y qrId sin repetir dentro del mueble. Los qrId contra el resto de la base los comprueba cada implementación.
 */
export function assertDefValido(def: FurnitureDef): void {
  const moduleIds = new Set<string>();
  for (const mod of def.modules) {
    if (moduleIds.has(mod.id)) throw new MuebleInvalidoError(`el módulo "${mod.id}" está repetido`);
    if (mod.furnitureId !== def.furniture.id) throw new MuebleInvalidoError(`el módulo "${mod.id}" es de otro mueble`);
    moduleIds.add(mod.id);
  }
  const codes = new Set<string>();
  for (const piece of def.pieceTypes) {
    if (codes.has(piece.code)) throw new CodigoRepetidoEnVersionError(piece.code);
    codes.add(piece.code);
    if (!moduleIds.has(piece.moduleId)) {
      throw new MuebleInvalidoError(`la pieza ${piece.code} apunta al módulo "${piece.moduleId}", que no existe`);
    }
  }
  const qrIds = new Set<string>();
  for (const qrId of qrIdsOf(def)) {
    if (qrIds.has(qrId)) throw new QrDuplicadoError(qrId);
    qrIds.add(qrId);
  }
}

/** Todos los qrId de un mueble, en orden: mueble, módulos, piezas. */
export function qrIdsOf(def: FurnitureDef): string[] {
  return [def.furniture.qrId, ...def.modules.map((m) => m.qrId), ...def.pieceTypes.map((p) => p.qrId)];
}

// --- Dominio -> filas ----------------------------------------------------------------------------

export function encodeEdgeBanding(edgeBanding: PieceType["edgeBanding"]): string | null {
  return edgeBanding === null ? null : JSON.stringify(edgeBanding);
}

export interface VersionRowsInput {
  tenantId: string;
  furnitureId: string;
  designVersionId: string;
  publicId: string;
  number: number;
  input: NewDesignVersion;
  newId: () => string;
  now: Date;
}

export interface VersionRows {
  version: DesignVersionRow;
  modules: ModuleRow[];
  pieces: PieceTypeRow[];
  qrs: QrCodeRow[];
}

/** Filas de una versión nueva. Supone `assertDefValido(input.def)`. */
export function toVersionRows(args: VersionRowsInput): VersionRows {
  const { tenantId, designVersionId, input, newId, now } = args;
  const { furniture, modules, pieceTypes } = input.def;
  const spec = furniture.edgeBandSpec;

  const version: DesignVersionRow = {
    tenant_id: tenantId,
    id: designVersionId,
    public_id: args.publicId,
    furniture_id: args.furnitureId,
    number: args.number,
    status: "borrador" satisfies DesignVersionStatus,
    label: furniture.designVersion,
    name: furniture.name,
    model_id: input.modelId,
    model_file_id: null,
    model_url: input.def.modelUrl,
    texture_base_url: input.def.textureBaseUrl ?? null,
    dim_x_mm: furniture.dimsMm.x,
    dim_y_mm: furniture.dimsMm.y,
    dim_z_mm: furniture.dimsMm.z,
    tolerance_mm: input.def.toleranceMm,
    edge_band_type: spec.type,
    edge_band_width_mm: spec.widthMm,
    edge_band_thickness_mm: spec.thicknessMm,
    edge_band_status: spec.status,
    edge_band_note: spec.note ?? null,
    created_by: input.createdBy,
    created_at: now,
    published_by: null,
    published_at: null,
  };

  const moduleRows: ModuleRow[] = modules.map((mod, position) => ({
    tenant_id: tenantId,
    id: newId(),
    design_version_id: designVersionId,
    legacy_id: mod.id,
    legacy_qr_id: mod.qrId,
    name: mod.name,
    position,
  }));
  const moduleRowId = new Map(moduleRows.map((row) => [row.legacy_id, row.id]));

  const pieces: PieceTypeRow[] = [];
  const qrs: QrCodeRow[] = [];
  pieceTypes.forEach((piece, position) => {
    const rows = toPieceRows({
      tenantId,
      designVersionId,
      pieceTypeId: newId(),
      moduleId: moduleRowId.get(piece.moduleId) as string, // existe: assertDefValido
      position,
      piece,
      now,
    });
    pieces.push(rows.piece);
    qrs.push(rows.qr);
  });

  return { version, modules: moduleRows, pieces, qrs };
}

export function toPieceRows(args: {
  tenantId: string;
  designVersionId: string;
  pieceTypeId: string;
  moduleId: string;
  position: number;
  piece: Omit<PieceType, "moduleId">;
  now: Date;
}): { piece: PieceTypeRow; qr: QrCodeRow } {
  const { tenantId, designVersionId, pieceTypeId, piece } = args;
  return {
    piece: {
      tenant_id: tenantId,
      id: pieceTypeId,
      design_version_id: designVersionId,
      module_id: args.moduleId,
      position: args.position,
      code: piece.code,
      name: piece.name,
      length_mm: piece.lengthMm,
      width_mm: piece.widthMm,
      thickness_mm: piece.thicknessMm,
      material: piece.material,
      quantity: piece.quantity,
      edge_banding: encodeEdgeBanding(piece.edgeBanding),
      notes: piece.notes,
    },
    qr: {
      tenant_id: tenantId,
      id: piece.qrId,
      piece_type_id: pieceTypeId,
      design_version_id: designVersionId,
      ordinal: 1,
      created_at: args.now,
      revoked_at: null,
    },
  };
}

// --- Filas -> dominio ----------------------------------------------------------------------------

export function parseStatus(status: string): DesignVersionStatus {
  const found = DESIGN_VERSION_STATUSES.find((s) => s === status);
  if (!found) throw new DocumentoInvalidoError("design_version.status");
  return found;
}

export function decodeEdgeBanding(text: string | null): PieceType["edgeBanding"] {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DocumentoInvalidoError("piece_type.edge_banding");
  }
  if (!Array.isArray(value)) throw new DocumentoInvalidoError("piece_type.edge_banding");
  return value.map((edge) => {
    const found = EDGE_IDS.find((id) => id === edge);
    if (!found) throw new DocumentoInvalidoError("piece_type.edge_banding");
    return found;
  });
}

export interface DefRows {
  furniture: FurnitureRow;
  version: DesignVersionRow;
  modules: readonly ModuleRow[];
  pieces: readonly PieceTypeRow[];
  /** QR de los tipos de pieza de la versión (alcanza con los de `ordinal` 1). */
  qrs: readonly QrCodeRow[];
  /** Calculado por el repositorio: el mueble tiene publicada una versión con número mayor. */
  newerVersionAvailable: boolean;
}

/** Arma el `FurnitureDef` de la ficha. Módulos y piezas salen ordenados por `position`. */
export function toFurnitureDef(rows: DefRows): FurnitureDef {
  const { furniture, version } = rows;
  if (furniture.legacy_id === null || furniture.legacy_qr_id === null) throw new DocumentoInvalidoError("furniture.legacy_id");
  if (version.model_url === null) throw new DocumentoInvalidoError("design_version.model_url");
  if (version.edge_band_type !== "ABS") throw new DocumentoInvalidoError("design_version.edge_band_type");
  const status = EDGE_BAND_STATUSES.find((s) => s === version.edge_band_status);
  if (!status) throw new DocumentoInvalidoError("design_version.edge_band_status");

  const byPosition = <T extends { position: number }>(items: readonly T[]) => [...items].sort((a, b) => a.position - b.position);

  const legacyModuleId = new Map<string, string>();
  const modules: Module[] = byPosition(rows.modules).map((row) => {
    if (row.legacy_id === null || row.legacy_qr_id === null) throw new DocumentoInvalidoError("module.legacy_id");
    legacyModuleId.set(row.id, row.legacy_id);
    return { id: row.legacy_id, qrId: row.legacy_qr_id, furnitureId: furniture.legacy_id as string, name: row.name };
  });

  const firstQr = new Map(rows.qrs.filter((qr) => qr.ordinal === 1).map((qr) => [qr.piece_type_id, qr.id]));
  const pieceTypes: PieceType[] = byPosition(rows.pieces).map((row) => {
    const moduleId = row.module_id === null ? undefined : legacyModuleId.get(row.module_id);
    // Un tipo de pieza sin módulo es válido en el modelo, pero la ficha actual exige uno; S2 no escribe ninguno.
    if (moduleId === undefined) throw new DocumentoInvalidoError("piece_type.module_id");
    const qrId = firstQr.get(row.id);
    if (qrId === undefined) throw new DocumentoInvalidoError("qr_code");
    return {
      qrId,
      code: row.code,
      name: row.name,
      moduleId,
      lengthMm: row.length_mm,
      widthMm: row.width_mm,
      thicknessMm: row.thickness_mm,
      material: row.material,
      quantity: row.quantity,
      edgeBanding: decodeEdgeBanding(row.edge_banding),
      notes: row.notes,
    };
  });

  const edgeBandSpec: EdgeBandSpec = {
    type: "ABS",
    widthMm: version.edge_band_width_mm,
    thicknessMm: version.edge_band_thickness_mm,
    status,
    ...(version.edge_band_note === null ? {} : { note: version.edge_band_note }),
  };

  return {
    furniture: {
      id: furniture.legacy_id,
      qrId: furniture.legacy_qr_id,
      name: version.name,
      dimsMm: { x: version.dim_x_mm, y: version.dim_y_mm, z: version.dim_z_mm },
      designVersion: version.label,
      newerVersionAvailable: rows.newerVersionAvailable,
      edgeBandSpec,
    },
    modules,
    pieceTypes,
    modelUrl: version.model_url,
    ...(version.texture_base_url === null ? {} : { textureBaseUrl: version.texture_base_url }),
    toleranceMm: version.tolerance_mm,
  };
}

// --- Corridas del motor ---------------------------------------------------------------------------

export function toEngineRunRow(args: { tenantId: string; id: string; designVersionId: string; run: AssociationRun; now: Date }): EngineRunRow {
  const { run } = args;
  return {
    tenant_id: args.tenantId,
    id: args.id,
    design_version_id: args.designVersionId,
    engine_run_id: run.engineRunId,
    model_id: run.modelId,
    listado_id: run.listadoId,
    passes: run.passes,
    document: JSON.stringify(run),
    created_at: args.now,
  };
}

/** Lee el documento de una corrida. Comprueba la forma mínima y que sea la corrida de esa fila. */
export function parseRunDocument(row: Pick<EngineRunRow, "engine_run_id" | "document">): AssociationRun {
  let value: unknown;
  try {
    value = JSON.parse(row.document);
  } catch {
    throw new DocumentoInvalidoError("engine_run.document");
  }
  if (typeof value !== "object" || value === null) throw new DocumentoInvalidoError("engine_run.document");
  const run = value as Partial<AssociationRun>;
  const ok =
    run.engineRunId === row.engine_run_id &&
    typeof run.modelId === "string" &&
    typeof run.listadoId === "string" &&
    (run.passes === 1 || run.passes === 2) &&
    Array.isArray(run.results) &&
    Array.isArray(run.typeSummary) &&
    Array.isArray(run.inconsistencies);
  if (!ok) throw new DocumentoInvalidoError("engine_run.document");
  return value as AssociationRun;
}
