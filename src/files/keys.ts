// S3-D2: clave de un archivo = `t/<tenantId>/archivos/<sha256 en hexadecimal>`. Nadie arma una clave a mano. Puro.

import { ClaveInvalidaError } from "./errors";

/** Ids de carpintería del sistema: «desarrollo» o un UUID. Sin `/`, `.` ni espacios. */
const TENANT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function fileKey(tenantId: string, sha256: string): string {
  if (!TENANT.test(tenantId)) throw new ClaveInvalidaError("el id de carpintería no es válido");
  if (!SHA256.test(sha256)) throw new ClaveInvalidaError("el sha256 tiene que ser de 64 caracteres hexadecimales en minúsculas");
  return `t/${tenantId}/archivos/${sha256}`;
}

/** Prefijo de los archivos de una carpintería (F3). */
export function tenantPrefix(tenantId: string): string {
  if (!TENANT.test(tenantId)) throw new ClaveInvalidaError("el id de carpintería no es válido");
  return `t/${tenantId}/`;
}
