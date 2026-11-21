// S2: contrato de la persistencia (docs/spec-s2-base-de-datos.md §3; ADR-002).
// Lo único que conocen los casos de uso. Sin imports de kysely, pg ni next (B9, prueba PB-13).
// Las dos implementaciones (memory/ y sql/) lanzan las mismas excepciones en los mismos casos.

import type { FurnitureDef, PieceType } from "@/data/types";
import type { AssociationRun } from "@/engine/types";
import type { EstadoTrabajo } from "@/lib/erp/estados";

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
 * IE-2: sesión propia de la integración con el ERP (docs/spec-integracion-erp-minima.md v0.3). `id` es el sha256
 * (hex) del token de sesión que lleva la cookie: la base nunca ve la cookie. **No se guarda el token del ERP**
 * (contrato UCP v1 §1): solo `sub` y `tenant_id`. `expiresAt` es el `exp` del último token aceptado.
 */
export interface ErpSession {
  id: string;
  tenantId: string;
  erpUserId: string;
  erpTenantId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** IE-9: proyecto que el ERP envió (`proyecto` de POST /api/trabajos). No se guarda `cliente` (minimización). */
export interface ErpProject {
  id: string;
  /** `proyecto.uuid` del ERP, en minúsculas. Único por carpintería. */
  erpProjectId: string;
  code: string;
  name: string;
  /** `proyecto.fechaEntrega` (AAAA-MM-DD) o null. */
  deliveryDate: string | null;
}

export interface JobFile {
  sha256: string;
  version: number;
  name: string;
}

/** IE-9: un envío del ERP (POST /api/trabajos). `id` es el `trabajoUuid` que se le devuelve al ERP. */
export interface Job {
  id: string;
  envioUuid: string;
  projectId: string;
  status: EstadoTrabajo;
  /** Obligatorio con `failed`: la causa, legible para el usuario del ERP. */
  message: string | null;
  model: JobFile;
  csv: JobFile;
  createdAt: Date;
  updatedAt: Date;
}

export type NewJob = Omit<Job, "id" | "createdAt" | "updatedAt"> & { id?: string };

/** Lo que pide `jobs.claim`: el trabajo sin estado ni mensaje (nace `inProgress`). */
export type ClaimJob = Omit<NewJob, "status" | "message">;

export type ClaimResult =
  | { job: Job; outcome: "created" }
  | { job: Job; outcome: "retry"; previous: { message: string } }
  | { job: Job; outcome: "existing" };

// --- Repositorios ------------------------------------------------------------------------------

export interface TenantRepository {
  create(input: { id?: string; name: string; erpTenantId?: string | null }): Promise<Tenant>;
  get(tenantId: string): Promise<Tenant | null>;
  /**
   * IE-6: la carpintería de un tenant del ERP; si no existe, se crea con ese `erpTenantId` (único en la base).
   * Es una puerta de entrada (como `qr.resolve`): no lleva tenantId porque es lo que se busca.
   */
  ensureErpTenant(input: { erpTenantId: string; name: string }): Promise<Tenant>;
  /** La carpintería de un tenant del ERP, o null (para leer sin crear). Puerta de entrada, como `ensureErpTenant`. */
  findErpTenant(erpTenantId: string): Promise<Tenant | null>;
}

/** IE-9: proyectos que envió el ERP. */
export interface ProjectRepository {
  /**
   * Id de fila del proyecto del ERP en la carpintería. Si no existe se crea; si existe se actualizan código, nombre y
   * fecha de entrega (el ERP manda los vigentes en cada envío). Único por carpintería.
   */
  upsertErpProject(tenantId: string, input: Omit<ErpProject, "id">): Promise<string>;
  getErpProject(tenantId: string, erpProjectId: string): Promise<ErpProject | null>;
  /** Por código y uuid (orden binario). */
  listErpProjects(tenantId: string): Promise<ErpProject[]>;
}

export interface SessionRepository {
  create(session: Omit<ErpSession, "revokedAt">): Promise<void>;
  /** Puerta de entrada: la sesión por su id (sha256 de la cookie), o null. No filtra vencidas ni revocadas. */
  get(id: string): Promise<ErpSession | null>;
  /** IE-2: un token renovado corre el vencimiento. false si la sesión no existe o está revocada. */
  extend(tenantId: string, id: string, expiresAt: Date): Promise<boolean>;
  /** Revocar dos veces no hace nada. */
  revoke(id: string, at: Date): Promise<void>;
}

export interface JobRepository {
  /**
   * IE-7: crea el trabajo; si ya hay uno con el mismo `envioUuid` en la carpintería, devuelve ese (`created: false`)
   * sin tocarlo (idempotencia, también entre dos pedidos a la vez). Con `failed` sin `message`: `TrabajoSinCausaError`.
   */
  create(tenantId: string, input: NewJob): Promise<{ job: Job; created: boolean }>;
  /**
   * IE-7: reserva el envío antes de descargar, de forma atómica (también entre dos pedidos a la vez):
   *  - no hay trabajo con ese `envioUuid` → lo crea `inProgress` (`created`);
   *  - hay uno `failed`, o `inProgress` que no se toca desde `staleBefore` (el proceso que lo tenía murió) → lo toma
   *    sobre el MISMO id, pasa a `inProgress` y actualiza proyecto y archivos (`retry`; `previous` es lo que había);
   *  - hay uno `success`, `pending` o `inProgress` vigente → no lo toca (`existing`).
   * Solo quien recibe `created` o `retry` descarga; después llama a `settle` o a `abandon`.
   */
  claim(tenantId: string, input: ClaimJob, staleBefore: Date): Promise<ClaimResult>;
  /** Cierra un trabajo `inProgress` con `success` o `failed` (este con `message`: `TrabajoSinCausaError`). Actualiza `updatedAt`. */
  settle(tenantId: string, jobId: string, result: { status: "success" | "failed"; message: string }): Promise<Job>;
  /**
   * Deshace un `claim` cuando la descarga es reintentable (503): con `previous: null` borra el trabajo (no queda
   * rastro); con un estado, lo vuelve a `failed` con ese mensaje. Solo actúa si el trabajo sigue `inProgress`.
   */
  abandon(tenantId: string, jobId: string, previous: { message: string } | null): Promise<void>;
  get(tenantId: string, jobId: string): Promise<Job | null>;
  findByEnvio(tenantId: string, envioUuid: string): Promise<Job | null>;
  /** El último trabajo del proyecto (por creación), opcionalmente solo con un estado. */
  latestForProject(tenantId: string, projectId: string, status?: EstadoTrabajo): Promise<Job | null>;
}

/**
 * IE-10: almacenamiento de archivos por sha256, dentro de la carpintería. Implementación inicial en la base; ASUMIDO y
 * reversible hasta decidir dónde van los archivos (S3, docs/spec-s3-almacenamiento-archivos.md). Quien guarda ya
 * verificó el sha256 y el tamaño. Guardar dos veces el mismo no hace nada.
 */
export interface Almacen {
  guardar(tenantId: string, sha256: string, datos: Uint8Array): Promise<void>;
  leer(tenantId: string, sha256: string): Promise<Uint8Array | null>;
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
  jobs: JobRepository;
  almacen: Almacen;
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

/** IE-7 (respuestas del 20/11): un trabajo `failed` tiene que decir la causa. */
export class TrabajoSinCausaError extends Error {
  constructor() {
    super("Un trabajo con estado failed necesita un mensaje con la causa.");
    this.name = "TrabajoSinCausaError";
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

/** Por qué no se acepta una base remota en `db:migrate:remota` / `db:seed:remota` (S2B-1, S2B-2). */
export type MotivoBaseRemota = "url-ilegible" | "es-local" | "sin-confirmar" | "host-distinto" | "sin-tls";

const TEXTO_BASE_REMOTA: Record<MotivoBaseRemota, string> = {
  "url-ilegible": "la URL de DATABASE_URL no se puede leer",
  "es-local": "es local: usá db:migrate y db:seed",
  "sin-confirmar": "falta confirmarla: definí DB_REMOTA_HOST con el host exacto de la base",
  "host-distinto": "DB_REMOTA_HOST no es el host de DATABASE_URL",
  "sin-tls": "la URL tiene que pedir una conexión cifrada (sslmode=require, verify-ca o verify-full)",
};

/** S2B-1: la base remota no está confirmada o no va cifrada. El mensaje lleva solo el host, nunca la URL. */
export class BaseRemotaNoConfirmadaError extends Error {
  constructor(
    readonly host: string,
    readonly motivo: MotivoBaseRemota,
  ) {
    super(`La base "${host}" no se toca: ${TEXTO_BASE_REMOTA[motivo]}.`);
    this.name = "BaseRemotaNoConfirmadaError";
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
