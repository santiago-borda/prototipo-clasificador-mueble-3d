// IE-8: lectura del zip de un Documento del ERP, sin dependencias nuevas (node:zlib). Solo servidor.
// Se aceptan los métodos 0 (sin compresión) y 8 (deflate); sin zip64, sin cifrado. Todo se valida antes de usarlo:
// tamaño total (comprimido y declarado), rutas (sin "..", sin absolutas ni barras invertidas), CRC y que haya un .dae.

import { inflateRawSync } from "node:zlib";

export type MotivoZipInvalido =
  | "demasiado-grande"
  | "formato"
  | "sin-dae"
  | "ruta-insegura"
  | "metodo-no-soportado"
  | "cifrado"
  | "demasiadas-entradas";

export class ZipInvalidoError extends Error {
  constructor(readonly motivo: MotivoZipInvalido) {
    super(`El zip del ERP no es válido (${motivo}).`);
    this.name = "ZipInvalidoError";
  }
}

export interface EntradaZip {
  nombre: string;
  datos: Uint8Array;
}

export interface OpcionesZip {
  /** Tope para el zip y para la suma de lo descomprimido, en bytes. */
  maxBytes: number;
  maxEntradas?: number;
}

/** 20 MB: el .dae del Olmo pesa menos de 1 MB. ASUMIDO hasta U-erp-real (`ERP_ZIP_MAX_BYTES`). */
export const ZIP_MAX_BYTES_POR_DEFECTO = 20 * 1024 * 1024;

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i += 1) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Ruta insegura: absoluta, con unidad de Windows, con barra invertida, con NUL o con un segmento "..". */
export function rutaInsegura(nombre: string): boolean {
  if (nombre === "" || nombre.includes("\0") || nombre.includes("\\")) return true;
  if (nombre.startsWith("/") || /^[A-Za-z]:/.test(nombre)) return true;
  return nombre.split("/").some((segmento) => segmento === "..");
}

const FIRMA_FIN = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

/** Todas las entradas de archivo (las carpetas se saltean, pero sus rutas también se validan). */
export function leerZip(bytes: Uint8Array, opciones: OpcionesZip): EntradaZip[] {
  const maxEntradas = opciones.maxEntradas ?? 1000;
  if (bytes.length > opciones.maxBytes) throw new ZipInvalidoError("demasiado-grande");
  if (bytes.length < 22) throw new ZipInvalidoError("formato");
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => vista.getUint16(o, true);
  const u32 = (o: number) => vista.getUint32(o, true);
  const dentro = (o: number, n: number) => o >= 0 && n >= 0 && o + n <= bytes.length;

  // Fin del directorio central: últimos 22 bytes más un comentario de hasta 65535.
  let fin = -1;
  for (let o = bytes.length - 22; o >= Math.max(0, bytes.length - 22 - 0xffff); o -= 1) {
    if (u32(o) === FIRMA_FIN) {
      fin = o;
      break;
    }
  }
  if (fin < 0) throw new ZipInvalidoError("formato");
  const total = u16(fin + 10);
  const tamCentral = u32(fin + 12);
  const inicioCentral = u32(fin + 16);
  if (total === 0xffff || tamCentral === 0xffffffff || inicioCentral === 0xffffffff) throw new ZipInvalidoError("formato"); // zip64
  if (total > maxEntradas) throw new ZipInvalidoError("demasiadas-entradas");
  if (!dentro(inicioCentral, tamCentral)) throw new ZipInvalidoError("formato");

  const decodificador = new TextDecoder("utf-8", { fatal: false });
  const entradas: EntradaZip[] = [];
  let declarado = 0;
  let o = inicioCentral;
  for (let i = 0; i < total; i += 1) {
    if (!dentro(o, 46) || u32(o) !== FIRMA_CENTRAL) throw new ZipInvalidoError("formato");
    const banderas = u16(o + 8);
    const metodo = u16(o + 10);
    const crc = u32(o + 16);
    const tamComprimido = u32(o + 20);
    const tamOriginal = u32(o + 24);
    const largoNombre = u16(o + 28);
    const largoExtra = u16(o + 30);
    const largoComentario = u16(o + 32);
    const inicioLocal = u32(o + 42);
    if (!dentro(o + 46, largoNombre)) throw new ZipInvalidoError("formato");
    const nombre = decodificador.decode(bytes.subarray(o + 46, o + 46 + largoNombre));
    o += 46 + largoNombre + largoExtra + largoComentario;

    if (rutaInsegura(nombre)) throw new ZipInvalidoError("ruta-insegura");
    if (banderas & 0x1) throw new ZipInvalidoError("cifrado");
    if (nombre.endsWith("/")) continue;
    if (metodo !== 0 && metodo !== 8) throw new ZipInvalidoError("metodo-no-soportado");
    declarado += tamOriginal;
    if (declarado > opciones.maxBytes) throw new ZipInvalidoError("demasiado-grande");

    if (!dentro(inicioLocal, 30) || u32(inicioLocal) !== FIRMA_LOCAL) throw new ZipInvalidoError("formato");
    const inicioDatos = inicioLocal + 30 + u16(inicioLocal + 26) + u16(inicioLocal + 28);
    if (!dentro(inicioDatos, tamComprimido)) throw new ZipInvalidoError("formato");
    const comprimido = bytes.subarray(inicioDatos, inicioDatos + tamComprimido);

    let datos: Uint8Array;
    if (metodo === 0) {
      datos = comprimido;
    } else {
      try {
        // El tope evita una bomba de descompresión aunque el tamaño declarado mienta.
        datos = inflateRawSync(comprimido, { maxOutputLength: Math.max(1, tamOriginal) });
      } catch {
        throw new ZipInvalidoError("formato");
      }
    }
    if (datos.length !== tamOriginal || crc32(datos) !== crc) throw new ZipInvalidoError("formato");
    entradas.push({ nombre, datos: new Uint8Array(datos) });
  }
  return entradas;
}

export interface DaeDelZip {
  /** Ruta del .dae dentro del zip. */
  nombre: string;
  bytes: Uint8Array;
}

/**
 * El .dae del zip. Si hay más de uno se toma el primero por nombre (orden binario): ASUMIDO hasta U-erp-real.
 * Lanza `ZipInvalidoError` ("sin-dae") si no hay ninguno.
 */
export function extraerDae(bytes: Uint8Array, opciones: OpcionesZip): DaeDelZip {
  const daes = leerZip(bytes, opciones)
    .filter((e) => /\.dae$/i.test(e.nombre))
    .sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  if (daes.length === 0) throw new ZipInvalidoError("sin-dae");
  return { nombre: daes[0].nombre, bytes: daes[0].datos };
}
