// S2: lista de migraciones, en orden por nombre. Se importan a mano (no se leen de la carpeta) para que corran igual
// en los scripts, en las pruebas y en un build. Una migración aplicada no se edita: se agrega otra.

import type { Migration } from "kysely";
import * as inicial from "./0001_inicial";

export const migrations: Record<string, Migration> = {
  "0001_inicial": inicial,
};

/** Tablas que crea S2 (docs/modelo-de-datos.md §2, columna «Sesión»). */
export const S2_TABLES = [
  "tenant",
  "project",
  "furniture",
  "design_version",
  "module",
  "piece_type",
  "qr_code",
  "stored_file",
  "listing",
  "engine_run",
] as const;
