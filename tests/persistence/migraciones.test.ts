// S2: PB-1 (B1, migraciones idempotentes) y PB-2 (B2, tenant_id en toda tabla y en toda clave foránea).
// Contra PostgreSQL; sin TEST_DATABASE_URL se saltea y lo dice.

import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateToLatest } from "../../db/migrate";
import { down } from "../../db/migrations/0001_inicial";
import { down as down0002 } from "../../db/migrations/0002_sesion";
import { ALL_TABLES } from "../../db/migrations";
import { AVISO_SIN_BASE, createTestSchema, TEST_DATABASE_URL, type TestSchema } from "./postgres";

describe.skipIf(TEST_DATABASE_URL)("migraciones sin base", () => {
  it.skip(AVISO_SIN_BASE, () => {});
});

describe.skipIf(!TEST_DATABASE_URL)("migraciones (PostgreSQL)", () => {
  let t: TestSchema;
  let aplicadas: string[];

  beforeAll(async () => {
    t = await createTestSchema({ migrate: false });
    aplicadas = await migrateToLatest(t.db as Kysely<unknown>, { schema: t.schema });
  });
  afterAll(async () => {
    await t?.drop();
  });

  const tablas = async (): Promise<string[]> => {
    const { rows } = await sql<{ table_name: string }>`
      select table_name from information_schema.tables where table_schema = ${t.schema} order by table_name`.execute(t.db);
    return rows.map((r) => r.table_name).filter((name) => !name.startsWith("kysely_"));
  };

  // Enmendada por la integración con el ERP (0002_sesion): diez tablas de S2 más session y erp_document.
  it("PB-1 (B1): una base vacía queda con todas las tablas, y migrar de nuevo no aplica nada", async () => {
    expect(aplicadas).toEqual(["0001_inicial", "0002_sesion"]);
    expect(await tablas()).toEqual([...ALL_TABLES].sort());
    expect(await migrateToLatest(t.db as Kysely<unknown>, { schema: t.schema })).toEqual([]);
    expect(await tablas()).toEqual([...ALL_TABLES].sort());
  });

  it("IE-9: (tenant_id, erp_project_id) es único en project", async () => {
    const { rows } = await sql<{ conname: string }>`
      select c.conname from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'u' and n.nspname = ${t.schema} and c.conname = 'project_erp_uq'`.execute(t.db);
    expect(rows).toHaveLength(1);
  });

  it("PB-2 (B2): toda tabla salvo tenant tiene tenant_id NOT NULL", async () => {
    const { rows } = await sql<{ table_name: string; is_nullable: string }>`
      select table_name, is_nullable from information_schema.columns
      where table_schema = ${t.schema} and column_name = 'tenant_id' order by table_name`.execute(t.db);
    expect(rows.map((r) => r.table_name)).toEqual(ALL_TABLES.filter((name) => name !== "tenant").sort());
    expect(rows.filter((r) => r.is_nullable !== "NO")).toEqual([]);
  });

  it("PB-2 (B2): toda clave foránea incluye tenant_id, y las que no van a tenant apuntan a (tenant_id, ...)", async () => {
    const { rows } = await sql<{ tabla: string; nombre: string; columnas: string[]; destino: string; columnas_destino: string[] }>`
      select c.conrelid::regclass::text as tabla, c.conname as nombre, c.confrelid::regclass::text as destino,
        array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum order by k.ord) as columnas,
        array(select a.attname::text from unnest(c.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum order by k.ord) as columnas_destino
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and n.nspname = ${t.schema} order by 1, 2`.execute(t.db);

    expect(rows.length).toBeGreaterThanOrEqual(ALL_TABLES.length - 1);
    for (const fk of rows) {
      expect(fk.columnas[0], fk.nombre).toBe("tenant_id");
      if (fk.destino === "tenant") expect(fk.columnas_destino, fk.nombre).toEqual(["id"]);
      else expect(fk.columnas_destino[0], fk.nombre).toBe("tenant_id");
    }
    // Cada tabla con tenant_id lo ata a `tenant`.
    const aTenant = rows.filter((fk) => fk.destino === "tenant").map((fk) => fk.tabla).sort();
    expect(aTenant).toEqual(ALL_TABLES.filter((name) => name !== "tenant").sort());
  });

  it("las migraciones se pueden deshacer (0002 y después 0001) en una base sin datos", async () => {
    const otro = await createTestSchema({ migrate: true });
    try {
      await down0002(otro.db as Kysely<unknown>);
      await down(otro.db as Kysely<unknown>);
      const { rows } = await sql<{ n: string }>`
        select count(*)::text as n from information_schema.tables
        where table_schema = ${otro.schema} and table_name not like 'kysely_%'`.execute(otro.db);
      expect(rows[0].n).toBe("0");
    } finally {
      await otro.drop();
    }
  });
});
