// S2: conexión a la base. Con `db/`, es el único lugar que importa kysely y pg (S2-D2, prueba PB-13).
// El dialecto se elige acá (ADR-002, decisión 2): hoy PostgreSQL; SQL Server queda preparado y sin probar.
// La URL llega siempre de afuera (S2-D4): este módulo no lee variables de entorno ni tiene valores por defecto.

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type {
  DesignVersionRow,
  EngineRunRow,
  FurnitureRow,
  ListingRow,
  ModuleRow,
  PieceTypeRow,
  ProjectRow,
  QrCodeRow,
  StoredFileRow,
  TenantRow,
} from "../rows";

/** Las tablas de S2, con las filas de `rows.ts`. */
export interface Database {
  tenant: TenantRow;
  project: ProjectRow;
  furniture: FurnitureRow;
  design_version: DesignVersionRow;
  module: ModuleRow;
  piece_type: PieceTypeRow;
  qr_code: QrCodeRow;
  stored_file: StoredFileRow;
  listing: ListingRow;
  engine_run: EngineRunRow;
}

export interface ConnectionOptions {
  /** Esquema de PostgreSQL donde vive todo (las pruebas usan uno propio por corrida). Por defecto, el de la base. */
  schema?: string;
}

const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/** Abre un pool. Quien lo abre lo cierra con `db.destroy()`. */
export function createDb(databaseUrl: string, options: ConnectionOptions = {}): Kysely<Database> {
  if (options.schema !== undefined && !SCHEMA_NAME.test(options.schema)) throw new Error("Nombre de esquema inválido.");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    ...(options.schema === undefined ? {} : { options: `-c search_path=${options.schema}` }),
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
