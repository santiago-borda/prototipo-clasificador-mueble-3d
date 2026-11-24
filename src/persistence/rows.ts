// S2: forma de las filas, una interfaz por tabla (docs/modelo-de-datos.md §2). Solo tipos.
// La usan los mapeadores, la implementación en memoria y (cuando exista) la de SQL: es la fuente única del esquema en TS.
// Subconjunto común de SQL (S2-D6): ids como texto, documentos como texto JSON, fechas UTC, medidas en doble precisión.

export interface TenantRow {
  id: string;
  erp_tenant_id: string | null;
  name: string;
  enabled: boolean;
  created_at: Date;
}

export interface ProjectRow {
  tenant_id: string;
  id: string;
  /** IE-9: `proyecto.uuid` del ERP (en minúsculas); null en los proyectos propios. */
  erp_project_id: string | null;
  name: string;
  /** IE-9 (migración 0002): `proyecto.codigo` del ERP (p. ej. "P-0142"). */
  erp_code: string | null;
  /** IE-9 (migración 0002): `proyecto.fechaEntrega`, texto AAAA-MM-DD (subconjunto común de SQL, sin tipo date). */
  delivery_date: string | null;
  created_at: Date;
}

export interface FurnitureRow {
  tenant_id: string;
  id: string;
  project_id: string;
  erp_furniture_id: string | null;
  /** `Furniture.id` del prototipo ("olmo"). */
  legacy_id: string | null;
  /** qrId heredado de mueble (S2-D7). Único en toda la base. */
  legacy_qr_id: string | null;
  name: string;
  published_version_id: string | null;
  created_at: Date;
}

export interface DesignVersionRow {
  tenant_id: string;
  id: string;
  public_id: string;
  furniture_id: string;
  number: number;
  status: string;
  /** `Furniture.designVersion` ("v1"): texto que muestra la ficha. */
  label: string;
  /** Nombre del mueble en esta versión (la ficha de una versión vieja no cambia si después se renombra el mueble). */
  name: string;
  model_id: string | null;
  model_file_id: string | null;
  model_url: string | null;
  texture_base_url: string | null;
  dim_x_mm: number;
  dim_y_mm: number;
  dim_z_mm: number;
  tolerance_mm: number;
  edge_band_type: string;
  edge_band_width_mm: number;
  edge_band_thickness_mm: number;
  edge_band_status: string;
  edge_band_note: string | null;
  created_by: string;
  created_at: Date;
  published_by: string | null;
  published_at: Date | null;
}

export interface ModuleRow {
  tenant_id: string;
  id: string;
  design_version_id: string;
  /** `Module.id` del prototipo ("mod-escritorio"). */
  legacy_id: string | null;
  /** qrId heredado de módulo (S2-D7). Único en toda la base. */
  legacy_qr_id: string | null;
  name: string;
  position: number;
}

export interface PieceTypeRow {
  tenant_id: string;
  id: string;
  design_version_id: string;
  module_id: string | null;
  position: number;
  code: string;
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  material: string;
  quantity: number;
  /** Texto JSON con la lista de bordes (`[]` = sin canto). NULL = sin dato. */
  edge_banding: string | null;
  notes: string | null;
}

export interface QrCodeRow {
  tenant_id: string;
  /** El texto del QR. Único en toda la base. */
  id: string;
  piece_type_id: string;
  design_version_id: string;
  /** 1 = el QR con el que se creó el tipo de pieza (el que muestra la ficha). */
  ordinal: number;
  created_at: Date;
  revoked_at: Date | null;
}

export interface StoredFileRow {
  tenant_id: string;
  id: string;
  sha256: string;
  bytes: number;
  content_type: string;
  kind: string;
  original_name: string;
  storage_key: string;
  uploaded_by: string;
  created_at: Date;
}

export interface ListingRow {
  tenant_id: string;
  id: string;
  design_version_id: string;
  source: string;
  source_file_id: string | null;
  status: string;
  listado_id: string | null;
  /** Texto JSON con el `Listing` completo. */
  document: string;
  created_at: Date;
}

export interface EngineRunRow {
  tenant_id: string;
  id: string;
  design_version_id: string;
  engine_run_id: string;
  model_id: string;
  listado_id: string;
  passes: number;
  /** Texto JSON: `JSON.stringify` del `AssociationRun`, tal cual (B8). */
  document: string;
  created_at: Date;
}

/** IE-2 (migración 0002_integracion_erp). `id` = sha256 hex del token de sesión. Sin el token del ERP (contrato §1). */
export interface SessionRow {
  tenant_id: string;
  id: string;
  erp_user_id: string;
  erp_tenant_id: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

/** IE-9 (migración 0002_integracion_erp): un envío del ERP. `id` = `trabajoUuid`. */
export interface JobRow {
  tenant_id: string;
  id: string;
  envio_uuid: string;
  project_id: string;
  /** `pending | inProgress | success | failed` (src/lib/erp/estados.ts). */
  status: string;
  message: string | null;
  model_sha256: string;
  model_version: number;
  model_name: string;
  csv_sha256: string;
  csv_version: number;
  csv_name: string;
  created_at: Date;
  updated_at: Date;
}

/** IE-10 (migración 0002_integracion_erp): contenido de un archivo, por carpintería y sha256. */
export interface FileContentRow {
  tenant_id: string;
  sha256: string;
  bytes: number;
  content: Uint8Array;
  created_at: Date;
}
