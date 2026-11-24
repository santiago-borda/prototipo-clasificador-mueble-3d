// IE-2, IE-9, IE-10 (docs/spec-integracion-erp-minima.md v0.3): sesión propia, proyectos y trabajos que envía el ERP
// y almacén de archivos. Mismas reglas que 0001 (B2: tenant_id en toda tabla y en toda clave foránea).
// Una migración aplicada no se edita: se agrega otra. Esta reemplazó a `0002_sesion` (v0.2) antes de aplicarse fuera
// de una base local de prueba: si una base local tiene `0002_sesion`, hay que recrearla (ver CLAUDE.md).
// `tenant.erp_tenant_id` ya es único desde 0001 (`tenant_erp_uq`): IE-9 no pide nada más de `tenant`.
// La sesión **no** guarda el token del ERP (contrato UCP v1 §1).

import { MssqlAdapter, PostgresAdapter, sql, type Kysely, type RawBuilder } from "kysely";

/** Tipos que cambian con el motor. SQL Server, sin probar (ADR-002). */
function tiposDe(db: Kysely<unknown>): { fecha: "timestamptz" | "datetime"; binario: RawBuilder<unknown> } {
  const adapter = db.getExecutor().adapter;
  if (adapter instanceof PostgresAdapter) return { fecha: "timestamptz", binario: sql`bytea` };
  if (adapter instanceof MssqlAdapter) return { fecha: "datetime", binario: sql`varbinary(max)` };
  throw new Error("Motor de base no previsto en la migración 0002.");
}

const ID = "varchar(64)";
const HASH = "varchar(80)";
const CORTO = "varchar(40)";
const NOMBRE = "varchar(200)";
const LARGO = "varchar(2000)";

export async function up(db: Kysely<unknown>): Promise<void> {
  const t = tiposDe(db);
  const s = db.schema;

  // IE-9: proyecto del ERP. `erp_project_id` (0001) guarda `proyecto.uuid`; se suman código y fecha de entrega.
  // En PostgreSQL varios NULL no chocan en el único (los proyectos propios no tienen erp_project_id).
  // SQL Server admite un solo NULL: revisar si se cambia de motor.
  await s.alterTable("project").addColumn("erp_code", NOMBRE).execute();
  await s.alterTable("project").addColumn("delivery_date", "varchar(10)").execute();
  await s.alterTable("project").addUniqueConstraint("project_erp_uq", ["tenant_id", "erp_project_id"]).execute();

  // IE-2: sesión. La clave es el sha256 del token de sesión (único en toda la base: es la puerta de entrada).
  await s
    .createTable("session")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", HASH, (c) => c.notNull())
    .addColumn("erp_user_id", NOMBRE, (c) => c.notNull())
    .addColumn("erp_tenant_id", NOMBRE, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addColumn("expires_at", t.fecha, (c) => c.notNull())
    .addColumn("revoked_at", t.fecha)
    .addPrimaryKeyConstraint("session_pk", ["id"])
    .addForeignKeyConstraint("session_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .execute();

  // IE-10: contenido de los archivos, por carpintería y sha256 (ASUMIDO: en la base hasta decidir S3).
  await s
    .createTable("file_content")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("sha256", HASH, (c) => c.notNull())
    .addColumn("bytes", "integer", (c) => c.notNull())
    .addColumn("content", t.binario, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("file_content_pk", ["tenant_id", "sha256"])
    .addForeignKeyConstraint("file_content_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .execute();

  // IE-9: trabajo. (tenant_id, envio_uuid) único: idempotencia de POST /api/trabajos. Los sha256 son los que declaró
  // el ERP; el archivo está en file_content solo si el trabajo llegó a `success` (sin clave foránea a propósito).
  await s
    .createTable("job")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("envio_uuid", ID, (c) => c.notNull())
    .addColumn("project_id", ID, (c) => c.notNull())
    .addColumn("status", CORTO, (c) => c.notNull())
    .addColumn("message", LARGO)
    .addColumn("model_sha256", HASH, (c) => c.notNull())
    .addColumn("model_version", "integer", (c) => c.notNull())
    .addColumn("model_name", NOMBRE, (c) => c.notNull())
    .addColumn("csv_sha256", HASH, (c) => c.notNull())
    .addColumn("csv_version", "integer", (c) => c.notNull())
    .addColumn("csv_name", NOMBRE, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addColumn("updated_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("job_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("job_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("job_project_fk", ["tenant_id", "project_id"], "project", ["tenant_id", "id"])
    .addUniqueConstraint("job_envio_uq", ["tenant_id", "envio_uuid"])
    .addUniqueConstraint("job_id_uq", ["id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const s = db.schema;
  await s.dropTable("job").execute();
  await s.dropTable("file_content").execute();
  await s.dropTable("session").execute();
  await s.alterTable("project").dropConstraint("project_erp_uq").execute();
  await s.alterTable("project").dropColumn("delivery_date").execute();
  await s.alterTable("project").dropColumn("erp_code").execute();
}
