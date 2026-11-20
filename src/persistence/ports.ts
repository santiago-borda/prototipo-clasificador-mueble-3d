// S2: contrato de la persistencia (docs/spec-s2-base-de-datos.md §3; ADR-002).
// Lo único que conocen los casos de uso. Sin imports de kysely, pg ni next (B9, prueba PB-13).
// Las dos implementaciones (memory/ y sql/) lanzan las mismas excepciones en los mismos casos.

import type { FurnitureDef, PieceType } from "@/data/types";
import type { AssociationRun } from "@/engine/types";

// --- Tipos ------------------------------------------------------------------------------------

/** Estados de una versión de diseño (docs/modelo-de-datos.md §2). S2 solo escribe `borrador`, `publicada` y `reemplazada`. */
export const DESIGN_VERSION_STATUSES = ["borrador", "en-revision", "aprobada", "publicada", "reemplazada", "rechazada"] as const;
export type DesignVersionStatus = (typeof DESIGN_VERSION_STATUSES)[number];

export interface Tenant {
  id: string;
  name: string;
  erpTenantId: string | null;
  enabled: boolean;
}

export interface NewDesignVersion {
  /**
   * Id de fila de un mueble existente al que se le agrega una versión. Sin él se crean el proyecto y el mueble.
   * El mueble conserva su `id` y su `qrId` heredados: el `def` tiene que traer los mismos (`MuebleInvalidoError`).
   */
  furnitureId?: string;
  /** Nombre del proyecto que se crea junto con el mueble. Por defecto, el nombre del mueble. */
  projectName?: string;
  /**
   * El mueble como lo usa la ficha. `furniture.newerVersionAvailable` no se guarda: al leer se calcula
   * (true si el mueble tiene publicada una versión con número mayor).
   */
  def: FurnitureDef;
  /** sha256 del .dae (`modelId` de `@/engine/hash`), si se conoce. */
  modelId: string | null;
  createdBy: string;
}

export interface DesignVersionRef {
  projectId: string;
  furnitureId: string;
  designVersionId: string;
  /** Identificador opaco de la versión (para abrir la guía de armado; no se usa todavía). */
  publicId: string;
  number: number;
  /** Id de fila de cada módulo, por su id heredado (`Module.id`). */
  moduleIds: Readonly<Record<string, string>>;
  /** Id de fila de cada tipo de pieza, por código. */
  pieceTypeIds: Readonly<Record<string, string>>;
}

export interface DesignVersionSummary {
  designVersionId: string;
  furnitureId: string;
  furnitureName: string;
  number: number;
  status: DesignVersionStatus;
}

export interface NewPieceType {
  /** Id de FILA del módulo (no el heredado). Tiene que ser de la misma carpintería y de la misma versión. */
  moduleId: string;
  piece: Omit<PieceType, "moduleId">;
}

/** A qué apunta un QR. `furniture` y `module` existen solo para los qrId heredados del prototipo (S2-D7). */
export type QrResolution =
  | { kind: "furniture"; qrId: string; tenantId: string; designVersionId: string; status: DesignVersionStatus }
  | { kind: "module"; qrId: string; tenantId: string; designVersionId: string; status: DesignVersionStatus; moduleId: string }
  | {
      kind: "piece";
      qrId: string;
      tenantId: string;
      designVersionId: string;
      status: DesignVersionStatus;
      pieceTypeId: string;
      revoked: boolean;
    };

/**
 * IE-4: sesión propia del embebido (docs/spec-integracion-erp-minima.md). `id` es el sha256 (hex) del token de sesión
 * que lleva la cookie: la base nunca ve la cookie. El token del ERP se guarda cifrado (AES-256-GCM, src/server/embebido).
 */
export interface EmbeddedSession {
  id: string;
  tenantId: string;
  erpUserId: string;
  erpTenantId: string;
  erpTokenEncrypted: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** IE-8: un zip del ERP que se abrió en el visor. Se registra su sha256; el archivo no se guarda. */
export interface ErpDocumentSeen {
  erpDocumentId: string;
  sha256: string;
  bytes: number;
}

// --- Repositorios ------------------------------------------------------------------------------

export interface TenantRepository {
  create(input: { id?: string; name: string; erpTenantId?: string | null }): Promise<Tenant>;
  get(tenantId: string): Promise<Tenant | null>;
  /**
   * IE-6: la carpintería de un tenant del ERP; si no existe, se crea con ese `erpTenantId` (único en la base).
   * Es una puerta de entrada (como `qr.resolve`): no lleva tenantId porque es lo que se busca.
   */
  ensureErpTenant(input: { erpTenantId: string; name: string }): Promise<Tenant>;
}

/** IE-9: vínculo con los proyectos del ERP. */
export interface ProjectRepository {
  /** Id de fila del proyecto vinculado a `erpProjectId` en la carpintería; si no hay, se crea. Único por carpintería. */
  linkErpProject(tenantId: string, input: { erpProjectId: string; name: string }): Promise<string>;
}

export interface SessionRepository {
  create(session: Omit<EmbeddedSession, "revokedAt">): Promise<void>;
  /** Puerta de entrada: la sesión por su id (sha256 de la cookie), o null. No filtra vencidas ni revocadas. */
  get(id: string): Promise<EmbeddedSession | null>;
  /** IE-5: reemplaza el token cifrado de una sesión no revocada. false si no existe o está revocada. */
  replaceToken(tenantId: string, id: string, erpTokenEncrypted: string): Promise<boolean>;
  /** Revocar dos veces no hace nada. */
  revoke(id: string, at: Date): Promise<void>;
}

export interface ErpDocumentRepository {
  /** IE-8: registra el sha256 de un zip abierto. Registrar dos veces el mismo no hace nada. */
  record(tenantId: string, projectId: string, seen: ErpDocumentSeen): Promise<void>;
  list(tenantId: string, projectId: string): Promise<ErpDocumentSeen[]>;
}

export interface FurnitureRepository {
  /** Guarda un mueble completo como una versión de diseño nueva (estado `borrador`), en una transacción. */
  saveDesignVersion(tenantId: string, input: NewDesignVersion): Promise<DesignVersionRef>;
  /** Agrega un tipo de pieza (con su QR) a una versión que todavía no se publicó. Devuelve su id de fila. */
  addPieceType(tenantId: string, designVersionId: string, input: NewPieceType): Promise<string>;
  /** Lee una versión como el `FurnitureDef` que usa la ficha. null si no existe en esa carpintería. */
  getFurnitureDef(tenantId: string, designVersionId: string): Promise<FurnitureDef | null>;
  /** Versiones de la carpintería, por fecha de creación y número. */
  listDesignVersions(tenantId: string): Promise<DesignVersionSummary[]>;
  /** Publica la versión; la que estaba publicada pasa a `reemplazada`. Una versión ya publicada no se vuelve a publicar. */
  publish(tenantId: string, designVersionId: string, publishedBy: string): Promise<void>;
}

export interface QrRepository {
  /**
   * Única función sin tenantId: es la puerta de entrada. Devuelve la carpintería.
   * Un qrId de mueble resuelve a su versión publicada (null si no tiene ninguna).
   */
  resolve(qrId: string): Promise<QrResolution | null>;
  /** Crea un QR opaco (`newQrId`) para un tipo de pieza de una versión sin publicar. */
  create(tenantId: string, pieceTypeId: string): Promise<string>;
}

export interface RunRepository {
  /** Guardar dos veces el mismo run (mismo `engineRunId`) no hace nada. */
  save(tenantId: string, designVersionId: string, run: AssociationRun): Promise<void>;
  get(tenantId: string, designVersionId: string, engineRunId: string): Promise<AssociationRun | null>;
}

export interface Persistence {
  tenants: TenantRepository;
  furniture: FurnitureRepository;
  qr: QrRepository;
  runs: RunRepository;
  projects: ProjectRepository;
  sessions: SessionRepository;
  erpDocuments: ErpDocumentRepository;
  /** Libera las conexiones (la implementación en memoria no hace nada). */
  close(): Promise<void>;
}

/** Lo que una implementación no decide sola: se inyecta para que las pruebas sean deterministas. */
export interface PersistenceDeps {
  newId(): string;
  newQrId(): string;
  now(): Date;
}

// --- Excepciones -------------------------------------------------------------------------------

export class TenantRequeridoError extends Error {
  constructor() {
    super("Falta el tenantId: toda operación es de una carpintería.");
    this.name = "TenantRequeridoError";
  }
}

export class TenantInexistenteError extends Error {
  constructor(readonly tenantId: string) {
    super(`La carpintería "${tenantId}" no existe.`);
    this.name = "TenantInexistenteError";
  }
}

export class CodigoRepetidoEnVersionError extends Error {
  constructor(readonly code: string) {
    super(`El código ${code} está repetido dentro de la versión de diseño.`);
    this.name = "CodigoRepetidoEnVersionError";
  }
}

export class QrDuplicadoError extends Error {
  constructor(readonly qrId: string) {
    super(`El qrId "${qrId}" ya existe: un QR nunca cambia de destino.`);
    this.name = "QrDuplicadoError";
  }
}

export class VersionInmutableError extends Error {
  constructor(readonly designVersionId: string) {
    super(`La versión de diseño ${designVersionId} ya se publicó y no se modifica.`);
    this.name = "VersionInmutableError";
  }
}

/**
 * La fila referida no existe en esta carpintería (o en esta versión). No distingue «es de otra carpintería»
 * de «no existe»: decirlo revelaría datos de otra carpintería.
 */
export class ReferenciaDeOtroTenantError extends Error {
  constructor(readonly entity: string) {
    super(`La referencia a ${entity} no existe en esta carpintería.`);
    this.name = "ReferenciaDeOtroTenantError";
  }
}

/** El `FurnitureDef` que se quiere guardar no es coherente (módulo inexistente, mueble que no coincide). */
export class MuebleInvalidoError extends Error {
  constructor(readonly motivo: string) {
    super(`El mueble no se puede guardar: ${motivo}.`);
    this.name = "MuebleInvalidoError";
  }
}

/** Un dato leído de la base no tiene la forma esperada. */
export class DocumentoInvalidoError extends Error {
  constructor(readonly campo: string) {
    super(`El dato guardado en ${campo} no tiene la forma esperada.`);
    this.name = "DocumentoInvalidoError";
  }
}

export class BaseNoLocalError extends Error {
  constructor(readonly host: string) {
    super(`La base "${host}" no es local: migrar o cargar datos fuera de local requiere aprobación del equipo.`);
    this.name = "BaseNoLocalError";
  }
}

/**
 * S2A-4: la base no respondió (conexión rechazada, caída, tiempo agotado). Lleva la causa original en `cause`.
 * El mensaje no incluye la URL de la base (lleva la clave). Quien la recibe muestra un error: nunca cae a datos estáticos.
 */
export class PersistenciaNoDisponibleError extends Error {
  constructor(options: { cause?: unknown } = {}) {
    super("La base de datos no respondió.", options);
    this.name = "PersistenciaNoDisponibleError";
  }
}

export function assertTenant(tenantId: string): void {
  if (typeof tenantId !== "string" || tenantId.trim() === "") throw new TenantRequeridoError();
}
