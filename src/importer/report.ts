// Informe de validación de una importación (R4–R5): CSV + cruce con las piezas del .dae. Función pura.
// Reutiliza `verifyModel` y `checkAssociation`. El estado define si se puede subir:
//   bloqueado        errores en el CSV (no se sube; no llega a cruzarse con el .dae)
//   con-advertencias el CSV es válido pero hay huérfanas, cantidades o medidas fuera de tolerancia (se puede subir)
//   correcto         todo coincide
// Las anomalías del nombre en el .dae (guiones bajos de más) se informan pero no cambian el estado.

import { checkAssociation, type AssociationReport } from "@/data/mapping";
import { verifyModel, type ModelVerification } from "@/model/verifyModel";
import type { FurniturePart } from "@/model/types";
import { buildFurnitureDef, type ImportedFurnitureDef } from "./buildDef";
import { measureDimsMm } from "./dims";
import { readListing, type ListingIssue } from "./listing";

export type ImportStatus = "correcto" | "con-advertencias" | "bloqueado";

export interface ImportReport {
  status: ImportStatus;
  /** Errores y advertencias del CSV. */
  issues: ListingIssue[];
  /** null si el CSV está bloqueado. */
  verification: ModelVerification | null;
  association: AssociationReport | null;
  /** El mueble armado; null si el CSV está bloqueado. */
  def: ImportedFurnitureDef | null;
}

/** Estado según los problemas del CSV y, si ya se cruzó con el .dae, su verificación y su asociación. */
export function statusOf(
  issues: readonly ListingIssue[],
  verification: Pick<ModelVerification, "warnings"> | null,
  association: Pick<AssociationReport, "ok"> | null,
): ImportStatus {
  if (issues.some((issue) => issue.severity === "error")) return "bloqueado";
  const clean = issues.length === 0 && (verification?.warnings.length ?? 0) === 0 && (association?.ok ?? true);
  return clean ? "correcto" : "con-advertencias";
}

export interface BuildReportInput {
  csvText: string;
  parts: readonly FurniturePart[];
  importId: string;
}

export function buildImportReport({ csvText, parts, importId }: BuildReportInput): ImportReport {
  const { rows, issues } = readListing(csvText);
  if (issues.some((issue) => issue.severity === "error")) {
    return { status: "bloqueado", issues, verification: null, association: null, def: null };
  }

  const def = buildFurnitureDef(rows, { importId, dimsMm: measureDimsMm(parts) });
  const verification = verifyModel(parts, def.pieceTypes, { toleranceMm: def.toleranceMm });
  const association = checkAssociation(
    parts.map((part) => part.instanceId),
    def.pieceTypes,
  );

  return { status: statusOf(issues, verification, association), issues, verification, association, def };
}
