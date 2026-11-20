// S2: implementación en memoria de los repositorios (ADR-002, decisión 2). Para las pruebas y para desarrollar sin base.
// Guarda las mismas filas que la base (rows.ts) y usa los mismos mapeadores que la implementación en SQL.
// Cada operación valida todo antes de escribir: equivale a la transacción de la implementación en SQL.

import {
  assertTenant,
  CodigoRepetidoEnVersionError,
  MuebleInvalidoError,
  QrDuplicadoError,
  ReferenciaDeOtroTenantError,
  TenantInexistenteError,
  VersionInmutableError,
  type DesignVersionRef,
  type EmbeddedSession,
  type ErpDocumentRepository,
  type FurnitureRepository,
  type Persistence,
  type PersistenceDeps,
  type ProjectRepository,
  type QrRepository,
  type QrResolution,
  type RunRepository,
  type SessionRepository,
  type Tenant,
  type TenantRepository,
} from "../ports";
import { assertDefValido, parseRunDocument, parseStatus, qrIdsOf, toEngineRunRow, toFurnitureDef, toPieceRows, toVersionRows } from "../mappers";
import { defaultDeps } from "../deps";
import type {
  DesignVersionRow,
  EngineRunRow,
  ErpDocumentRow,
  FurnitureRow,
  ModuleRow,
  PieceTypeRow,
  ProjectRow,
  QrCodeRow,
  SessionRow,
  TenantRow,
} from "../rows";

interface Db {
  tenant: TenantRow[];
  project: ProjectRow[];
  furniture: FurnitureRow[];
  design_version: DesignVersionRow[];
  module: ModuleRow[];
  piece_type: PieceTypeRow[];
  qr_code: QrCodeRow[];
  engine_run: EngineRunRow[];
  session: SessionRow[];
  erp_document: ErpDocumentRow[];
}

export function createMemoryPersistence(overrides: Partial<PersistenceDeps> = {}): Persistence {
  const deps: PersistenceDeps = { ...defaultDeps, ...overrides };
  const db: Db = { tenant: [], project: [], furniture: [], design_version: [], module: [], piece_type: [], qr_code: [], engine_run: [], session: [], erp_document: [] };

  const toTenant = (row: TenantRow): Tenant => ({ id: row.id, name: row.name, erpTenantId: row.erp_tenant_id, enabled: row.enabled });

  const requireTenant = (tenantId: string): void => {
    assertTenant(tenantId);
    if (!db.tenant.some((t) => t.id === tenantId)) throw new TenantInexistenteError(tenantId);
  };

  /** La versión, solo si es de esa carpintería. */
  const findVersion = (tenantId: string, designVersionId: string): DesignVersionRow | undefined =>
    db.design_version.find((v) => v.tenant_id === tenantId && v.id === designVersionId);

  const requireVersion = (tenantId: string, designVersionId: string): DesignVersionRow => {
    const version = findVersion(tenantId, designVersionId);
    if (!version) throw new ReferenciaDeOtroTenantError("la versión de diseño");
    return version;
  };

  const assertEditable = (version: DesignVersionRow): void => {
    if (version.published_at !== null) throw new VersionInmutableError(version.id);
  };

  /** Un qrId es único en toda la base, entre QR de pieza y heredados de mueble y de módulo. */
  const qrTaken = (qrId: string, exceptFurnitureId?: string): boolean =>
    db.qr_code.some((qr) => qr.id === qrId) ||
    db.module.some((m) => m.legacy_qr_id === qrId) ||
    db.furniture.some((f) => f.legacy_qr_id === qrId && f.id !== exceptFurnitureId);

  const tenants: TenantRepository = {
    async create(input) {
      const id = input.id ?? deps.newId();
      assertTenant(id);
      if (db.tenant.some((t) => t.id === id)) throw new Error(`La carpintería "${id}" ya existe.`);
      const row: TenantRow = { id, erp_tenant_id: input.erpTenantId ?? null, name: input.name, enabled: true, created_at: deps.now() };
      db.tenant.push(row);
      return toTenant(row);
    },
    async get(tenantId) {
      assertTenant(tenantId);
      const row = db.tenant.find((t) => t.id === tenantId);
      return row ? toTenant(row) : null;
    },
    async ensureErpTenant(input) {
      assertTenant(input.erpTenantId);
      const existing = db.tenant.find((t) => t.erp_tenant_id === input.erpTenantId);
      if (existing) return toTenant(existing);
      return tenants.create({ name: input.name, erpTenantId: input.erpTenantId });
    },
  };

  const projects: ProjectRepository = {
    async linkErpProject(tenantId, input) {
      requireTenant(tenantId);
      const existing = db.project.find((p) => p.tenant_id === tenantId && p.erp_project_id === input.erpProjectId);
      if (existing) return existing.id;
      const row: ProjectRow = { tenant_id: tenantId, id: deps.newId(), erp_project_id: input.erpProjectId, name: input.name, created_at: deps.now() };
      db.project.push(row);
      return row.id;
    },
  };

  const toSession = (row: SessionRow): EmbeddedSession => ({
    id: row.id,
    tenantId: row.tenant_id,
    erpUserId: row.erp_user_id,
    erpTenantId: row.erp_tenant_id,
    erpTokenEncrypted: row.erp_token_encrypted,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  });

  const sessions: SessionRepository = {
    async create(session) {
      requireTenant(session.tenantId);
      if (db.session.some((row) => row.id === session.id)) throw new Error("La sesión ya existe.");
      db.session.push({
        tenant_id: session.tenantId,
        id: session.id,
        erp_user_id: session.erpUserId,
        erp_tenant_id: session.erpTenantId,
        erp_token_encrypted: session.erpTokenEncrypted,
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        revoked_at: null,
      });
    },
    async get(id) {
      const row = db.session.find((r) => r.id === id);
      return row ? toSession({ ...row }) : null;
    },
    async replaceToken(tenantId, id, erpTokenEncrypted) {
      assertTenant(tenantId);
      const row = db.session.find((r) => r.tenant_id === tenantId && r.id === id && r.revoked_at === null);
      if (!row) return false;
      row.erp_token_encrypted = erpTokenEncrypted;
      return true;
    },
    async revoke(id, at) {
      const row = db.session.find((r) => r.id === id);
      if (row && row.revoked_at === null) row.revoked_at = at;
    },
  };

  const erpDocuments: ErpDocumentRepository = {
    async record(tenantId, projectId, seen) {
      requireTenant(tenantId);
      if (!db.project.some((p) => p.tenant_id === tenantId && p.id === projectId)) throw new ReferenciaDeOtroTenantError("el proyecto");
      const exists = db.erp_document.some(
        (d) => d.tenant_id === tenantId && d.project_id === projectId && d.erp_document_id === seen.erpDocumentId && d.sha256 === seen.sha256,
      );
      if (exists) return;
      db.erp_document.push({
        tenant_id: tenantId,
        id: deps.newId(),
        project_id: projectId,
        erp_document_id: seen.erpDocumentId,
        sha256: seen.sha256,
        bytes: seen.bytes,
        first_seen_at: deps.now(),
      });
    },
    async list(tenantId, projectId) {
      assertTenant(tenantId);
      return db.erp_document
        .filter((d) => d.tenant_id === tenantId && d.project_id === projectId)
        .map((d) => ({ erpDocumentId: d.erp_document_id, sha256: d.sha256, bytes: d.bytes }));
    },
  };

  const furniture: FurnitureRepository = {
    async saveDesignVersion(tenantId, input) {
      requireTenant(tenantId);
      const { def } = input;
      assertDefValido(def);

      let existing: FurnitureRow | undefined;
      if (input.furnitureId !== undefined) {
        existing = db.furniture.find((f) => f.tenant_id === tenantId && f.id === input.furnitureId);
        if (!existing) throw new ReferenciaDeOtroTenantError("el mueble");
        if (existing.legacy_id !== def.furniture.id || existing.legacy_qr_id !== def.furniture.qrId) {
          throw new MuebleInvalidoError("el id o el qrId del mueble no coinciden con los del mueble guardado");
        }
      }
      for (const qrId of qrIdsOf(def)) {
        if (qrTaken(qrId, existing?.id)) throw new QrDuplicadoError(qrId);
      }

      const now = deps.now();
      const project: ProjectRow | undefined = existing
        ? undefined
        : { tenant_id: tenantId, id: deps.newId(), erp_project_id: null, name: input.projectName ?? def.furniture.name, created_at: now };
      const furnitureRow: FurnitureRow = existing ?? {
        tenant_id: tenantId,
        id: deps.newId(),
        project_id: (project as ProjectRow).id,
        erp_furniture_id: null,
        legacy_id: def.furniture.id,
        legacy_qr_id: def.furniture.qrId,
        name: def.furniture.name,
        published_version_id: null,
        created_at: now,
      };
      const previous = db.design_version.filter((v) => v.tenant_id === tenantId && v.furniture_id === furnitureRow.id);
      const rows = toVersionRows({
        tenantId,
        furnitureId: furnitureRow.id,
        designVersionId: deps.newId(),
        publicId: deps.newQrId(),
        number: Math.max(0, ...previous.map((v) => v.number)) + 1,
        input,
        newId: deps.newId,
        now,
      });

      if (project) db.project.push(project);
      if (!existing) db.furniture.push(furnitureRow);
      db.design_version.push(rows.version);
      db.module.push(...rows.modules);
      db.piece_type.push(...rows.pieces);
      db.qr_code.push(...rows.qrs);

      const ref: DesignVersionRef = {
        projectId: furnitureRow.project_id,
        furnitureId: furnitureRow.id,
        designVersionId: rows.version.id,
        publicId: rows.version.public_id,
        number: rows.version.number,
        moduleIds: Object.fromEntries(rows.modules.map((m) => [m.legacy_id as string, m.id])),
        pieceTypeIds: Object.fromEntries(rows.pieces.map((p) => [p.code, p.id])),
      };
      return ref;
    },

    async addPieceType(tenantId, designVersionId, input) {
      requireTenant(tenantId);
      const version = requireVersion(tenantId, designVersionId);
      assertEditable(version);
      const mod = db.module.find((m) => m.tenant_id === tenantId && m.design_version_id === designVersionId && m.id === input.moduleId);
      if (!mod) throw new ReferenciaDeOtroTenantError("el módulo");
      const siblings = db.piece_type.filter((p) => p.tenant_id === tenantId && p.design_version_id === designVersionId);
      if (siblings.some((p) => p.code === input.piece.code)) throw new CodigoRepetidoEnVersionError(input.piece.code);
      if (qrTaken(input.piece.qrId)) throw new QrDuplicadoError(input.piece.qrId);

      const rows = toPieceRows({
        tenantId,
        designVersionId,
        pieceTypeId: deps.newId(),
        moduleId: mod.id,
        position: Math.max(-1, ...siblings.map((p) => p.position)) + 1,
        piece: input.piece,
        now: deps.now(),
      });
      db.piece_type.push(rows.piece);
      db.qr_code.push(rows.qr);
      return rows.piece.id;
    },

    async getFurnitureDef(tenantId, designVersionId) {
      assertTenant(tenantId);
      const version = findVersion(tenantId, designVersionId);
      if (!version) return null;
      const furnitureRow = db.furniture.find((f) => f.tenant_id === tenantId && f.id === version.furniture_id) as FurnitureRow;
      const published = furnitureRow.published_version_id === null ? undefined : findVersion(tenantId, furnitureRow.published_version_id);
      return toFurnitureDef({
        furniture: furnitureRow,
        version,
        modules: db.module.filter((m) => m.tenant_id === tenantId && m.design_version_id === version.id),
        pieces: db.piece_type.filter((p) => p.tenant_id === tenantId && p.design_version_id === version.id),
        qrs: db.qr_code.filter((qr) => qr.tenant_id === tenantId && qr.design_version_id === version.id),
        newerVersionAvailable: published !== undefined && published.number > version.number,
      });
    },

    async listDesignVersions(tenantId) {
      assertTenant(tenantId);
      return db.design_version
        .filter((v) => v.tenant_id === tenantId)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.number - b.number || (a.id < b.id ? -1 : 1))
        .map((v) => ({
          designVersionId: v.id,
          furnitureId: v.furniture_id,
          furnitureName: v.name,
          number: v.number,
          status: parseStatus(v.status),
        }));
    },

    async publish(tenantId, designVersionId, publishedBy) {
      requireTenant(tenantId);
      const version = requireVersion(tenantId, designVersionId);
      assertEditable(version);
      const furnitureRow = db.furniture.find((f) => f.tenant_id === tenantId && f.id === version.furniture_id) as FurnitureRow;
      const previous = furnitureRow.published_version_id === null ? undefined : findVersion(tenantId, furnitureRow.published_version_id);
      if (previous) previous.status = "reemplazada";
      version.status = "publicada";
      version.published_by = publishedBy;
      version.published_at = deps.now();
      furnitureRow.published_version_id = version.id;
    },
  };

  const qr: QrRepository = {
    async resolve(qrId) {
      const versionOf = (tenantId: string, id: string) => findVersion(tenantId, id) as DesignVersionRow;

      const code = db.qr_code.find((row) => row.id === qrId);
      if (code) {
        const version = versionOf(code.tenant_id, code.design_version_id);
        const resolution: QrResolution = {
          kind: "piece",
          qrId,
          tenantId: code.tenant_id,
          designVersionId: version.id,
          status: parseStatus(version.status),
          pieceTypeId: code.piece_type_id,
          revoked: code.revoked_at !== null,
        };
        return resolution;
      }
      const mod = db.module.find((row) => row.legacy_qr_id === qrId);
      if (mod) {
        const version = versionOf(mod.tenant_id, mod.design_version_id);
        return { kind: "module", qrId, tenantId: mod.tenant_id, designVersionId: version.id, status: parseStatus(version.status), moduleId: mod.id };
      }
      const furnitureRow = db.furniture.find((row) => row.legacy_qr_id === qrId);
      if (furnitureRow && furnitureRow.published_version_id !== null) {
        const version = versionOf(furnitureRow.tenant_id, furnitureRow.published_version_id);
        return { kind: "furniture", qrId, tenantId: furnitureRow.tenant_id, designVersionId: version.id, status: parseStatus(version.status) };
      }
      return null;
    },

    async create(tenantId, pieceTypeId) {
      requireTenant(tenantId);
      const piece = db.piece_type.find((p) => p.tenant_id === tenantId && p.id === pieceTypeId);
      if (!piece) throw new ReferenciaDeOtroTenantError("el tipo de pieza");
      assertEditable(requireVersion(tenantId, piece.design_version_id));
      const id = deps.newQrId();
      if (qrTaken(id)) throw new QrDuplicadoError(id);
      const ordinals = db.qr_code.filter((row) => row.piece_type_id === piece.id).map((row) => row.ordinal);
      db.qr_code.push({
        tenant_id: tenantId,
        id,
        piece_type_id: piece.id,
        design_version_id: piece.design_version_id,
        ordinal: Math.max(0, ...ordinals) + 1,
        created_at: deps.now(),
        revoked_at: null,
      });
      return id;
    },
  };

  const runs: RunRepository = {
    async save(tenantId, designVersionId, run) {
      requireTenant(tenantId);
      requireVersion(tenantId, designVersionId);
      const exists = db.engine_run.some(
        (r) => r.tenant_id === tenantId && r.design_version_id === designVersionId && r.engine_run_id === run.engineRunId,
      );
      if (exists) return;
      db.engine_run.push(toEngineRunRow({ tenantId, id: deps.newId(), designVersionId, run, now: deps.now() }));
    },
    async get(tenantId, designVersionId, engineRunId) {
      assertTenant(tenantId);
      const row = db.engine_run.find(
        (r) => r.tenant_id === tenantId && r.design_version_id === designVersionId && r.engine_run_id === engineRunId,
      );
      return row ? parseRunDocument(row) : null;
    },
  };

  return { tenants, furniture, qr, runs, projects, sessions, erpDocuments, close: async () => {} };
}
