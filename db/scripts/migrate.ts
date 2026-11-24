// npm run db:migrate — aplica las migraciones pendientes en la base local de DATABASE_URL (B1, B10).
// npm run db:migrate:remota — lo mismo en una base remota confirmada con DB_REMOTA_HOST y con TLS (S2B-2).

import type { Kysely } from "kysely";
import { createDb } from "@/persistence/sql/connection";
import { migrateToLatest } from "../migrate";
import { localDatabaseUrl, remoteDatabaseUrl } from "./env";

async function main(): Promise<void> {
  const { url, host } = process.argv.includes("--remota") ? remoteDatabaseUrl() : localDatabaseUrl();
  const db = createDb(url);
  try {
    const applied = await migrateToLatest(db as Kysely<unknown>);
    console.log(applied.length === 0 ? `Base ${host}: sin migraciones pendientes.` : `Base ${host}: aplicadas ${applied.join(", ")}.`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "Error desconocido al migrar.");
  process.exitCode = 1;
});
