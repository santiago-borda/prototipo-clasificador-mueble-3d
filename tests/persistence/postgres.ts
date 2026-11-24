// S2: ayuda para las pruebas contra PostgreSQL. Cada prueba usa un esquema propio y lo borra al terminar (spec §5).
// Solo corre si TEST_DATABASE_URL está definida, y solo contra una base local (misma guarda que db:migrate).
// DIAGNÓSTICO TEMPORAL (PB intermitentes, 23/11): application_name por archivo, log de errores de Kysely y
// pid/search_path de cada conexión en DIAG_LOG. Se revierte antes del arreglo.

import { appendFileSync } from "node:fs";
import { basename } from "node:path";
import { randomBytes } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect } from "vitest";
import { migrateToLatest } from "../../db/migrate";
import { assertLocalDatabase } from "@/persistence/localGuard";
import type { Database } from "@/persistence/sql/connection";

export const TEST_DATABASE_URL: string | undefined = process.env.TEST_DATABASE_URL || undefined;

export const AVISO_SIN_BASE = "se saltea: falta TEST_DATABASE_URL (levantá la base con npm run db:up y definila)";

export interface TestSchema {
  db: Kysely<Database>;
  schema: string;
  /** Borra el esquema y cierra las conexiones. */
  drop(): Promise<void>;
}

/** DIAG: nombre del archivo de prueba que llama. */
export function diagApp(): string {
  let p: string | undefined;
  try { p = expect.getState().testPath; } catch { p = undefined; }
  return (p ? basename(p) : "sin-archivo").slice(0, 60);
}

function diagLog(line: string): void {
  const f = process.env.DIAG_LOG;
  if (f) appendFileSync(f, `${new Date().toISOString()} ${line}\n`);
}

/** DIAG: igual que createDb, con application_name, log de errores y pid/esquemas por conexión. */
function diagDb(url: string, rol: string, schema?: string): Kysely<Database> {
  const app = `${diagApp()}:${rol}`;
  const pool = new Pool({
    connectionString: url,
    max: 5,
    application_name: app,
    ...(schema === undefined ? {} : { options: `-c search_path=${schema}` }),
  });
  pool.on("connect", (client) => {
    client.query("select pg_backend_pid() as pid, current_schemas(true)::text as s").then(
      (r) => diagLog(`CONNECT app=${app} schema=${schema ?? "-"} pid=${r.rows[0].pid} current_schemas=${r.rows[0].s}`),
      (e: Error) => diagLog(`CONNECT-ERR app=${app} ${e.message}`),
    );
  });
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    log(event) {
      if (event.level !== "error") return;
      const err = event.error as { code?: string; message?: string };
      diagLog(`KYSELY-ERROR app=${app} schema=${schema ?? "-"} code=${err.code} msg=${JSON.stringify(err.message)} sql=${JSON.stringify(event.query.sql.slice(0, 300))}`);
    },
  });
}

/** Esquema vacío y propio. Con `migrate`, ya con las tablas. */
export async function createTestSchema(options: { migrate: boolean }): Promise<TestSchema> {
  if (!TEST_DATABASE_URL) throw new Error(AVISO_SIN_BASE);
  assertLocalDatabase(TEST_DATABASE_URL);
  const url = TEST_DATABASE_URL;
  const schema = `test_${randomBytes(8).toString("hex")}`;

  const admin = diagDb(url, "admin");
  await sql`create schema ${sql.id(schema)}`.execute(admin);
  await admin.destroy();

  const db = diagDb(url, "esquema", schema);
  if (options.migrate) await migrateToLatest(db as Kysely<unknown>, { schema });
  return {
    db,
    schema,
    async drop() {
      await db.destroy();
      const cleaner = diagDb(url, "drop");
      await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(cleaner);
      await cleaner.destroy();
    },
  };
}
