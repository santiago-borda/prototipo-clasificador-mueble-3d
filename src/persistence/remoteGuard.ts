// S2B-1 y S2B-2 (docs/spec-s2b-base-remota-neon.md): guarda para migrar o sembrar una base REMOTA (la de la demo, en
// Neon). No reemplaza a `assertLocalDatabase`, que sigue sin bandera para `db:migrate` y `db:seed`: esto es otro
// camino, con otros scripts (`db:migrate:remota`, `db:seed:remota`), que exige que quien lo corre escriba el host
// exacto de la base en DB_REMOTA_HOST (la confirmación de la acción) y que la conexión vaya cifrada.
// Ningún error lleva la URL (trae la clave): solo el host.

import { BaseRemotaNoConfirmadaError } from "./ports";

const LOCAL_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];
/** `sslmode` que obligan a cifrar la conexión. `disable`, `allow` y `prefer` (o ninguno) no alcanzan. */
const SSL_SEGURO: readonly string[] = ["require", "verify-ca", "verify-full"];
/**
 * S2B-I5 (revisión del 21/11): parámetros de la query que se aceptan, cada uno UNA vez. Cualquier otro se rechaza:
 * `pg` obedece `host` / `hostaddr` de la query por encima del host de la URL (la confirmación dejaría de valer),
 * se queda con el último `sslmode` repetido, y `uselibpqcompat` o `ssl=0` cambian cómo se cifra.
 */
const PARAMETROS: readonly string[] = ["sslmode", "channel_binding", "application_name", "connect_timeout"];

/**
 * Devuelve el host si la URL es de una base remota, el host coincide con el confirmado (sin distinguir mayúsculas) y
 * pide TLS. Si no, `BaseRemotaNoConfirmadaError` con el motivo.
 */
export function assertConfirmedRemoteDatabase(databaseUrl: string, confirmedHost: string | undefined): { host: string } {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new BaseRemotaNoConfirmadaError("(URL ilegible)", "url-ilegible");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new BaseRemotaNoConfirmadaError("(otro protocolo)", "url-ilegible");
  const host = url.hostname.toLowerCase();
  if (host === "") throw new BaseRemotaNoConfirmadaError("(sin host)", "url-ilegible");
  const claves = [...url.searchParams.keys()];
  if (claves.some((k) => !PARAMETROS.includes(k)) || new Set(claves).size !== claves.length) {
    throw new BaseRemotaNoConfirmadaError(host, "parametro-no-permitido");
  }
  if (LOCAL_HOSTS.includes(host)) throw new BaseRemotaNoConfirmadaError(host, "es-local");
  const confirmado = (confirmedHost ?? "").trim().toLowerCase();
  if (confirmado === "") throw new BaseRemotaNoConfirmadaError(host, "sin-confirmar");
  if (confirmado !== host) throw new BaseRemotaNoConfirmadaError(host, "host-distinto");
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode === null || !SSL_SEGURO.includes(sslmode)) throw new BaseRemotaNoConfirmadaError(host, "sin-tls");
  return { host };
}
