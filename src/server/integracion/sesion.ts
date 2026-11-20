// IE-2: sesión propia. Solo servidor. El token del ERP se valida localmente (IE-1) y **no se guarda**: la sesión
// lleva `sub`, `tenant_id` y el vencimiento del último token aceptado. El tenant sale del token, nunca del navegador.
// La sesión vale hasta `exp` + 60 s (la misma gracia que el iframe, IE-4): un `erp:token` que llega un poco tarde
// todavía renueva.

import { GRACIA_VENCIMIENTO_MS } from "@/lib/erp/vencimiento";
import type { ErpSession, Persistence } from "@/persistence/ports";
import type { ConfigErp } from "@/server/erp/config";
import { JwksNoDisponible, TokenErpInvalido, TokenErpVencido } from "@/server/erp/errores";
import type { IdentidadErp, ValidarToken } from "@/server/erp/token";
import { FORMATO_TOKEN_SESION, idDeSesion, nuevoTokenDeSesion } from "./cripto";
import type { Registro } from "./registro";

export interface DepsIntegracion {
  persistence: Persistence;
  config: ConfigErp;
  validarToken: ValidarToken;
  /** Fetch de las llamadas salientes (descargas, login). Las pruebas inyectan el simulado. */
  fetchImpl: typeof fetch;
  ahora: () => Date;
  registrar: Registro;
  nuevoUuid: () => string;
  /** Para las pruebas. Por defecto, 32 bytes al azar. */
  nuevoToken?: () => string;
}

/** El `tenantId` que mandó el ERP en `erp:sesion` no es el `tenant_id` del token (TIE-6). */
export class TenantDistintoError extends Error {
  constructor() {
    super("El tenantId del mensaje no coincide con el tenant_id del token.");
    this.name = "TenantDistintoError";
  }
}

/** Nombre de una carpintería que aparece por primera vez: el token no trae el nombre (guía §2). */
export function nombreDeCarpinteria(erpTenant: string): string {
  return `Carpintería del ERP ${erpTenant.slice(0, 8)}`;
}

/** Hasta cuándo vale la sesión (ms epoch). */
export function vigenteHasta(session: ErpSession): number {
  return session.expiresAt.getTime() + GRACIA_VENCIMIENTO_MS;
}

export interface SesionCreada {
  tokenDeSesion: string;
  session: ErpSession;
}

/**
 * IE-2: valida el token, asegura la carpintería y crea la sesión. Si se pasa `tenantIdDeclarado` (el de
 * `erp:sesion`), tiene que coincidir con el del token. Lanza los errores de IE-1 y `TenantDistintoError`.
 */
export async function crearSesion(deps: DepsIntegracion, accessToken: string, opciones: { tenantIdDeclarado?: string } = {}): Promise<SesionCreada> {
  const identidad = await deps.validarToken(accessToken);
  if (opciones.tenantIdDeclarado !== undefined && opciones.tenantIdDeclarado.toLowerCase() !== identidad.erpTenant.toLowerCase()) {
    throw new TenantDistintoError();
  }
  const tenant = await deps.persistence.tenants.ensureErpTenant({ erpTenantId: identidad.erpTenant, name: nombreDeCarpinteria(identidad.erpTenant) });
  const tokenDeSesion = (deps.nuevoToken ?? nuevoTokenDeSesion)();
  const session: ErpSession = {
    id: idDeSesion(tokenDeSesion),
    tenantId: tenant.id,
    erpUserId: identidad.erpUsuario,
    erpTenantId: identidad.erpTenant,
    createdAt: deps.ahora(),
    expiresAt: new Date(identidad.exp * 1000),
    revokedAt: null,
  };
  await deps.persistence.sessions.create(session);
  deps.registrar("sesion-creada");
  return { tokenDeSesion, session };
}

/** La sesión vigente de una cookie, o null (sin cookie, formato inválido, inexistente, vencida o revocada). */
export async function leerSesion(deps: DepsIntegracion, tokenDeSesion: string | undefined): Promise<ErpSession | null> {
  if (!tokenDeSesion || !FORMATO_TOKEN_SESION.test(tokenDeSesion)) return null;
  const session = await deps.persistence.sessions.get(idDeSesion(tokenDeSesion));
  if (!session || session.revokedAt !== null || vigenteHasta(session) <= deps.ahora().getTime()) return null;
  return session;
}

export type ResultadoRenovacion =
  | { resultado: "renovada"; session: ErpSession }
  | { resultado: "no-autenticada" | "token-invalido" | "otro-usuario" | "jwks-no-disponible" };

/**
 * IE-2 / TIE-8: un `erp:token` nuevo. Exige sesión vigente y el mismo `sub` y `tenant_id`; si no coinciden, o si el
 * token no valida, la sesión se revoca. Si el JWKS no responde, no se revoca (es reintentable).
 */
export async function renovarSesion(deps: DepsIntegracion, tokenDeSesion: string | undefined, accessToken: string): Promise<ResultadoRenovacion> {
  const session = await leerSesion(deps, tokenDeSesion);
  if (!session) return { resultado: "no-autenticada" };
  let identidad: IdentidadErp;
  try {
    identidad = await deps.validarToken(accessToken);
  } catch (error) {
    if (error instanceof JwksNoDisponible) return { resultado: "jwks-no-disponible" };
    if (!(error instanceof TokenErpInvalido || error instanceof TokenErpVencido)) throw error;
    await deps.persistence.sessions.revoke(session.id, deps.ahora());
    deps.registrar("sesion-revocada", { motivo: "renovacion-rechazada", error: error.name });
    return { resultado: "token-invalido" };
  }
  if (identidad.erpUsuario !== session.erpUserId || identidad.erpTenant !== session.erpTenantId) {
    await deps.persistence.sessions.revoke(session.id, deps.ahora());
    deps.registrar("sesion-revocada", { motivo: "otro-usuario" });
    return { resultado: "otro-usuario" };
  }
  const expiresAt = new Date(Math.max(identidad.exp * 1000, session.expiresAt.getTime()));
  if (!(await deps.persistence.sessions.extend(session.tenantId, session.id, expiresAt))) return { resultado: "no-autenticada" };
  deps.registrar("sesion-renovada");
  return { resultado: "renovada", session: { ...session, expiresAt } };
}

/** Revoca la sesión de la cookie, si hay. No dice si existía. */
export async function revocarSesion(deps: DepsIntegracion, tokenDeSesion: string | undefined, motivo: string): Promise<void> {
  if (!tokenDeSesion || !FORMATO_TOKEN_SESION.test(tokenDeSesion)) return;
  await deps.persistence.sessions.revoke(idDeSesion(tokenDeSesion), deps.ahora());
  deps.registrar("sesion-revocada", { motivo });
}
