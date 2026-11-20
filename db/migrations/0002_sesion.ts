// IE-4, IE-8, IE-9 (docs/spec-integracion-erp-minima.md): sesión propia del embebido, registro de los zips del ERP
// abiertos en el visor y unicidad del vínculo de proyecto. Mismas reglas que 0001 (B2: tenant_id en toda tabla y
// en toda clave foránea). Una migración aplicada no se edita: se agrega otra.
// IE-6 no pide nada: `tenant.erp_tenant_id` ya es único (0001, `tenant_erp_uq`).

import { MssqlAdapter, PostgresAdapter, sql, type Kysely, type RawBuilder } from "kysely";

/** Tipos que cambian con el motor. SQL Server, sin probar (ADR-002). */
function tiposDe(db: Kysely<unknown>): { fecha: "timestamptz" | "datetime"; largo: "text" | RawBuilder<unknown> } {
  const adapter = db.getExecutor().adapter;
  if (adapter instanceof PostgresAdapter) return { fecha: "timestamptz", largo: "text" };
  if (adapter instanceof MssqlAdapter) return { fecha: "datetime", largo: sql`varchar(max)` };
  throw new Error("Motor de base no previsto en la migración 0002.");
}

const ID = "varchar(64)";
const HASH = "varchar(80)";
const NOMBRE = "varchar(200)";

export async function up(db: Kysely<unknown>): Promise<void> {
  const t = tiposDe(db);
  const s = db.schema;

  // IE-9: un proyecto del ERP se vincula una sola vez por carpintería. En PostgreSQL, varios NULL no chocan
  // (los proyectos propios no tienen erp_project_id). SQL Server admite un solo NULL: revisar si se cambia de motor.
  await s.alterTable("project").addUniqueConstraint("project_erp_uq", ["tenant_id", "erp_project_id"]).execute();

  // IE-4: sesión. La clave es el sha256 del token de sesión (único en toda la base: es la puerta de entrada).
  await s
    .createTable("session")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", HASH, (c) => c.notNull())
    .addColumn("erp_user_id", NOMBRE, (c) => c.notNull())
    .addColumn("erp_tenant_id", NOMBRE, (c) => c.notNull())
    .addColumn("erp_token_encrypted", t.largo, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addColumn("expires_at", t.fecha, (c) => c.notNull())
    .addColumn("revoked_at", t.fecha)
    .addPrimaryKeyConstraint("session_pk", ["id"])
    .addForeignKeyConstraint("session_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .execute();

  // IE-8: zips del ERP abiertos en el visor (solo su sha256; el archivo no se guarda).
  await s
    .createTable("erp_document")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("project_id", ID, (c) => c.notNull())
    .addColumn("erp_document_id", NOMBRE, (c) => c.notNull())
    .addColumn("sha256", HASH, (c) => c.notNull())
    .addColumn("bytes", "integer", (c) => c.notNull())
    .addColumn("first_seen_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("erp_document_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("erp_document_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("erp_document_project_fk", ["tenant_id", "project_id"], "project", ["tenant_id", "id"])
    .addUniqueConstraint("erp_document_uq", ["tenant_id", "project_id", "erp_document_id", "sha256"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const s = db.schema;
  await s.dropTable("erp_document").execute();
  await s.dropTable("session").execute();
  await s.alterTable("project").dropConstraint("project_erp_uq").execute();
}
