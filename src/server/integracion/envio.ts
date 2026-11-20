// IE-7: esquema del cuerpo de POST /api/trabajos (contrato UCP v1 §3). Puro. Los errores son legibles: el ERP se
// los muestra al usuario. Lector tolerante (ASUMIDO): las claves de más se ignoran, incluido cualquier tenant del
// cuerpo (TIE-16: el tenant sale del token). `proyecto.cliente` no se lee (minimización, IE-7).

import { normalizarUuid, UUID } from "@/lib/erp/protocolo";

export interface ArchivoDelEnvio {
  url: string;
  nombre: string;
  version: number;
  sha256: string;
}

export interface Envio {
  envioUuid: string;
  proyecto: { uuid: string; codigo: string; nombre: string; fechaEntrega: string | null };
  modelo: ArchivoDelEnvio;
  csv: ArchivoDelEnvio;
}

export type ResultadoEnvio = { ok: true; envio: Envio } | { ok: false; mensaje: string };

const SHA256 = /^[0-9a-f]{64}$/i;
const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const URL_MAX_LARGO = 4096;

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown, max = 200): x is string => typeof x === "string" && x.trim() !== "" && x.length <= max;

function archivo(x: unknown, cual: "modelo" | "csv"): ArchivoDelEnvio | string {
  const del = cual === "modelo" ? "del modelo" : "del CSV";
  if (!objeto(x)) return `Falta el archivo ${del}.`;
  if (!texto(x.url, URL_MAX_LARGO)) return `Falta la URL ${del}.`;
  if (!texto(x.nombre)) return `Falta el nombre del archivo ${del}.`;
  if (typeof x.version !== "number" || !Number.isInteger(x.version) || x.version < 1) return `La versión ${del} tiene que ser un entero mayor que 0.`;
  if (typeof x.sha256 !== "string" || !SHA256.test(x.sha256)) return `El sha256 ${del} tiene que tener 64 caracteres hexadecimales.`;
  return { url: x.url, nombre: x.nombre, version: x.version, sha256: x.sha256.toLowerCase() };
}

export function parsearEnvio(cuerpo: Record<string, unknown>): ResultadoEnvio {
  const falla = (mensaje: string): ResultadoEnvio => ({ ok: false, mensaje });
  if (cuerpo.version !== 1) return falla("Versión del envío no soportada: se espera version 1.");
  if (typeof cuerpo.envioUuid !== "string" || !UUID.test(cuerpo.envioUuid)) return falla("Falta envioUuid o no es un UUID.");
  const p = cuerpo.proyecto;
  if (!objeto(p)) return falla("Falta el proyecto.");
  if (typeof p.uuid !== "string" || !UUID.test(p.uuid)) return falla("El uuid del proyecto no es un UUID.");
  if (!texto(p.codigo)) return falla("Falta el código del proyecto.");
  if (!texto(p.nombre)) return falla("Falta el nombre del proyecto.");
  const fecha = p.fechaEntrega;
  if (fecha !== undefined && fecha !== null && (typeof fecha !== "string" || !FECHA.test(fecha))) return falla("La fecha de entrega tiene que ser AAAA-MM-DD.");
  const modelo = archivo(cuerpo.modelo, "modelo");
  if (typeof modelo === "string") return falla(modelo);
  const csv = archivo(cuerpo.csv, "csv");
  if (typeof csv === "string") return falla(csv);
  return {
    ok: true,
    envio: {
      envioUuid: normalizarUuid(cuerpo.envioUuid),
      proyecto: { uuid: normalizarUuid(p.uuid), codigo: p.codigo, nombre: p.nombre, fechaEntrega: typeof fecha === "string" ? fecha : null },
      modelo,
      csv,
    },
  };
}
