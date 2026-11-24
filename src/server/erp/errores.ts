// IE-1, IE-7, IE-11, IE-12: errores con nombre de la integración con el ERP. Ningún mensaje lleva el token, la
// contraseña, la URL firmada (su query es una credencial) ni el cuerpo de una respuesta.

/** IE-1: firma inválida, otro issuer, algoritmo no permitido (none, HS*), forma inválida o sin `sub`/`tenant_id`. */
export class TokenErpInvalido extends Error {
  constructor(readonly motivo: string = "invalido") {
    super(`El token del ERP no es válido (${motivo}).`);
    this.name = "TokenErpInvalido";
  }
}

/** IE-1: `exp` vencido (con 30 s de tolerancia). */
export class TokenErpVencido extends Error {
  constructor() {
    super("El token del ERP venció.");
    this.name = "TokenErpVencido";
  }
}

/** IE-1: no se pudo leer el JWKS del Auth del ERP (red, tiempo agotado, respuesta inválida). Reintentable. */
export class JwksNoDisponible extends Error {
  constructor(options: { cause?: unknown } = {}) {
    super("No se pudieron leer las claves públicas del Auth del ERP.", options);
    this.name = "JwksNoDisponible";
  }
}

/** IE-7: no se pudo descargar un archivo de su URL firmada. `reintentable` = red, tiempo agotado o 5xx. */
export class DescargaFallida extends Error {
  constructor(
    readonly archivo: "modelo" | "csv",
    readonly detalle: "red" | "tiempo-agotado" | "demasiado-grande" | `http-${number}`,
    options: { cause?: unknown } = {},
  ) {
    super(`No se pudo descargar ${archivo === "modelo" ? "el modelo" : "el CSV"} (${detalle}).`, options);
    this.name = "DescargaFallida";
  }

  get reintentable(): boolean {
    return this.detalle === "red" || this.detalle === "tiempo-agotado" || /^http-5\d\d$/.test(this.detalle);
  }
}

/** IE-11: el login de desarrollo no devolvió un token (credenciales incorrectas o respuesta inesperada). */
export class LoginErpRechazado extends Error {
  constructor(readonly detalle: string) {
    super(`El ERP no aceptó el login (${detalle}).`);
    this.name = "LoginErpRechazado";
  }
}

/** IE-12 / TIE-20: ERP_MODO=simulado con NODE_ENV=production. */
export class ErpSimuladoEnProduccionError extends Error {
  constructor() {
    super("ERP_MODO=simulado no se permite con NODE_ENV=production.");
    this.name = "ErpSimuladoEnProduccionError";
  }
}

/** IE-11 / TIE-20: ERP_LOGIN_DIRECTO=habilitado con NODE_ENV=production. */
export class LoginDirectoEnProduccionError extends Error {
  constructor() {
    super("ERP_LOGIN_DIRECTO no se permite con NODE_ENV=production: el login directo es solo para desarrollo.");
    this.name = "LoginDirectoEnProduccionError";
  }
}

/** Falta o es inválida una variable de entorno de la integración. Nombra la variable, nunca su valor. */
export class ConfiguracionErpInvalida extends Error {
  constructor(
    readonly variable: string,
    readonly motivo: string,
  ) {
    super(`${variable}: ${motivo}.`);
    this.name = "ConfiguracionErpInvalida";
  }
}
