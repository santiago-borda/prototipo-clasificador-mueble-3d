// S2: ayuda para las pruebas contra PostgreSQL. Cada prueba usa un esquema propio y lo borra al terminar (spec §5).
// Solo corre si TEST_DATABASE_URL está definida, y solo contra una base local (misma guarda que db:migrate).

import { randomBytes } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { migrateToLatest } from "../../db/migrate";
import { assertLocalDatabase } from "@/persistence/localGuard";
import { createDb, type Database } from "@/persistence/sql/connection";

export const TEST_DATABASE_URL: string | undefined = process.env.TEST_DATABASE_URL || undefined;

export const AVISO_SIN_BASE = "se saltea: falta TEST_DATABASE_URL (levantá la base con npm run db:up y definila)";

export interface TestSchema {
  db: Kysely<Database>;
  schema: string;
  /** Borra el esquema y cierra las conexiones. */
  drop(): Promise<void>;
}

/** Clave del advisory lock que serializa el DDL de las pruebas entre archivos (y procesos) de vitest. */
const CLAVE_DDL = 0x50464744;

/**
 * Corre `fn` con el DDL de las pruebas serializado entre archivos. El migrador de Kysely pregunta si existe su tabla
 * con `introspection.getTables()`, que lee el catálogo de TODOS los esquemas y llama a `pg_get_serial_sequence` con
 * cada nombre: si otro archivo borra en ese momento su esquema, una tabla o una columna, la consulta falla con
 * «schema/relation/column … does not exist» de un esquema ajeno (diagnóstico del 23/11, .diag/pb-intermitentes.md).
 * Toda creación, migración, deshacer y borrado de un esquema de prueba pasa por acá. No se anida.
 */
export async function conDdlSerializado<T>(fn: () => Promise<T>): Promise<T> {
  if (!TEST_DATABASE_URL) throw new Error(AVISO_SIN_BASE);
  assertLocalDatabase(TEST_DATABASE_URL);
  const lock = createDb(TEST_DATABASE_URL);
  try {
    return await lock.connection().execute(async (conn) => {
      await sql`select pg_advisory_lock(${CLAVE_DDL})`.execute(conn);
      try {
        return await fn();
      } finally {
        await sql`select pg_advisory_unlock(${CLAVE_DDL})`.execute(conn);
      }
    });
  } finally {
    await lock.destroy();
  }
}

/** Esquema vacío y propio. Con `migrate`, ya con las tablas. */
export async function createTestSchema(options: { migrate: boolean }): Promise<TestSchema> {
  if (!TEST_DATABASE_URL) throw new Error(AVISO_SIN_BASE);
  assertLocalDatabase(TEST_DATABASE_URL);
  const url = TEST_DATABASE_URL;
  const schema = `test_${randomBytes(8).toString("hex")}`;

  const db = await conDdlSerializado(async () => {
    const admin = createDb(url);
    await sql`create schema ${sql.id(schema)}`.execute(admin);
    await admin.destroy();

    const conEsquema = createDb(url, { schema });
    if (options.migrate) await migrateToLatest(conEsquema as Kysely<unknown>, { schema });
    return conEsquema;
  });
  return {
    db,
    schema,
    async drop() {
      await db.destroy();
      await conDdlSerializado(async () => {
        const cleaner = createDb(url);
        await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(cleaner);
        await cleaner.destroy();
      });
    },
  };
}
