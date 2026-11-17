// S2: la batería de contrato contra PostgreSQL (ADR-002, decisión 5). Cada prueba usa un esquema propio y lo borra.
// Sin TEST_DATABASE_URL se saltea y lo dice (como las pruebas del segundo fixture).

import { afterAll, describe, it } from "vitest";
import { createSqlPersistence } from "@/persistence/sql";
import { persistenceContract } from "./contract";
import { AVISO_SIN_BASE, createTestSchema, TEST_DATABASE_URL, type TestSchema } from "./postgres";

if (!TEST_DATABASE_URL) {
  describe("contrato de persistencia: PostgreSQL", () => {
    it.skip(AVISO_SIN_BASE, () => {});
  });
} else {
  const abiertos = new Set<TestSchema>();

  persistenceContract("PostgreSQL", async (overrides) => {
    const schema = await createTestSchema({ migrate: true });
    abiertos.add(schema);
    return {
      ...createSqlPersistence(schema.db, overrides),
      async close() {
        abiertos.delete(schema);
        await schema.drop();
      },
    };
  });

  // Si una prueba falló antes de cerrar, su esquema se borra acá.
  afterAll(async () => {
    for (const schema of abiertos) await schema.drop().catch(() => {});
  });
}
