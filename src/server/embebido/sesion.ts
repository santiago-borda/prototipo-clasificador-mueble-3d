// IE-3 a IE-6: sesión propia del embebido. Solo servidor.
// El token del ERP se valida llamando a whoami (nunca se decodifica el JWT para autorizar), se guarda cifrado y
// solo se descifra para reenviarlo al ERP. El tenant sale de whoami, nunca del navegador.

import type { EmbeddedSession, Persistence } from "@/persistence/ports";
import type { ClienteErp } from "@/server/erp/cliente";
import { CifradoInvalidoError, cifrar, descifrar, FORMATO_TOKEN_SESION, idDeSesion, nuevoTokenDeSesion } from "./cripto";
import type { Registro } from "./registro";

export interface DepsEmbebido {
  persistence: Persistence;
  erp: ClienteErp;
  clave: Buffer;
  duracionSesionMs: number;
  origenes: readonly string[];
  ahora: () => Date;
  registrar: Registro;
  /** Para las pruebas. Por defecto, 32 bytes al azar. */
  nuevoToken?: () => string;
}

export interface SesionActiva {
  session: EmbeddedSession;
  /** El token del ERP en claro: solo para reenviarlo al ERP, nunca al navegador ni a un log. */
  tokenErp: string;
}

/** IE-3 + IE-6: valida el token con whoami, asegura la carpintería y crea la sesión. Lanza los errores del cliente. */
export async function crearSesion(deps: DepsEmbebido, tokenErp: string): Promise<{ tokenDeSesion: string; session: EmbeddedSession }> {
  const usuario = await deps.erp.whoami(tokenErp);
  const tenant = await deps.persistence.tenants.ensureErpTenant({ erpTenantId: usuario.tenant.id, name: usuario.tenant.nombre });
  const tokenDeSesion = (deps.nuevoToken ?? nuevoTokenDeSesion)();
  const id = idDeSesion(tokenDeSesion);
  const ahora = deps.ahora();
  const session: EmbeddedSession = {
    id,
    tenantId: tenant.id,
    erpUserId: usuario.id,
    erpTenantId: usuario.tenant.id,
    erpTokenEncrypted: cifrar(deps.clave, tokenErp, id),
    createdAt: ahora,
    expiresAt: new Date(ahora.getTime() + deps.duracionSesionMs),
    revokedAt: null,
  };
  await deps.persistence.sessions.create(session);
  deps.registrar("sesion-creada");
  return { tokenDeSesion, session };
}

/**
 * IE-4 / TIE-9: la sesión vigente de una cookie, o null (sin cookie, con formato inválido, inexistente, vencida,
 * revocada o con un cifrado que no corresponde). Nunca dice por qué: todo es «no autenticada».
 */
export async function leerSesion(deps: DepsEmbebido, tokenDeSesion: string | undefined): Promise<SesionActiva | null> {
  if (!tokenDeSesion || !FORMATO_TOKEN_SESION.test(tokenDeSesion)) return null;
  const session = await deps.persistence.sessions.get(idDeSesion(tokenDeSesion));
  if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= deps.ahora().getTime()) return null;
  try {
    return { session, tokenErp: descifrar(deps.clave, session.erpTokenEncrypted, session.id) };
  } catch (error) {
    if (error instanceof CifradoInvalidoError) return null;
    throw error;
  }
}

export type ResultadoRenovacion = "renovada" | "no-autenticada" | "token-invalido" | "otro-usuario";

/**
 * IE-5: reemplaza el token del ERP de una sesión vigente. El token nuevo tiene que ser del mismo usuario y del
 * mismo tenant; si no, la sesión se revoca (TIE-7).
 */
export async function renovarSesion(deps: DepsEmbebido, tokenDeSesion: string | undefined, tokenErpNuevo: string): Promise<ResultadoRenovacion> {
  const activa = await leerSesion(deps, tokenDeSesion);
  if (!activa) return "no-autenticada";
  let usuario;
  try {
    usuario = await deps.erp.whoami(tokenErpNuevo);
  } catch (error) {
    await deps.persistence.sessions.revoke(activa.session.id, deps.ahora());
    deps.registrar("sesion-revocada", { motivo: "renovacion-rechazada", error: error instanceof Error ? error.name : "desconocido" });
    return "token-invalido";
  }
  if (usuario.id !== activa.session.erpUserId || usuario.tenant.id !== activa.session.erpTenantId) {
    await deps.persistence.sessions.revoke(activa.session.id, deps.ahora());
    deps.registrar("sesion-revocada", { motivo: "otro-usuario" });
    return "otro-usuario";
  }
  const ok = await deps.persistence.sessions.replaceToken(activa.session.tenantId, activa.session.id, cifrar(deps.clave, tokenErpNuevo, activa.session.id));
  if (!ok) return "no-autenticada";
  deps.registrar("sesion-renovada");
  return "renovada";
}

/** Revoca la sesión de la cookie, si hay. No dice si existía. */
export async function revocarSesion(deps: DepsEmbebido, tokenDeSesion: string | undefined, motivo: string): Promise<void> {
  if (!tokenDeSesion || !FORMATO_TOKEN_SESION.test(tokenDeSesion)) return;
  await deps.persistence.sessions.revoke(idDeSesion(tokenDeSesion), deps.ahora());
  deps.registrar("sesion-revocada", { motivo });
}
