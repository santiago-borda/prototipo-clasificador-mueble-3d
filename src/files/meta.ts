// S3-D5 (docs/spec-s3-almacenamiento-archivos.md v0.2): metadatos de un archivo (tabla `stored_file`) y su repositorio.
// Viven acá y no en src/persistence/ports.ts (que los reexporta) porque src/files no puede importar src/persistence
// (PB-13, S2A-5). Solo tipos.

/** S3-D5: metadatos de un archivo guardado (tabla `stored_file`). Los bytes están en un `FileStore` bajo `storageKey`. */
export interface StoredFileMeta {
  id: string;
  /** Hexadecimal, minúsculas. Único por carpintería (F4). */
  sha256: string;
  bytes: number;
  /** El tipo real, por los primeros bytes (S3-D7). */
  contentType: string;
  kind: string;
  originalName: string;
  /** `t/<tenantId>/archivos/<sha256>` (S3-D2). */
  storageKey: string;
  uploadedBy: string;
  createdAt: Date;
}

export type NewStoredFile = Omit<StoredFileMeta, "createdAt">;

/** S3-D5: la fila de un archivo. Se escribe DESPUÉS de los bytes: una fila nunca apunta a bytes que no existen. */
export interface FileRepository {
  /** Inserta la fila. Si la carpintería ya tiene una con ese sha256 (también si llegó a la vez), devuelve esa y no inserta (F4). */
  insert(tenantId: string, file: NewStoredFile): Promise<StoredFileMeta>;
  /** null si no existe en esa carpintería (F3). */
  get(tenantId: string, id: string): Promise<StoredFileMeta | null>;
  findBySha256(tenantId: string, sha256: string): Promise<StoredFileMeta | null>;
}
