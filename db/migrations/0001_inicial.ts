// S2: migración inicial. Las diez tablas marcadas «S2» en docs/modelo-de-datos.md §2; las columnas son las de
// src/persistence/rows.ts. Subconjunto común de SQL (S2-D6, ADR-002 decisión 3): ids como texto generados en la
// aplicación, documentos como texto JSON, fechas UTC, medidas en doble precisión, sin secuencias ni tipos propios.
// Lo único propio de un motor está en `tiposDe`, con una rama por dialecto.
//
// Reglas (docs/spec-s2-base-de-datos.md §4):
//   B2  toda tabla salvo `tenant` lleva `tenant_id NOT NULL`, y toda clave foránea lo incluye.
//   B3  (tenant_id, design_version_id, code) único.
//   B4  `qr_code.id` único en toda la base (es su clave primaria).
// La inmutabilidad de lo publicado (B5) la aplican los repositorios, no la base.

import { MssqlAdapter, PostgresAdapter, type Kysely } from "kysely";

type Tipo = "timestamptz" | "datetime" | "boolean" | "text" | "varchar(8000)";

/** Tipos que cambian con el motor. SQL Server queda preparado y sin probar (ADR-002). */
function tiposDe(db: Kysely<unknown>): { fecha: Tipo; booleano: Tipo; documento: Tipo } {
  const adapter = db.getExecutor().adapter;
  if (adapter instanceof PostgresAdapter) return { fecha: "timestamptz", booleano: "boolean", documento: "text" };
  // SQL Server: sin probar. Punto de partida a revisar si se cambia de motor.
  if (adapter instanceof MssqlAdapter) return { fecha: "datetime", booleano: "boolean", documento: "varchar(8000)" };
  throw new Error("Motor de base no previsto en la migración inicial.");
}

const ID = "varchar(64)"; // UUID (36)
const QR = "varchar(128)"; // QR opaco (26) o qrId heredado del prototipo
const HASH = "varchar(80)"; // "sha256:" + 64 hex
const CORTO = "varchar(64)";
const NOMBRE = "varchar(200)";
const LARGO = "varchar(1000)";

export async function up(db: Kysely<unknown>): Promise<void> {
  const t = tiposDe(db);
  const s = db.schema;

  // 1. Carpintería
  await s
    .createTable("tenant")
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("erp_tenant_id", NOMBRE)
    .addColumn("name", NOMBRE, (c) => c.notNull())
    .addColumn("enabled", t.booleano, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("tenant_pk", ["id"])
    .addUniqueConstraint("tenant_erp_uq", ["erp_tenant_id"])
    .execute();

  // 2. Proyecto
  await s
    .createTable("project")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("erp_project_id", NOMBRE)
    .addColumn("name", NOMBRE, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("project_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("project_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .execute();

  // 3. Mueble. La clave foránea a su versión publicada se agrega después de crear `design_version`.
  await s
    .createTable("furniture")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("project_id", ID, (c) => c.notNull())
    .addColumn("erp_furniture_id", NOMBRE)
    .addColumn("legacy_id", QR)
    .addColumn("legacy_qr_id", QR)
    .addColumn("name", NOMBRE, (c) => c.notNull())
    .addColumn("published_version_id", ID)
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("furniture_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("furniture_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("furniture_project_fk", ["tenant_id", "project_id"], "project", ["tenant_id", "id"])
    .addUniqueConstraint("furniture_legacy_qr_uq", ["legacy_qr_id"])
    .execute();

  // 9. Archivo (solo la tabla; el uso es de S3)
  await s
    .createTable("stored_file")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("sha256", HASH, (c) => c.notNull())
    .addColumn("bytes", "integer", (c) => c.notNull())
    .addColumn("content_type", NOMBRE, (c) => c.notNull())
    .addColumn("kind", CORTO, (c) => c.notNull())
    .addColumn("original_name", LARGO, (c) => c.notNull())
    .addColumn("storage_key", LARGO, (c) => c.notNull())
    .addColumn("uploaded_by", NOMBRE, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("stored_file_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("stored_file_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addUniqueConstraint("stored_file_sha256_uq", ["tenant_id", "sha256"])
    .execute();

  // 4. Versión de diseño
  await s
    .createTable("design_version")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("public_id", QR, (c) => c.notNull())
    .addColumn("furniture_id", ID, (c) => c.notNull())
    .addColumn("number", "integer", (c) => c.notNull())
    .addColumn("status", CORTO, (c) => c.notNull())
    .addColumn("label", CORTO, (c) => c.notNull())
    .addColumn("name", NOMBRE, (c) => c.notNull())
    .addColumn("model_id", HASH)
    .addColumn("model_file_id", ID)
    .addColumn("model_url", LARGO)
    .addColumn("texture_base_url", LARGO)
    .addColumn("dim_x_mm", "double precision", (c) => c.notNull())
    .addColumn("dim_y_mm", "double precision", (c) => c.notNull())
    .addColumn("dim_z_mm", "double precision", (c) => c.notNull())
    .addColumn("tolerance_mm", "double precision", (c) => c.notNull())
    .addColumn("edge_band_type", CORTO, (c) => c.notNull())
    .addColumn("edge_band_width_mm", "double precision", (c) => c.notNull())
    .addColumn("edge_band_thickness_mm", "double precision", (c) => c.notNull())
    .addColumn("edge_band_status", CORTO, (c) => c.notNull())
    .addColumn("edge_band_note", LARGO)
    .addColumn("created_by", NOMBRE, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addColumn("published_by", NOMBRE)
    .addColumn("published_at", t.fecha)
    .addPrimaryKeyConstraint("design_version_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("design_version_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("design_version_furniture_fk", ["tenant_id", "furniture_id"], "furniture", ["tenant_id", "id"])
    .addForeignKeyConstraint("design_version_model_file_fk", ["tenant_id", "model_file_id"], "stored_file", ["tenant_id", "id"])
    .addUniqueConstraint("design_version_public_uq", ["public_id"])
    .addUniqueConstraint("design_version_number_uq", ["tenant_id", "furniture_id", "number"])
    .execute();

  await s
    .alterTable("furniture")
    .addForeignKeyConstraint("furniture_published_fk", ["tenant_id", "published_version_id"], "design_version", ["tenant_id", "id"])
    .execute();

  // 5. Módulo. La unicidad (tenant, versión, id) permite que un tipo de pieza solo apunte a un módulo de SU versión.
  await s
    .createTable("module")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("design_version_id", ID, (c) => c.notNull())
    .addColumn("legacy_id", QR)
    .addColumn("legacy_qr_id", QR)
    .addColumn("name", NOMBRE, (c) => c.notNull())
    .addColumn("position", "integer", (c) => c.notNull())
    .addPrimaryKeyConstraint("module_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("module_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("module_version_fk", ["tenant_id", "design_version_id"], "design_version", ["tenant_id", "id"])
    .addUniqueConstraint("module_version_id_uq", ["tenant_id", "design_version_id", "id"])
    .addUniqueConstraint("module_legacy_qr_uq", ["legacy_qr_id"])
    .execute();

  // 6. Tipo de pieza
  await s
    .createTable("piece_type")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("design_version_id", ID, (c) => c.notNull())
    .addColumn("module_id", ID)
    .addColumn("position", "integer", (c) => c.notNull())
    .addColumn("code", CORTO, (c) => c.notNull())
    .addColumn("name", NOMBRE, (c) => c.notNull())
    .addColumn("length_mm", "double precision", (c) => c.notNull())
    .addColumn("width_mm", "double precision", (c) => c.notNull())
    .addColumn("thickness_mm", "double precision", (c) => c.notNull())
    .addColumn("material", NOMBRE, (c) => c.notNull())
    .addColumn("quantity", "integer", (c) => c.notNull())
    .addColumn("edge_banding", NOMBRE)
    .addColumn("notes", LARGO)
    .addPrimaryKeyConstraint("piece_type_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("piece_type_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("piece_type_version_fk", ["tenant_id", "design_version_id"], "design_version", ["tenant_id", "id"])
    .addForeignKeyConstraint(
      "piece_type_module_fk",
      ["tenant_id", "design_version_id", "module_id"],
      "module",
      ["tenant_id", "design_version_id", "id"],
    )
    .addUniqueConstraint("piece_type_code_uq", ["tenant_id", "design_version_id", "code"])
    .addUniqueConstraint("piece_type_version_id_uq", ["tenant_id", "design_version_id", "id"])
    .execute();

  // 8. QR. Su id es el texto del QR: único en toda la base.
  await s
    .createTable("qr_code")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", QR, (c) => c.notNull())
    .addColumn("piece_type_id", ID, (c) => c.notNull())
    .addColumn("design_version_id", ID, (c) => c.notNull())
    .addColumn("ordinal", "integer", (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addColumn("revoked_at", t.fecha)
    .addPrimaryKeyConstraint("qr_code_pk", ["id"])
    .addForeignKeyConstraint("qr_code_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint(
      "qr_code_piece_type_fk",
      ["tenant_id", "design_version_id", "piece_type_id"],
      "piece_type",
      ["tenant_id", "design_version_id", "id"],
    )
    .addUniqueConstraint("qr_code_ordinal_uq", ["tenant_id", "piece_type_id", "ordinal"])
    .execute();

  // 10. Listado (solo la tabla)
  await s
    .createTable("listing")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("design_version_id", ID, (c) => c.notNull())
    .addColumn("source", CORTO, (c) => c.notNull())
    .addColumn("source_file_id", ID)
    .addColumn("status", CORTO, (c) => c.notNull())
    .addColumn("listado_id", HASH)
    .addColumn("document", t.documento, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("listing_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("listing_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("listing_version_fk", ["tenant_id", "design_version_id"], "design_version", ["tenant_id", "id"])
    .addForeignKeyConstraint("listing_source_file_fk", ["tenant_id", "source_file_id"], "stored_file", ["tenant_id", "id"])
    .execute();

  // 11. Corrida del motor
  await s
    .createTable("engine_run")
    .addColumn("tenant_id", ID, (c) => c.notNull())
    .addColumn("id", ID, (c) => c.notNull())
    .addColumn("design_version_id", ID, (c) => c.notNull())
    .addColumn("engine_run_id", HASH, (c) => c.notNull())
    .addColumn("model_id", HASH, (c) => c.notNull())
    .addColumn("listado_id", HASH, (c) => c.notNull())
    .addColumn("passes", "integer", (c) => c.notNull())
    .addColumn("document", t.documento, (c) => c.notNull())
    .addColumn("created_at", t.fecha, (c) => c.notNull())
    .addPrimaryKeyConstraint("engine_run_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint("engine_run_tenant_fk", ["tenant_id"], "tenant", ["id"])
    .addForeignKeyConstraint("engine_run_version_fk", ["tenant_id", "design_version_id"], "design_version", ["tenant_id", "id"])
    .addUniqueConstraint("engine_run_uq", ["tenant_id", "design_version_id", "engine_run_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const s = db.schema;
  await s.alterTable("furniture").dropConstraint("furniture_published_fk").execute();
  const tablas = ["engine_run", "listing", "qr_code", "piece_type", "module", "design_version", "stored_file", "furniture", "project", "tenant"];
  for (const tabla of tablas) await s.dropTable(tabla).execute();
}
