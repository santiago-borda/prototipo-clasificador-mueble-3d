// IE-1: errores con nombre del cliente del ERP. Ningún mensaje lleva el token, la URL completa ni el cuerpo.

/** Red caída, tiempo agotado o 5xx. */
export class ErpNoDisponible extends Error {
  constructor(readonly detalle: "red" | "tiempo-agotado" | `http-${number}`, options: { cause?: unknown } = {}) {
    super(`El ERP no respondió (${detalle}).`, options);
    this.name = "ErpNoDisponible";
  }
}

/** El ERP no reconoce el token (al validarlo con whoami) o no le da permiso (403). */
export class TokenErpInvalido extends Error {
  constructor() {
    super("El ERP rechazó el token.");
    this.name = "TokenErpInvalido";
  }
}

/** Una lectura con el token de la sesión dio 401: el token ya pasó por whoami, así que se toma como vencido. */
export class TokenErpVencido extends Error {
  constructor() {
    super("El token del ERP venció.");
    this.name = "TokenErpVencido";
  }
}

/** La respuesta no tiene la forma que espera el esquema (o el ERP dijo 404). */
export class RespuestaErpInvalida extends Error {
  constructor(readonly ruta: string, readonly motivo: string) {
    super(`Respuesta inesperada del ERP en ${ruta}: ${motivo}.`);
    this.name = "RespuestaErpInvalida";
  }
}

/** El ERP respondió 404: el recurso no existe para este usuario. */
export class RecursoErpInexistente extends Error {
  constructor(readonly ruta: string) {
    super(`El ERP no tiene ${ruta} para este usuario.`);
    this.name = "RecursoErpInexistente";
  }
}

/** IE-12: ERP_MODO=simulado con NODE_ENV=production. */
export class ErpSimuladoEnProduccionError extends Error {
  constructor() {
    super("ERP_MODO=simulado no se permite con NODE_ENV=production.");
    this.name = "ErpSimuladoEnProduccionError";
  }
}

/** Falta o es inválida una variable de entorno de la integración. Nombra la variable, nunca su valor. */
export class ConfiguracionErpInvalida extends Error {
  constructor(readonly variable: string, readonly motivo: string) {
    super(`${variable}: ${motivo}.`);
    this.name = "ConfiguracionErpInvalida";
  }
}
