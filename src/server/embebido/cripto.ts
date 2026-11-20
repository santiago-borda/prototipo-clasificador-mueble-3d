// IE-4: token de sesión y cifrado del token del ERP (AES-256-GCM, node:crypto). Solo servidor.
// La cookie lleva un token aleatorio; la base guarda solo su sha256. El token del ERP se guarda cifrado con
// SESION_CLAVE y con el id de la sesión como dato asociado: un cifrado no sirve en otra sesión.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** 32 bytes aleatorios en base64url (43 caracteres). */
export function nuevoTokenDeSesion(): string {
  return randomBytes(32).toString("base64url");
}

export const FORMATO_TOKEN_SESION = /^[A-Za-z0-9_-]{43}$/;

/** Id de la sesión en la base: sha256 hex del token de la cookie. */
export function idDeSesion(tokenDeSesion: string): string {
  return createHash("sha256").update(tokenDeSesion).digest("hex");
}

export class ClaveDeSesionInvalidaError extends Error {
  constructor() {
    super("SESION_CLAVE tiene que ser 32 bytes en base64 (p. ej. `openssl rand -base64 32`).");
    this.name = "ClaveDeSesionInvalidaError";
  }
}

export class CifradoInvalidoError extends Error {
  constructor() {
    super("El token guardado no se pudo descifrar (otra clave, otra sesión o dato adulterado).");
    this.name = "CifradoInvalidoError";
  }
}

/** Clave de 32 bytes desde base64 o base64url. */
export function leerClave(raw: string): Buffer {
  const limpio = raw.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(limpio)) throw new ClaveDeSesionInvalidaError();
  const clave = Buffer.from(limpio.replaceAll("-", "+").replaceAll("_", "/"), "base64");
  if (clave.length !== 32) throw new ClaveDeSesionInvalidaError();
  return clave;
}

/** `v1.<iv>.<tag>.<cifrado>`, todo en base64url. */
export function cifrar(clave: Buffer, texto: string, asociado: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, iv);
  cifrador.setAAD(Buffer.from(asociado, "utf8"));
  const cifrado = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return ["v1", iv.toString("base64url"), cifrador.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
}

export function descifrar(clave: Buffer, valor: string, asociado: string): string {
  const partes = valor.split(".");
  if (partes.length !== 4 || partes[0] !== "v1") throw new CifradoInvalidoError();
  try {
    const [, iv, tag, cifrado] = partes.map((p) => Buffer.from(p, "base64url"));
    const descifrador = createDecipheriv("aes-256-gcm", clave, iv);
    descifrador.setAAD(Buffer.from(asociado, "utf8"));
    descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(cifrado), descifrador.final()]).toString("utf8");
  } catch {
    throw new CifradoInvalidoError();
  }
}
