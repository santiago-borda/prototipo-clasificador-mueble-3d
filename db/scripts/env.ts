// S2-D4 y S2-D5: la URL de la base llega por DATABASE_URL, sin valor por defecto, y solo se acepta una base local.
// Nunca se imprime la URL (lleva la clave): solo el host.

import { assertLocalDatabase } from "@/persistence/localGuard";
import { assertConfirmedRemoteDatabase } from "@/persistence/remoteGuard";

export function localDatabaseUrl(): { url: string; host: string } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (ver .env.example). Ejemplo: postgres://pfg:<clave>@127.0.0.1:5432/pfg");
  assertLocalDatabase(url); // BaseNoLocalError si el host no es localhost ni 127.0.0.1
  return { url, host: new URL(url).host };
}

/**
 * S2B-2 (docs/spec-s2b-base-remota-neon.md): para `db:migrate:remota` y `db:seed:remota`. DATABASE_URL tiene que
 * ser remota, pedir TLS y su host tiene que ser exactamente DB_REMOTA_HOST (la confirmación de quien lo corre).
 */
export function remoteDatabaseUrl(): { url: string; host: string } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL: la cadena de conexión de la base remota (sin pegarla en el repo ni en el chat).");
  const { host } = assertConfirmedRemoteDatabase(url, process.env.DB_REMOTA_HOST);
  return { url, host };
}
