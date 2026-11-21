// S3-D3 a S3-D5: guardar y leer un archivo con su sha256 y sus metadatos. Solo servidor (usa node:crypto).
//   saveFile: reglas de la clase (tamaño y tipo real por firma) → sha256 → si la carpintería ya lo tiene, devuelve el
//             existente sin volver a subir → bytes primero (si la clave ya existe, se reusa) → fila después.
//   readFile: fila de la carpintería → bytes → recalcula el sha256 (ArchivoCorruptoError si no coincide).

import { createHash, randomUUID } from "node:crypto";
import type { FileRepository, StoredFileMeta } from "./meta";
import { ArchivoCorruptoError, ArchivoNoEncontradoError, Sha256DistintoError, YaExisteError } from "./errors";
import { fileKey } from "./keys";
import { tipoReal, type FileKind } from "./rules";
import type { FileStore } from "./store";

export interface FileDeps {
  store: FileStore;
  files: FileRepository;
  newId?: () => string;
}

export interface NewFile {
  kind: FileKind;
  /** Lo que declara quien sube; el que se guarda es el real (S3-D7). */
  contentType: string;
  originalName: string;
  body: Uint8Array;
  uploadedBy: string;
  /** Si viene (p. ej. el que declaró el ERP), tiene que coincidir con el calculado: si no, `Sha256DistintoError`. */
  expectedSha256?: string;
  /** S3-I7: tope propio (p. ej. ERP_ZIP_MAX_BYTES); si no viene, el de la clase (`REGLAS`). */
  maxBytes?: number;
}

export const sha256Hex = (body: Uint8Array): string => createHash("sha256").update(body).digest("hex");

export async function saveFile(deps: FileDeps, tenantId: string, input: NewFile): Promise<StoredFileMeta> {
  const contentType = tipoReal(input.kind, input.contentType, input.body, input.maxBytes); // F6: nada escrito si no cumple
  const sha256 = sha256Hex(input.body);
  if (input.expectedSha256 !== undefined && input.expectedSha256.toLowerCase() !== sha256) throw new Sha256DistintoError();
  const storageKey = fileKey(tenantId, sha256);

  const existing = await deps.files.findBySha256(tenantId, sha256);
  // F4: no se vuelve a subir. S3-I8 (revisión del 21/11): salvo que los bytes no estén en ESTE almacén (la fila es una
  // sola para todos los adaptadores: p. ej. se guardó con FILE_STORE=local y ahora es blob, o se perdieron).
  if (existing && (await deps.store.get(existing.storageKey))) return existing;

  try {
    await deps.store.put(existing?.storageKey ?? storageKey, input.body, contentType);
  } catch (error) {
    // Bytes de un intento anterior cuya fila no se llegó a guardar (PF-12): son los mismos (misma clave = mismo sha256).
    if (!(error instanceof YaExisteError)) throw error;
  }
  if (existing) return existing;
  return deps.files.insert(tenantId, {
    id: (deps.newId ?? randomUUID)(),
    sha256,
    bytes: input.body.length,
    contentType,
    kind: input.kind,
    originalName: input.originalName,
    storageKey,
    uploadedBy: input.uploadedBy,
  });
}

/** La fila y los bytes, con la integridad comprobada. */
async function leerMeta(deps: FileDeps, meta: StoredFileMeta): Promise<{ meta: StoredFileMeta; body: Uint8Array }> {
  const stored = await deps.store.get(meta.storageKey);
  if (!stored || sha256Hex(stored.body) !== meta.sha256) throw new ArchivoCorruptoError(meta.id); // F5
  return { meta, body: stored.body };
}

export async function readFile(deps: FileDeps, tenantId: string, fileId: string): Promise<{ meta: StoredFileMeta; body: Uint8Array }> {
  const meta = await deps.files.get(tenantId, fileId); // F3: solo de esa carpintería
  if (!meta) throw new ArchivoNoEncontradoError(fileId);
  return leerMeta(deps, meta);
}

/** Por sha256 (lo que usa el almacén de la integración con el ERP). null si la carpintería no lo tiene. */
export async function readFileBySha256(deps: FileDeps, tenantId: string, sha256: string): Promise<{ meta: StoredFileMeta; body: Uint8Array } | null> {
  const meta = await deps.files.findBySha256(tenantId, sha256);
  return meta ? leerMeta(deps, meta) : null;
}
