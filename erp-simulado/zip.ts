// Escritor de zip mínimo para el ERP simulado y las pruebas (IE-13, TIE-14). Sin dependencias: node:zlib.
// No es código de la app: la app solo lee zips (src/server/erp/zip.ts).

import { deflateRawSync } from "node:zlib";
import { crc32 } from "@/server/erp/zip";

export interface EntradaNueva {
  nombre: string;
  datos: Uint8Array | string;
  /** 0 = sin compresión, 8 = deflate (por defecto). */
  metodo?: 0 | 8;
  /** Solo para pruebas: marca la entrada como cifrada. */
  cifrada?: boolean;
}

export function crearZip(entradas: readonly EntradaNueva[]): Uint8Array {
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;
  const codificador = new TextEncoder();

  for (const entrada of entradas) {
    const nombre = codificador.encode(entrada.nombre);
    const original = typeof entrada.datos === "string" ? codificador.encode(entrada.datos) : entrada.datos;
    const metodo = entrada.metodo ?? 8;
    const datos = metodo === 8 ? new Uint8Array(deflateRawSync(original)) : original;
    const crc = crc32(original);
    const banderas = 0x0800 | (entrada.cifrada ? 0x1 : 0); // UTF-8

    const local = new Uint8Array(30 + nombre.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, banderas, true);
    l.setUint16(8, metodo, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, datos.length, true);
    l.setUint32(22, original.length, true);
    l.setUint16(26, nombre.length, true);
    local.set(nombre, 30);

    const central = new Uint8Array(46 + nombre.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, banderas, true);
    c.setUint16(10, metodo, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, original.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);

    locales.push(local, datos);
    centrales.push(central);
    desplazamiento += local.length + datos.length;
  }

  const tamCentral = centrales.reduce((n, c) => n + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, entradas.length, true);
  f.setUint16(10, entradas.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desplazamiento, true);

  const partes = [...locales, ...centrales, fin];
  const salida = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) {
    salida.set(p, o);
    o += p.length;
  }
  return salida;
}
