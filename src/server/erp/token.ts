// IE-1: validación local del access token del ERP (contrato UCP v1 §1; guía de auth de QA §2). Solo servidor.
//   - firma RS256 con el JWKS del Auth del ERP (`{ERP_ISSUER}.well-known/jwks`), con `jose` (aprobada el 20/11);
//   - las claves quedan en caché y se vuelven a pedir solo ante un `kid` desconocido, como máximo una vez cada 30 s;
//   - `iss` exacto (con la barra final), `exp` y `nbf` con 30 s de tolerancia, **sin** validar audiencia;
//   - solo RS256: `none`, HS* y cualquier otro algoritmo se rechazan;
//   - devuelve `sub` y `tenant_id` (en minúsculas si son UUID) y `exp`. Sin alguno de los dos: `TokenErpInvalido`.
// El token nunca se registra ni se guarda (contrato §1).

import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTPayload } from "jose";
import { esTokenBienFormado, normalizarUuid, UUID } from "@/lib/erp/protocolo";
import { JwksNoDisponible, TokenErpInvalido, TokenErpVencido } from "./errores";

export const TOLERANCIA_RELOJ_S = 30;
export const ESPERA_ENTRE_PEDIDOS_JWKS_MS = 30_000;

export interface IdentidadErp {
  /** `sub`: UUID del usuario del ERP. */
  erpUsuario: string;
  /** `tenant_id`: UUID de la carpintería. El tenant sale siempre de acá, nunca del cuerpo ni de la URL. */
  erpTenant: string;
  /** `exp` en segundos epoch. */
  exp: number;
}

export type ValidarToken = (token: string) => Promise<IdentidadErp>;

export interface OpcionesValidador {
  issuer: string;
  jwksUrl: string;
  timeoutMs: number;
  /** Para las pruebas (la suite no tiene red) y el simulado. Por defecto, el fetch global. */
  fetchImpl?: typeof fetch;
  /** Reloj para `exp`/`nbf`. Por defecto, la hora del sistema. */
  ahora?: () => Date;
}

const normalizar = (id: string) => (UUID.test(id) ? normalizarUuid(id) : id);

function claimTexto(payload: JWTPayload, claim: string): string {
  const v = payload[claim];
  if (typeof v !== "string" || v.trim() === "" || v.length > 200) throw new TokenErpInvalido(`sin-${claim}`);
  return v;
}

/** Traduce los errores de `jose` a los errores con nombre de IE-1 (sin el token en ningún mensaje). */
function traducir(error: unknown): Error {
  if (error instanceof TokenErpInvalido || error instanceof TokenErpVencido || error instanceof JwksNoDisponible) return error;
  if (error instanceof errors.JWTExpired) return new TokenErpVencido();
  if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid) return new JwksNoDisponible({ cause: error });
  // jose usa el error genérico para «el JWKS no respondió 200» y «no es JSON».
  if (error instanceof errors.JOSEError && error.code === "ERR_JOSE_GENERIC") return new JwksNoDisponible({ cause: error });
  if (error instanceof errors.JWTClaimValidationFailed) return new TokenErpInvalido(`claim-${error.claim}`);
  if (error instanceof errors.JOSEAlgNotAllowed) return new TokenErpInvalido("algoritmo");
  if (error instanceof errors.JWKSNoMatchingKey) return new TokenErpInvalido("kid-desconocido");
  if (error instanceof errors.JWSSignatureVerificationFailed) return new TokenErpInvalido("firma");
  if (error instanceof errors.JOSEError) return new TokenErpInvalido(error.code);
  // Red caída o respuesta no-JSON al pedir el JWKS (el fetch lanza fuera de jose).
  return new JwksNoDisponible({ cause: error });
}

export function crearValidadorToken(opciones: OpcionesValidador): ValidarToken {
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const jwks = createRemoteJWKSet(new URL(opciones.jwksUrl), {
    timeoutDuration: opciones.timeoutMs,
    cooldownDuration: ESPERA_ENTRE_PEDIDOS_JWKS_MS,
    cacheMaxAge: Infinity, // solo se vuelve a pedir ante un kid desconocido (contrato §1)
    [customFetch]: (url, init) => fetchImpl(url, { ...init, redirect: "error", cache: "no-store" }),
  });

  return async (token) => {
    if (!esTokenBienFormado(token)) throw new TokenErpInvalido("forma");
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: opciones.issuer,
        algorithms: ["RS256"],
        clockTolerance: TOLERANCIA_RELOJ_S,
        currentDate: opciones.ahora?.(),
        requiredClaims: ["exp", "sub"],
      });
      const erpUsuario = normalizar(claimTexto(payload, "sub"));
      const erpTenant = normalizar(claimTexto(payload, "tenant_id"));
      if (typeof payload.exp !== "number") throw new TokenErpInvalido("sin-exp");
      return { erpUsuario, erpTenant, exp: payload.exp };
    } catch (error) {
      throw traducir(error);
    }
  };
}
