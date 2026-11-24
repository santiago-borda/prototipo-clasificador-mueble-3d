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
  TrabajoSinCausaError,
  VersionInmutableError,
  type Almacen,
  type DesignVersionRef,
  type FileRepository,
  type FurnitureRepository,
  type JobRepository,
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
import { idErp, porCodigo, toErpProject, toErpSession, toJob, toJobRow, toStoredFile, toStoredFileRow } from "../mappersErp";
import { defaultDeps } from "../deps";
import type {
  DesignVersionRow,
  EngineRunRow,
  FileContentRow,
  FurnitureRow,
  JobRow,
  ModuleRow,
  PieceTypeRow,
  ProjectRow,
  QrCodeRow,
  SessionRow,
  StoredFileRow,
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
  job: JobRow[];
  file_content: FileContentRow[];
  stored_file: StoredFileRow[];
}

export function createMemoryPersistence(overrides: Partial<PersistenceDeps> = {}): Persistence {
  const deps: PersistenceDeps = { ...defaultDeps, ...overrides };
  const db: Db = {
    tenant: [],
    project: [],
    furniture: [],
    design_version: [],
    module: [],
    piece_type: [],
    qr_code: [],
    engine_run: [],
    session: [],
    job: [],
    file_content: [],
    stored_file: [],
  };

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
      const row: TenantRow = { id, erp_tenant_id: input.erpTenantId == null ? null : idErp(input.erpTenantId), name: input.name, enabled: true, created_at: deps.now() };
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
      const erpTenantId = idErp(input.erpTenantId);
      const existing = db.tenant.find((t) => t.erp_tenant_id === erpTenantId);
      if (existing) return toTenant(existing);
      return tenants.create({ name: input.name, erpTenantId });
    },
    async findErpTenant(erpTenantId) {
      assertTenant(erpTenantId);
      const id = idErp(erpTenantId);
      const row = db.tenant.find((t) => t.erp_tenant_id === id);
      return row ? toTenant(row) : null;
    },
  };

  const projects: ProjectRepository = {
    async upsertErpProject(tenantId, input) {
      requireTenant(tenantId);
      const erpProjectId = idErp(input.erpProjectId);
      const existing = db.project.find((p) => p.tenant_id === tenantId && p.erp_project_id === erpProjectId);
      if (existing) {
        existing.erp_code = input.code;
        existing.name = input.name;
        existing.delivery_date = input.deliveryDate;
        return existing.id;
      }
      const row: ProjectRow = {
        tenant_id: tenantId,
        id: deps.newId(),
        erp_project_id: erpProjectId,
        name: input.name,
        erp_code: input.code,
        delivery_date: input.deliveryDate,
        created_at: deps.now(),
      };
      db.project.push(row);
      return row.id;
    },
    async getErpProject(tenantId, erpProjectId) {
      assertTenant(tenantId);
      const id = idErp(erpProjectId);
      const row = db.project.find((p) => p.tenant_id === tenantId && p.erp_project_id === id);
      return row ? toErpProject({ ...row }) : null;
    },
    async listErpProjects(tenantId) {
      assertTenant(tenantId);
      return db.project
        .filter((p) => p.tenant_id === tenantId && p.erp_project_id !== null)
        .map((p) => toErpProject({ ...p }))
        .sort(porCodigo);
    },
  };

  const sessions: SessionRepository = {
    async create(session) {
      requireTenant(session.tenantId);
      if (db.session.some((row) => row.id === session.id)) throw new Error("La sesión ya existe.");
      db.session.push({
        tenant_id: session.tenantId,
        id: session.id,
        erp_user_id: session.erpUserId,
        erp_tenant_id: idErp(session.erpTenantId),
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        revoked_at: null,
      });
    },
    async get(id) {
      const row = db.session.find((r) => r.id === id);
      return row ? toErpSession({ ...row }) : null;
    },
    async extend(tenantId, id, expiresAt) {
      assertTenant(tenantId);
      const row = db.session.find((r) => r.tenant_id === tenantId && r.id === id && r.revoked_at === null);
      if (!row) return false;
      row.expires_at = expiresAt;
      return true;
    },
    async revoke(id, at) {
      const row = db.session.find((r) => r.id === id);
      if (row && row.revoked_at === null) row.revoked_at = at;
    },
  };

  const jobs: JobRepository = {
    async create(tenantId, input) {
      requireTenant(tenantId);
      if (input.status === "failed" && !input.message?.trim()) throw new TrabajoSinCausaError();
      if (!db.project.some((p) => p.tenant_id === tenantId && p.id === input.projectId)) throw new ReferenciaDeOtroTenantError("el proyecto");
      const envioUuid = idErp(input.envioUuid);
      const existing = db.job.find((j) => j.tenant_id === tenantId && j.envio_uuid === envioUuid);
      if (existing) return { job: toJob({ ...existing }), created: false };
      const id = idErp(input.id ?? deps.newId());
      if (db.job.some((j) => j.id === id)) throw new Error("El trabajo ya existe.");
      const now = deps.now();
      const row = toJobRow(tenantId, { ...input, envioUuid, id, createdAt: now, updatedAt: now });
      db.job.push(row);
      return { job: toJob({ ...row }), created: true };
    },
    // Sin `await` entre leer y escribir: en memoria el claim es atómico.
    async claim(tenantId, input, staleBefore) {
      requireTenant(tenantId);
      if (!db.project.some((p) => p.tenant_id === tenantId && p.id === input.projectId)) throw new ReferenciaDeOtroTenantError("el proyecto");
      const envioUuid = idErp(input.envioUuid);
      const existing = db.job.find((j) => j.tenant_id === tenantId && j.envio_uuid === envioUuid);
      const now = deps.now();
      if (!existing) {
        const id = idErp(input.id ?? deps.newId());
        if (db.job.some((j) => j.id === id)) throw new Error("El trabajo ya existe.");
        const row = toJobRow(tenantId, { ...input, envioUuid, id, status: "inProgress", message: null, createdAt: now, updatedAt: now });
        db.job.push(row);
        return { job: toJob({ ...row }), outcome: "created" };
      }
      const abandonado = existing.status === "inProgress" && existing.updated_at.getTime() < staleBefore.getTime();
      if (existing.status !== "failed" && !abandonado) return { job: toJob({ ...existing }), outcome: "existing" };
      const previous = { message: existing.status === "failed" && existing.message ? existing.message : "El envío anterior no terminó." };
      existing.status = "inProgress";
      existing.message = null;
      existing.project_id = input.projectId;
      existing.model_sha256 = input.model.sha256;
      existing.model_version = input.model.version;
      existing.model_name = input.model.name;
      existing.csv_sha256 = input.csv.sha256;
      existing.csv_version = input.csv.version;
      existing.csv_name = input.csv.name;
      existing.updated_at = now;
      return { job: toJob({ ...existing }), outcome: "retry", previous };
    },
    async settle(tenantId, jobId, result) {
      assertTenant(tenantId);
      if (result.status === "failed" && !result.message.trim()) throw new TrabajoSinCausaError();
      const row = db.job.find((j) => j.tenant_id === tenantId && j.id === idErp(jobId) && j.status === "inProgress");
      if (!row) throw new Error("El trabajo no existe o no está en curso.");
      row.status = result.status;
      row.message = result.message;
      row.updated_at = deps.now();
      return toJob({ ...row });
    },
    async abandon(tenantId, jobId, previous) {
      assertTenant(tenantId);
      const i = db.job.findIndex((j) => j.tenant_id === tenantId && j.id === idErp(jobId) && j.status === "inProgress");
      if (i < 0) return;
      if (previous === null) {
        db.job.splice(i, 1);
        return;
      }
      db.job[i].status = "failed";
      db.job[i].message = previous.message;
      db.job[i].updated_at = deps.now();
    },
    async get(tenantId, jobId) {
      assertTenant(tenantId);
      const id = idErp(jobId);
      const row = db.job.find((j) => j.tenant_id === tenantId && j.id === id);
      return row ? toJob({ ...row }) : null;
    },
    async findByEnvio(tenantId, envioUuid) {
      assertTenant(tenantId);
      const envio = idErp(envioUuid);
      const row = db.job.find((j) => j.tenant_id === tenantId && j.envio_uuid === envio);
      return row ? toJob({ ...row }) : null;
    },
    async latestForProject(tenantId, projectId, status) {
      assertTenant(tenantId);
      // El último agregado gana a igual fecha: el orden de inserción es el de creación.
      let ultimo: JobRow | undefined;
      for (const j of db.job) {
        if (j.tenant_id !== tenantId || j.project_id !== projectId || (status && j.status !== status)) continue;
        if (!ultimo || j.created_at.getTime() >= ultimo.created_at.getTime()) ultimo = j;
      }
      return ultimo ? toJob({ ...ultimo }) : null;
    },
  };

  const almacen: Almacen = {
    async guardar(tenantId, sha256, datos) {
      requireTenant(tenantId);
      if (db.file_content.some((f) => f.tenant_id === tenantId && f.sha256 === sha256)) return;
      db.file_content.push({ tenant_id: tenantId, sha256, bytes: datos.length, content: datos.slice(), created_at: deps.now() });
    },
    async leer(tenantId, sha256) {
      assertTenant(tenantId);
      const row = db.file_content.find((f) => f.tenant_id === tenantId && f.sha256 === sha256);
      return row ? row.content.slice() : null;
    },
  };

  const files: FileRepository = {
    async insert(tenantId, file) {
      requireTenant(tenantId);
      const existing = db.stored_file.find((f) => f.tenant_id === tenantId && f.sha256 === file.sha256);
      if (existing) return toStoredFile(existing);
      if (db.stored_file.some((f) => f.tenant_id === tenantId && f.id === file.id)) throw new Error("stored_file_pk: id repetido");
      const row = toStoredFileRow(tenantId, { ...file, createdAt: deps.now() });
      db.stored_file.push(row);
      return toStoredFile(row);
    },
    async get(tenantId, id) {
      assertTenant(tenantId);
      const row = db.stored_file.find((f) => f.tenant_id === tenantId && f.id === id);
      return row ? toStoredFile(row) : null;
    },
    async findBySha256(tenantId, sha256) {
      assertTenant(tenantId);
      const row = db.stored_file.find((f) => f.tenant_id === tenantId && f.sha256 === sha256);
      return row ? toStoredFile(row) : null;
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
        : {
            tenant_id: tenantId,
            id: deps.newId(),
            erp_project_id: null,
            name: input.projectName ?? def.furniture.name,
            erp_code: null,
            delivery_date: null,
            created_at: now,
          };
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

  return { tenants, furniture, qr, runs, projects, sessions, jobs, almacen, files, close: async () => {} };
}
