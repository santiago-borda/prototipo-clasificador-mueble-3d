// S2: corre las migraciones pendientes (B1). Quien llama es responsable de la guarda de base local (S2-D5):
// el script `db:migrate` y las pruebas llaman a `assertLocalDatabase` antes de conectarse.

import { Migrator, type Kysely } from "kysely";
import { migrations } from "./migrations";

/**
 * `schema`: el mismo esquema con el que se abrió la conexión (`createDb(url, { schema })`), si se usó uno.
 * Aplica lo pendiente y devuelve los nombres aplicados en esta corrida (vacío si no había nada). */
export async function migrateToLatest(db: Kysely<unknown>, options: { schema?: string } = {}): Promise<string[]> {
  // Con un esquema propio hay que decírselo al migrador: si no, busca sus tablas de control en cualquier esquema.
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    ...(options.schema === undefined ? {} : { migrationTableSchema: options.schema }),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return (results ?? []).filter((r) => r.status === "Success").map((r) => r.migrationName);
}
