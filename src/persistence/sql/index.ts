// S2: implementación en SQL de los repositorios, con Kysely (ADR-002, decisión 2).
// Mismas reglas y mismo orden de comprobaciones que memory/: las dos lanzan las mismas excepciones (spec §3).
// Toda consulta filtra por tenant_id (B6); la única excepción es `qr.resolve`, la puerta de entrada.
// Cada escritura corre en una transacción: o queda todo o no queda nada.

import type { Kysely } from "kysely";
import { defaultDeps } from "../deps";
import { assertDefValido, parseRunDocument, parseStatus, qrIdsOf, toEngineRunRow, toFurnitureDef, toPieceRows, toVersionRows } from "../mappers";
import {
  assertTenant,
  CodigoRepetidoEnVersionError,
  MuebleInvalidoError,
  QrDuplicadoError,
  ReferenciaDeOtroTenantError,
  TenantInexistenteError,
  VersionInmutableError,
  type EmbeddedSession,
  type ErpDocumentRepository,
  type FurnitureRepository,
  type Persistence,
  type PersistenceDeps,
  type ProjectRepository,
  type QrRepository,
  type RunRepository,
  type SessionRepository,
  type Tenant,
  type TenantRepository,
} from "../ports";
import type { DesignVersionRow, FurnitureRow, ProjectRow, SessionRow, TenantRow } from "../rows";
import type { Database } from "./connection";

/** Una conexión o una transacción: las consultas de lectura sirven para las dos. */
type Q = Kysely<Database>;

const toTenant = (row: TenantRow): Tenant => ({ id: row.id, name: row.name, erpTenantId: row.erp_tenant_id, enabled: row.enabled });

async function requireTenant(q: Q, tenantId: string): Promise<void> {
  assertTenant(tenantId);
  const row = await q.selectFrom("tenant").select("id").where("id", "=", tenantId).executeTakeFirst();
  if (!row) throw new TenantInexistenteError(tenantId);
}

/** La versión, solo si es de esa carpintería. */
function findVersion(q: Q, tenantId: string, designVersionId: string): Promise<DesignVersionRow | undefined> {
  return q.selectFrom("design_version").selectAll().where("tenant_id", "=", tenantId).where("id", "=", designVersionId).executeTakeFirst();
}

async function requireVersion(q: Q, tenantId: string, designVersionId: string): Promise<DesignVersionRow> {
  const version = await findVersion(q, tenantId, designVersionId);
  if (!version) throw new ReferenciaDeOtroTenantError("la versión de diseño");
  return version;
}

function assertEditable(version: DesignVersionRow): void {
  if (version.published_at !== null) throw new VersionInmutableError(version.id);
}

async function requireFurniture(q: Q, tenantId: string, furnitureId: string): Promise<FurnitureRow> {
  const row = await q.selectFrom("furniture").selectAll().where("tenant_id", "=", tenantId).where("id", "=", furnitureId).executeTakeFirst();
  if (!row) throw new ReferenciaDeOtroTenantError("el mueble");
  return row;
}

/**
 * El primero de `qrIds` (en ese orden) que ya existe en la base, entre QR de pieza y heredados de mueble y de módulo.
 * A propósito sin tenant_id: un qrId es único en toda la base (B4, S2-I7).
 */
async function firstQrTaken(q: Q, qrIds: readonly string[], exceptFurnitureId?: string): Promise<string | undefined> {
  if (qrIds.length === 0) return undefined;
  const ids = [...qrIds];
  const taken = new Set<string | null>();
  for (const row of await q.selectFrom("qr_code").select("id").where("id", "in", ids).execute()) taken.add(row.id);
  for (const row of await q.selectFrom("module").select("legacy_qr_id").where("legacy_qr_id", "in", ids).execute()) taken.add(row.legacy_qr_id);
  let furniture = q.selectFrom("furniture").select("legacy_qr_id").where("legacy_qr_id", "in", ids);
  if (exceptFurnitureId !== undefined) furniture = furniture.where("id", "!=", exceptFurnitureId);
  for (const row of await furniture.execute()) taken.add(row.legacy_qr_id);
  return ids.find((id) => taken.has(id));
}

export function createSqlPersistence(db: Kysely<Database>, overrides: Partial<PersistenceDeps> = {}): Persistence {
  const deps: PersistenceDeps = { ...defaultDeps, ...overrides };

  const tenants: TenantRepository = {
    async create(input) {
      const id = input.id ?? deps.newId();
      assertTenant(id);
      const row: TenantRow = { id, erp_tenant_id: input.erpTenantId ?? null, name: input.name, enabled: true, created_at: deps.now() };
      await db.transaction().execute(async (trx) => {
        const existing = await trx.selectFrom("tenant").select("id").where("id", "=", id).executeTakeFirst();
        if (existing) throw new Error(`La carpintería "${id}" ya existe.`);
        await trx.insertInto("tenant").values(row).execute();
      });
      return toTenant(row);
    },
    async get(tenantId) {
      assertTenant(tenantId);
      const row = await db.selectFrom("tenant").selectAll().where("id", "=", tenantId).executeTakeFirst();
      return row ? toTenant(row) : null;
    },
    async ensureErpTenant(input) {
      assertTenant(input.erpTenantId);
      const buscar = () => db.selectFrom("tenant").selectAll().where("erp_tenant_id", "=", input.erpTenantId).executeTakeFirst();
      const existing = await buscar();
      if (existing) return toTenant(existing);
      const row: TenantRow = { id: deps.newId(), erp_tenant_id: input.erpTenantId, name: input.name, enabled: true, created_at: deps.now() };
      try {
        await db.insertInto("tenant").values(row).execute();
        return toTenant(row);
      } catch (error) {
        // Dos primeras sesiones a la vez: la otra ya la creó (tenant_erp_uq).
        const creada = await buscar();
        if (creada) return toTenant(creada);
        throw error;
      }
    },
  };

  const projects: ProjectRepository = {
    async linkErpProject(tenantId, input) {
      assertTenant(tenantId);
      await requireTenant(db, tenantId);
      const buscar = () =>
        db.selectFrom("project").select("id").where("tenant_id", "=", tenantId).where("erp_project_id", "=", input.erpProjectId).executeTakeFirst();
      const existing = await buscar();
      if (existing) return existing.id;
      const row: ProjectRow = { tenant_id: tenantId, id: deps.newId(), erp_project_id: input.erpProjectId, name: input.name, created_at: deps.now() };
      try {
        await db.insertInto("project").values(row).execute();
        return row.id;
      } catch (error) {
        const creado = await buscar(); // project_erp_uq
        if (creado) return creado.id;
        throw error;
      }
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
      assertTenant(session.tenantId);
      await db.transaction().execute(async (trx) => {
        await requireTenant(trx, session.tenantId);
        await trx
          .insertInto("session")
          .values({
            tenant_id: session.tenantId,
            id: session.id,
            erp_user_id: session.erpUserId,
            erp_tenant_id: session.erpTenantId,
            erp_token_encrypted: session.erpTokenEncrypted,
            created_at: session.createdAt,
            expires_at: session.expiresAt,
            revoked_at: null,
          })
          .execute();
      });
    },
    async get(id) {
      // Puerta de entrada (como qr.resolve): sin tenant_id, es lo que se busca.
      const row = await db.selectFrom("session").selectAll().where("id", "=", id).executeTakeFirst();
      return row ? toSession(row) : null;
    },
    async replaceToken(tenantId, id, erpTokenEncrypted) {
      assertTenant(tenantId);
      const result = await db
        .updateTable("session")
        .set({ erp_token_encrypted: erpTokenEncrypted })
        .where("tenant_id", "=", tenantId)
        .where("id", "=", id)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },
    async revoke(id, at) {
      await db.updateTable("session").set({ revoked_at: at }).where("id", "=", id).where("revoked_at", "is", null).execute();
    },
  };

  const erpDocuments: ErpDocumentRepository = {
    async record(tenantId, projectId, seen) {
      assertTenant(tenantId);
      await db.transaction().execute(async (trx) => {
        await requireTenant(trx, tenantId);
        const project = await trx.selectFrom("project").select("id").where("tenant_id", "=", tenantId).where("id", "=", projectId).executeTakeFirst();
        if (!project) throw new ReferenciaDeOtroTenantError("el proyecto");
        const exists = await trx
          .selectFrom("erp_document")
          .select("id")
          .where("tenant_id", "=", tenantId)
          .where("project_id", "=", projectId)
          .where("erp_document_id", "=", seen.erpDocumentId)
          .where("sha256", "=", seen.sha256)
          .executeTakeFirst();
        if (exists) return;
        await trx
          .insertInto("erp_document")
          .values({
            tenant_id: tenantId,
            id: deps.newId(),
            project_id: projectId,
            erp_document_id: seen.erpDocumentId,
            sha256: seen.sha256,
            bytes: seen.bytes,
            first_seen_at: deps.now(),
          })
          .execute();
      });
    },
    async list(tenantId, projectId) {
      assertTenant(tenantId);
      const rows = await db
        .selectFrom("erp_document")
        .select(["erp_document_id", "sha256", "bytes", "first_seen_at", "id"])
        .where("tenant_id", "=", tenantId)
        .where("project_id", "=", projectId)
        .orderBy("first_seen_at")
        .orderBy("id")
        .execute();
      return rows.map((d) => ({ erpDocumentId: d.erp_document_id, sha256: d.sha256, bytes: d.bytes }));
    },
  };

  const furniture: FurnitureRepository = {
    async saveDesignVersion(tenantId, input) {
      assertTenant(tenantId);
      return db.transaction().execute(async (trx) => {
        await requireTenant(trx, tenantId);
        const { def } = input;
        assertDefValido(def);

        let existing: FurnitureRow | undefined;
        if (input.furnitureId !== undefined) {
          existing = await requireFurniture(trx, tenantId, input.furnitureId);
          if (existing.legacy_id !== def.furniture.id || existing.legacy_qr_id !== def.furniture.qrId) {
            throw new MuebleInvalidoError("el id o el qrId del mueble no coinciden con los del mueble guardado");
          }
        }
        const taken = await firstQrTaken(trx, qrIdsOf(def), existing?.id);
        if (taken !== undefined) throw new QrDuplicadoError(taken);

        const now = deps.now();
        let furnitureRow: FurnitureRow;
        if (existing) {
          furnitureRow = existing;
        } else {
          const project: ProjectRow = {
            tenant_id: tenantId,
            id: deps.newId(),
            erp_project_id: null,
            name: input.projectName ?? def.furniture.name,
            created_at: now,
          };
          furnitureRow = {
            tenant_id: tenantId,
            id: deps.newId(),
            project_id: project.id,
            erp_furniture_id: null,
            legacy_id: def.furniture.id,
            legacy_qr_id: def.furniture.qrId,
            name: def.furniture.name,
            published_version_id: null,
            created_at: now,
          };
          await trx.insertInto("project").values(project).execute();
          await trx.insertInto("furniture").values(furnitureRow).execute();
        }

        const previous = await trx
          .selectFrom("design_version")
          .select("number")
          .where("tenant_id", "=", tenantId)
          .where("furniture_id", "=", furnitureRow.id)
          .execute();
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
        await trx.insertInto("design_version").values(rows.version).execute();
        if (rows.modules.length > 0) await trx.insertInto("module").values(rows.modules).execute();
        if (rows.pieces.length > 0) await trx.insertInto("piece_type").values(rows.pieces).execute();
        if (rows.qrs.length > 0) await trx.insertInto("qr_code").values(rows.qrs).execute();

        return {
          projectId: furnitureRow.project_id,
          furnitureId: furnitureRow.id,
          designVersionId: rows.version.id,
          publicId: rows.version.public_id,
          number: rows.version.number,
          moduleIds: Object.fromEntries(rows.modules.map((m) => [m.legacy_id as string, m.id])),
          pieceTypeIds: Object.fromEntries(rows.pieces.map((p) => [p.code, p.id])),
        };
      });
    },

    async addPieceType(tenantId, designVersionId, input) {
      assertTenant(tenantId);
      return db.transaction().execute(async (trx) => {
        await requireTenant(trx, tenantId);
        const version = await requireVersion(trx, tenantId, designVersionId);
        assertEditable(version);
        const mod = await trx
          .selectFrom("module")
          .select("id")
          .where("tenant_id", "=", tenantId)
          .where("design_version_id", "=", designVersionId)
          .where("id", "=", input.moduleId)
          .executeTakeFirst();
        if (!mod) throw new ReferenciaDeOtroTenantError("el módulo");
        const siblings = await trx
          .selectFrom("piece_type")
          .select(["code", "position"])
          .where("tenant_id", "=", tenantId)
          .where("design_version_id", "=", designVersionId)
          .execute();
        if (siblings.some((p) => p.code === input.piece.code)) throw new CodigoRepetidoEnVersionError(input.piece.code);
        const taken = await firstQrTaken(trx, [input.piece.qrId]);
        if (taken !== undefined) throw new QrDuplicadoError(taken);

        const rows = toPieceRows({
          tenantId,
          designVersionId,
          pieceTypeId: deps.newId(),
          moduleId: mod.id,
          position: Math.max(-1, ...siblings.map((p) => p.position)) + 1,
          piece: input.piece,
          now: deps.now(),
        });
        await trx.insertInto("piece_type").values(rows.piece).execute();
        await trx.insertInto("qr_code").values(rows.qr).execute();
        return rows.piece.id;
      });
    },

    async getFurnitureDef(tenantId, designVersionId) {
      assertTenant(tenantId);
      const version = await findVersion(db, tenantId, designVersionId);
      if (!version) return null;
      const furnitureRow = await requireFurniture(db, tenantId, version.furniture_id);
      const published = furnitureRow.published_version_id === null ? undefined : await findVersion(db, tenantId, furnitureRow.published_version_id);
      return toFurnitureDef({
        furniture: furnitureRow,
        version,
        modules: await db.selectFrom("module").selectAll().where("tenant_id", "=", tenantId).where("design_version_id", "=", version.id).execute(),
        pieces: await db.selectFrom("piece_type").selectAll().where("tenant_id", "=", tenantId).where("design_version_id", "=", version.id).execute(),
        qrs: await db
          .selectFrom("qr_code")
          .selectAll()
          .where("tenant_id", "=", tenantId)
          .where("design_version_id", "=", version.id)
          .where("ordinal", "=", 1)
          .execute(),
        newerVersionAvailable: published !== undefined && published.number > version.number,
      });
    },

    async listDesignVersions(tenantId) {
      assertTenant(tenantId);
      const rows = await db
        .selectFrom("design_version")
        .select(["id", "furniture_id", "name", "number", "status"])
        .where("tenant_id", "=", tenantId)
        .orderBy("created_at")
        .orderBy("number")
        .orderBy("id")
        .execute();
      return rows.map((v) => ({
        designVersionId: v.id,
        furnitureId: v.furniture_id,
        furnitureName: v.name,
        number: v.number,
        status: parseStatus(v.status),
      }));
    },

    async publish(tenantId, designVersionId, publishedBy) {
      assertTenant(tenantId);
      await db.transaction().execute(async (trx) => {
        await requireTenant(trx, tenantId);
        const version = await requireVersion(trx, tenantId, designVersionId);
        assertEditable(version);
        const furnitureRow = await requireFurniture(trx, tenantId, version.furniture_id);
        if (furnitureRow.published_version_id !== null) {
          await trx
            .updateTable("design_version")
            .set({ status: "reemplazada" })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", furnitureRow.published_version_id)
            .execute();
        }
        await trx
          .updateTable("design_version")
          .set({ status: "publicada", published_by: publishedBy, published_at: deps.now() })
          .where("tenant_id", "=", tenantId)
          .where("id", "=", version.id)
          .execute();
        await trx
          .updateTable("furniture")
          .set({ published_version_id: version.id })
          .where("tenant_id", "=", tenantId)
          .where("id", "=", furnitureRow.id)
          .execute();
      });
    },
  };

  const qr: QrRepository = {
    async resolve(qrId) {
      // Sin tenantId a propósito (B6): el QR es la puerta de entrada. Cada búsqueda es por una columna única en toda la base.
      const code = await db.selectFrom("qr_code").selectAll().where("id", "=", qrId).executeTakeFirst();
      if (code) {
        const version = await requireVersion(db, code.tenant_id, code.design_version_id);
        return {
          kind: "piece",
          qrId,
          tenantId: code.tenant_id,
          designVersionId: version.id,
          status: parseStatus(version.status),
          pieceTypeId: code.piece_type_id,
          revoked: code.revoked_at !== null,
        };
      }
      const mod = await db.selectFrom("module").selectAll().where("legacy_qr_id", "=", qrId).executeTakeFirst();
      if (mod) {
        const version = await requireVersion(db, mod.tenant_id, mod.design_version_id);
        return { kind: "module", qrId, tenantId: mod.tenant_id, designVersionId: version.id, status: parseStatus(version.status), moduleId: mod.id };
      }
      const furnitureRow = await db.selectFrom("furniture").selectAll().where("legacy_qr_id", "=", qrId).executeTakeFirst();
      if (furnitureRow && furnitureRow.published_version_id !== null) {
        const version = await requireVersion(db, furnitureRow.tenant_id, furnitureRow.published_version_id);
        return { kind: "furniture", qrId, tenantId: furnitureRow.tenant_id, designVersionId: version.id, status: parseStatus(version.status) };
      }
      return null;
    },

    async create(tenantId, pieceTypeId) {
      assertTenant(tenantId);
      return db.transaction().execute(async (trx) => {
        await requireTenant(trx, tenantId);
        const piece = await trx
          .selectFrom("piece_type")
          .select(["id", "design_version_id"])
          .where("tenant_id", "=", tenantId)
          .where("id", "=", pieceTypeId)
          .executeTakeFirst();
        if (!piece) throw new ReferenciaDeOtroTenantError("el tipo de pieza");
        assertEditable(await requireVersion(trx, tenantId, piece.design_version_id));
        const id = deps.newQrId();
        if ((await firstQrTaken(trx, [id])) !== undefined) throw new QrDuplicadoError(id);
        const ordinals = await trx
          .selectFrom("qr_code")
          .select("ordinal")
          .where("tenant_id", "=", tenantId)
          .where("piece_type_id", "=", piece.id)
          .execute();
        await trx
          .insertInto("qr_code")
          .values({
            tenant_id: tenantId,
            id,
            piece_type_id: piece.id,
            design_version_id: piece.design_version_id,
            ordinal: Math.max(0, ...ordinals.map((row) => row.ordinal)) + 1,
            created_at: deps.now(),
            revoked_at: null,
          })
          .execute();
        return id;
      });
    },
  };

  const runs: RunRepository = {
    async save(tenantId, designVersionId, run) {
      assertTenant(tenantId);
      await db.transaction().execute(async (trx) => {
        await requireTenant(trx, tenantId);
        await requireVersion(trx, tenantId, designVersionId);
        const existing = await trx
          .selectFrom("engine_run")
          .select("id")
          .where("tenant_id", "=", tenantId)
          .where("design_version_id", "=", designVersionId)
          .where("engine_run_id", "=", run.engineRunId)
          .executeTakeFirst();
        if (existing) return;
        await trx.insertInto("engine_run").values(toEngineRunRow({ tenantId, id: deps.newId(), designVersionId, run, now: deps.now() })).execute();
      });
    },
    async get(tenantId, designVersionId, engineRunId) {
      assertTenant(tenantId);
      const row = await db
        .selectFrom("engine_run")
        .select(["engine_run_id", "document"])
        .where("tenant_id", "=", tenantId)
        .where("design_version_id", "=", designVersionId)
        .where("engine_run_id", "=", engineRunId)
        .executeTakeFirst();
      return row ? parseRunDocument(row) : null;
    },
  };

  return { tenants, furniture, qr, runs, projects, sessions, erpDocuments, close: () => db.destroy() };
}
