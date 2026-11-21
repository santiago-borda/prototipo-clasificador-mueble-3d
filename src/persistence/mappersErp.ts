// IE-2, IE-9: fila ↔ dominio de la integración con el ERP. Puro; lo usan las dos implementaciones (memoria y SQL).

import { esEstadoTrabajo } from "@/lib/erp/estados";
import { normalizarUuid, UUID } from "@/lib/erp/protocolo";
import { DocumentoInvalidoError, type ErpProject, type ErpSession, type Job, type StoredFileMeta } from "./ports";
import type { JobRow, ProjectRow, SessionRow, StoredFileRow } from "./rows";

/**
 * Forma única de un id que viene del ERP (UUID de carpintería, proyecto o envío): en minúsculas, para que los índices
 * únicos no admitan el mismo UUID escrito con mayúsculas. Lo que no es un UUID queda como está. Los repositorios lo
 * aplican al guardar y al buscar, así que no depende de que quien llama haya normalizado.
 */
export const idErp = (id: string): string => (UUID.test(id) ? normalizarUuid(id) : id);

export function toErpSession(row: SessionRow): ErpSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    erpUserId: row.erp_user_id,
    erpTenantId: row.erp_tenant_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export function toErpProject(row: ProjectRow): ErpProject {
  if (row.erp_project_id === null) throw new DocumentoInvalidoError("project.erp_project_id");
  return { id: row.id, erpProjectId: row.erp_project_id, code: row.erp_code ?? "", name: row.name, deliveryDate: row.delivery_date };
}

/** Orden de los proyectos: código y después uuid, binario. */
export function porCodigo(a: ErpProject, b: ErpProject): number {
  const ka = `${a.code}\u0000${a.erpProjectId}`;
  const kb = `${b.code}\u0000${b.erpProjectId}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function toJob(row: JobRow): Job {
  if (!esEstadoTrabajo(row.status)) throw new DocumentoInvalidoError("job.status");
  return {
    id: row.id,
    envioUuid: row.envio_uuid,
    projectId: row.project_id,
    status: row.status,
    message: row.message,
    model: { sha256: row.model_sha256, version: Number(row.model_version), name: row.model_name },
    csv: { sha256: row.csv_sha256, version: Number(row.csv_version), name: row.csv_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toJobRow(tenantId: string, job: Job): JobRow {
  return {
    tenant_id: tenantId,
    id: job.id,
    envio_uuid: job.envioUuid,
    project_id: job.projectId,
    status: job.status,
    message: job.message,
    model_sha256: job.model.sha256,
    model_version: job.model.version,
    model_name: job.model.name,
    csv_sha256: job.csv.sha256,
    csv_version: job.csv.version,
    csv_name: job.csv.name,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

// --- S3: stored_file ---

export function toStoredFileRow(tenantId: string, f: StoredFileMeta): StoredFileRow {
  return {
    tenant_id: tenantId,
    id: f.id,
    sha256: f.sha256,
    bytes: f.bytes,
    content_type: f.contentType,
    kind: f.kind,
    original_name: f.originalName,
    storage_key: f.storageKey,
    uploaded_by: f.uploadedBy,
    created_at: f.createdAt,
  };
}

export const toStoredFile = (r: StoredFileRow): StoredFileMeta => ({
  id: r.id,
  sha256: r.sha256,
  bytes: r.bytes,
  contentType: r.content_type,
  kind: r.kind,
  originalName: r.original_name,
  storageKey: r.storage_key,
  uploadedBy: r.uploaded_by,
  createdAt: r.created_at,
});
