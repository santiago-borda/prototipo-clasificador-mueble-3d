// Claves de almacenamiento del spike (docs/spec-proto-csv-ocl.md §1, P3). El store de Blob es el MISMO que el de
// Production: el spike solo lee y escribe bajo `proto-csv/<id>/`. Toda clave pasa por `protoPath`, y el store que
// usan las rutas va envuelto en `scopedStore`, que falla ante cualquier clave o prefijo fuera de `proto-csv/`.
// Sin dependencias: lo usan el navegador (subida) y el servidor.

import type { ImportStore } from "@/importer/store";

export const PROTO_PREFIX = "proto-csv/";
/** 16 hex aleatorios, como el importId del importador: no adivinable. */
export const PROTO_ID = /^[0-9a-f]{16}$/;
/** Tope propio del spike: cuenta los prefijos `proto-csv/<id>/` que existan, tengan o no `informe.json` (C15). */
export const MAX_CARGAS = 20;

export const MAX_BYTES = { csv: 1024 * 1024, dae: 10 * 1024 * 1024, textura: 5 * 1024 * 1024, svg: 1024 * 1024 } as const;

export class ProtoPathError extends Error {
  constructor(readonly key: string, reason: string) {
    super(`Clave fuera del spike (${reason}): ${key}`);
    this.name = "ProtoPathError";
  }
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** Rutas relativas que puede tener una carga. `upload` = las que sube el navegador; el resto las escribe el servidor. */
const RELATIVE: readonly { pattern: RegExp; upload: keyof typeof MAX_BYTES | null }[] = [
  { pattern: /^listado\.csv$/, upload: "csv" },
  { pattern: /^modelo\.dae$/, upload: "dae" },
  { pattern: /^texturas\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(jpe?g|png)$/i, upload: "textura" },
  { pattern: /^diagrama-[a-z0-9-]{1,60}\.svg$/, upload: "svg" },
  { pattern: /^informe\.json$/, upload: null },
  { pattern: /^eventos\/\d{4}-[a-z-]{3,30}\.json$/, upload: null },
];

function checkRelative(key: string, rel: string) {
  if (rel.includes("..") || rel.includes("\\") || rel.includes("//") || rel.startsWith("/")) throw new ProtoPathError(key, "ruta no permitida");
  const kind = RELATIVE.find((r) => r.pattern.test(rel));
  if (!kind) throw new ProtoPathError(key, "archivo no permitido");
  return kind;
}

/** `proto-csv/<id>/<rel>`, validado. Lanza `ProtoPathError` si el id o la ruta no son del spike. */
export function protoPath(id: string, rel: string): string {
  const key = `${PROTO_PREFIX}${id}/${rel}`;
  if (!PROTO_ID.test(id)) throw new ProtoPathError(key, "id inválido");
  checkRelative(key, rel);
  return key;
}

/** `proto-csv/<id>/`, validado. */
export function protoDir(id: string): string {
  const dir = `${PROTO_PREFIX}${id}/`;
  if (!PROTO_ID.test(id)) throw new ProtoPathError(dir, "id inválido");
  return dir;
}

/** Descompone una clave completa; lanza si no es una clave válida del spike. */
export function parseProtoKey(key: string): { id: string; rel: string; upload: keyof typeof MAX_BYTES | null } {
  const match = /^proto-csv\/([^/]+)\/(.+)$/.exec(key);
  if (!match) throw new ProtoPathError(key, "fuera de proto-csv/");
  const [, id, rel] = match;
  if (!PROTO_ID.test(id)) throw new ProtoPathError(key, "id inválido");
  return { id, rel, upload: checkRelative(key, rel).upload };
}

/** Prefijo para listar: `proto-csv/` o `proto-csv/<id>/`. */
function checkPrefix(prefix: string) {
  if (prefix === PROTO_PREFIX) return;
  const match = /^proto-csv\/([^/]+)\/$/.exec(prefix);
  if (!match || !PROTO_ID.test(match[1])) throw new ProtoPathError(prefix, "prefijo fuera de proto-csv/");
}

/** Envoltorio del store: toda clave y todo prefijo tienen que ser del spike (C13). */
export function scopedStore(store: ImportStore): ImportStore {
  return {
    async put(key, body, contentType) {
      parseProtoKey(key);
      await store.put(key, body, contentType);
    },
    async get(key) {
      parseProtoKey(key);
      return store.get(key);
    },
    async list(prefix) {
      checkPrefix(prefix);
      const keys = await store.list(prefix);
      return keys.filter((k) => k.startsWith(prefix));
    },
    async delete(keys) {
      for (const key of keys) parseProtoKey(key);
      await store.delete(keys);
    },
  };
}

/** Nombre de archivo de textura que se puede subir (el navegador lo valida antes; el servidor de nuevo con `protoPath`). */
export const isSafeFileName = (name: string) => SAFE_NAME.test(name);

/** "Blanco 18" → "blanco-18" (para `diagrama-<material>.svg`). */
export function materialSlug(material: string): string {
  return (
    material
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "material"
  );
}
