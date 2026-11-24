// IE-2: token de la sesión propia. La cookie lleva un token aleatorio; la base guarda solo su sha256. Solo servidor.
// No hay nada cifrado: el token del ERP no se guarda (contrato UCP v1 §1), así que no hace falta una clave.

import { createHash, randomBytes } from "node:crypto";

/** 32 bytes aleatorios en base64url (43 caracteres). */
export function nuevoTokenDeSesion(): string {
  return randomBytes(32).toString("base64url");
}

export const FORMATO_TOKEN_SESION = /^[A-Za-z0-9_-]{43}$/;

/** Id de la sesión en la base: sha256 hex del token de la cookie. */
export function idDeSesion(tokenDeSesion: string): string {
  return createHash("sha256").update(tokenDeSesion).digest("hex");
}
