// S3 §3: excepciones con nombre. Ningún mensaje lleva el contenido del archivo.

export class ClaveInvalidaError extends Error {
  constructor(readonly detalle: string) {
    super(`Clave de archivo inválida: ${detalle}.`);
    this.name = "ClaveInvalidaError";
  }
}

export class YaExisteError extends Error {
  constructor(readonly pathname: string) {
    super(`Ya existe ${pathname}: no se sobrescribe.`);
    this.name = "YaExisteError";
  }
}

export class ArchivoCorruptoError extends Error {
  constructor(readonly fileId: string) {
    super(`El archivo ${fileId} no coincide con su sha256: el almacenamiento lo alteró o lo perdió.`);
    this.name = "ArchivoCorruptoError";
  }
}

export class TipoNoPermitidoError extends Error {
  constructor(
    readonly kind: string,
    readonly contentType: string,
  ) {
    super(`Un archivo de clase «${kind}» no puede ser «${contentType}».`);
    this.name = "TipoNoPermitidoError";
  }
}

export class ArchivoDemasiadoGrandeError extends Error {
  constructor(
    readonly kind: string,
    readonly bytes: number,
    readonly max: number,
  ) {
    super(`El archivo de clase «${kind}» pesa ${bytes} bytes y el máximo es ${max}.`);
    this.name = "ArchivoDemasiadoGrandeError";
  }
}

export class ArchivoNoEncontradoError extends Error {
  constructor(readonly fileId: string) {
    super(`No existe el archivo ${fileId}.`);
    this.name = "ArchivoNoEncontradoError";
  }
}

/** S3-I3: el sha256 calculado no es el que declaró quien lo guarda (p. ej. el ERP). No se guarda nada. */
export class Sha256DistintoError extends Error {
  constructor() {
    super("El contenido no coincide con el sha256 declarado.");
    this.name = "Sha256DistintoError";
  }
}
