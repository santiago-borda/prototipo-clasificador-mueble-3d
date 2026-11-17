// S2-D4 y S2-D5: la URL de la base llega por DATABASE_URL, sin valor por defecto, y solo se acepta una base local.
// Nunca se imprime la URL (lleva la clave): solo el host.

import { assertLocalDatabase } from "@/persistence/localGuard";

export function localDatabaseUrl(): { url: string; host: string } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (ver .env.example). Ejemplo: postgres://pfg:<clave>@127.0.0.1:5432/pfg");
  assertLocalDatabase(url); // BaseNoLocalError si el host no es localhost ni 127.0.0.1
  return { url, host: new URL(url).host };
}
