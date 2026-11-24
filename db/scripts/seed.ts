// npm run db:seed — carga el primer fixture en la base local de DATABASE_URL (B10). Correr antes db:migrate.
// npm run db:seed:remota — lo mismo en una base remota confirmada con DB_REMOTA_HOST y con TLS (S2B-2).

import { createDb } from "@/persistence/sql/connection";
import { createSqlPersistence } from "@/persistence/sql";
import { seedOlmo } from "../seed";
import { localDatabaseUrl, remoteDatabaseUrl } from "./env";

async function main(): Promise<void> {
  const { url, host } = process.argv.includes("--remota") ? remoteDatabaseUrl() : localDatabaseUrl();
  const persistence = createSqlPersistence(createDb(url));
  try {
    const result = await seedOlmo(persistence);
    const what = result.created ? "cargado" : "ya estaba cargado";
    console.log(
      `Base ${host}: primer fixture ${what} en la carpintería "${result.tenantId}" ` +
        `(${result.pieceTypes} tipos de pieza, ${result.physicalPieces} piezas físicas; versión ${result.designVersionId}).`,
    );
  } finally {
    await persistence.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "Error desconocido al cargar los datos.");
  process.exitCode = 1;
});
