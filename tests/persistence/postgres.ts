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

/** Esquema vacío y propio. Con `migrate`, ya con las tablas. */
export async function createTestSchema(options: { migrate: boolean }): Promise<TestSchema> {
  if (!TEST_DATABASE_URL) throw new Error(AVISO_SIN_BASE);
  assertLocalDatabase(TEST_DATABASE_URL);
  const url = TEST_DATABASE_URL;
  const schema = `test_${randomBytes(8).toString("hex")}`;

  const admin = createDb(url);
  await sql`create schema ${sql.id(schema)}`.execute(admin);
  await admin.destroy();

  const db = createDb(url, { schema });
  if (options.migrate) await migrateToLatest(db as Kysely<unknown>, { schema });
  return {
    db,
    schema,
    async drop() {
      await db.destroy();
      const cleaner = createDb(url);
      await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(cleaner);
      await cleaner.destroy();
    },
  };
}
