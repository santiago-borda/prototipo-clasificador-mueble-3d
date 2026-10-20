// Lógica de las rutas del importador de prueba (Request -> Response), separada de los archivos de ruta de Next
// para poder probarla con el almacenamiento en memoria. Los `route.ts` solo la conectan.
//
// Escritura (registrar, listar, borrar, pedir token): exige la clave compartida en el encabezado `x-import-key`,
// comprobada acá, dentro de cada handler (no hay middleware ni proxy de auth). Sin almacenamiento o sin clave
// configurados, responde 503. Lectura (`read`, `model`): abierta, por link con id no adivinable.

import { createHash, timingSafeEqual } from "node:crypto";
import type { FurnitureDef } from "@/data/types";
import type { AssociationReport } from "@/data/mapping";
import type { ModelVerification } from "@/model/verifyModel";
import { buildFurnitureDef, type ImportedFurnitureDef } from "./buildDef";
import { readListing } from "./listing";
import { IMPORT_ID_FORMAT, IMPORTS_PREFIX, MAX_CSV_BYTES, MAX_DAE_BYTES, MAX_IMPORTS, UPLOAD_PATH, importPaths } from "./paths";
import { statusOf, type ImportStatus } from "./report";
import type { ImportStore } from "./store";

export class ImportError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Resultado del cruce con el .dae, calculado en el navegador (el servidor no valida el .dae). */
export interface CruceCliente {
  verification: ModelVerification;
  association: AssociationReport;
}

export interface ImportInforme {
  importId: string;
  mueble: string;
  estado: ImportStatus;
  fecha: string;
  archivos: { dae: { nombre: string; bytes: number }; csv: { nombre: string; bytes: number } };
  validadoEn: { dae: "cliente"; csv: "servidor" };
  issues: ReturnType<typeof readListing>["issues"];
  cruce: CruceCliente | null;
}

export interface ImportListItem {
  id: string;
  mueble: string;
  estado: ImportStatus;
  fecha: string;
}

export interface ImportApiConfig {
  store?: ImportStore;
  uploadKey?: string;
  now?: () => Date;
}

export interface ImportApi {
  /** Hay almacenamiento y clave: la escritura está habilitada. */
  readonly configured: boolean;
  /** null si la petición puede escribir; si no, la respuesta 503 (sin configurar) o 401 (clave). */
  guard(request: Request): Promise<Response | null>;
  /** Para el token de subida directa: valida el path y devuelve las restricciones. Lanza `ImportError`. */
  authorizeUpload(pathname: string): Promise<{ maximumSizeInBytes: number; addRandomSuffix: false; allowOverwrite: false }>;
  register(request: Request): Promise<Response>;
  list(request: Request): Promise<Response>;
  read(id: string): Promise<Response>;
  model(id: string): Promise<Response>;
  remove(request: Request, id: string): Promise<Response>;
}

const fail = (status: number, error: string, code: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, code, ...extra }, { status });

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Comparación en tiempo constante (se comparan los hashes, así el largo de la clave no se filtra). */
function sameKey(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isStringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");
const isPositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function parseCruce(value: unknown): CruceCliente | null {
  if (value === undefined || value === null) return null;
  const v = isObject(value) ? value.verification : undefined;
  const a = isObject(value) ? value.association : undefined;
  if (
    !isObject(v) || !isStringArray(v.warnings) || !isStringArray(v.anomalies) ||
    !isObject(a) || !isStringArray(a.orphans) || !isStringArray(a.ambiguous) || !isStringArray(a.countMismatches) || typeof a.ok !== "boolean"
  ) {
    throw new ImportError(400, "El resultado del cruce con el .dae no tiene el formato esperado.", "cuerpo");
  }
  return value as unknown as CruceCliente;
}

export function createImportApi({ store, uploadKey, now = () => new Date() }: ImportApiConfig): ImportApi {
  const configured = Boolean(store && uploadKey);

  async function guard(request: Request): Promise<Response | null> {
    if (!store || !uploadKey) return fail(503, "Importación no configurada.", "sin-configurar");
    const given = request.headers.get("x-import-key");
    if (!given || !sameKey(given, uploadKey)) return fail(401, "Falta la clave de importación o es incorrecta.", "clave");
    return null;
  }

  /** Ids con `mueble.json`: las importaciones ya registradas. */
  async function registeredIds(s: ImportStore): Promise<string[]> {
    const paths = await s.list(IMPORTS_PREFIX);
    return paths.filter((p) => p.endsWith("/mueble.json")).map((p) => p.slice(IMPORTS_PREFIX.length).split("/")[0]);
  }

  async function ensureRoom(s: ImportStore, importId: string) {
    const others = (await registeredIds(s)).filter((id) => id !== importId);
    if (others.length >= MAX_IMPORTS) {
      throw new ImportError(409, `Se llegó al máximo de ${MAX_IMPORTS} importaciones guardadas. Borrá alguna para subir otra.`, "limite");
    }
  }

  /** Corre un handler y convierte los `ImportError` en respuestas. */
  async function run(handler: () => Promise<Response>): Promise<Response> {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof ImportError) return fail(error.status, error.message, error.code, error.extra);
      throw error;
    }
  }

  return {
    configured,
    guard,

    async authorizeUpload(pathname) {
      if (!store) throw new ImportError(503, "Importación no configurada.", "sin-configurar");
      const match = UPLOAD_PATH.exec(pathname);
      if (!match) {
        throw new ImportError(400, "Solo se pueden subir modelo.dae y listado.csv de una importación.", "path");
      }
      await ensureRoom(store, match[1]);
      return {
        maximumSizeInBytes: match[2] === "modelo.dae" ? MAX_DAE_BYTES : MAX_CSV_BYTES,
        addRandomSuffix: false,
        allowOverwrite: false,
      };
    },

    register: (request) =>
      run(async () => {
        const denied = await guard(request);
        if (denied) return denied;
        const s = store as ImportStore;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ImportError(400, "El cuerpo no es JSON.", "cuerpo");
        }
        if (!isObject(body) || typeof body.importId !== "string" || !IMPORT_ID_FORMAT.test(body.importId)) {
          throw new ImportError(400, "importId inválido (16 caracteres hexadecimales).", "cuerpo");
        }
        const importId = body.importId;
        const dims = body.dimsMm;
        if (!isObject(dims) || !isPositive(dims.x) || !isPositive(dims.y) || !isPositive(dims.z)) {
          throw new ImportError(400, "Faltan las medidas generales del mueble (dimsMm x, y, z en mm).", "cuerpo");
        }
        const names = isObject(body.nombres) ? body.nombres : {};
        const cruce = parseCruce(body.cruce);
        const paths = importPaths(importId);

        if (await s.get(paths.mueble)) throw new ImportError(409, "Esa importación ya está registrada.", "existe");
        await ensureRoom(s, importId);

        const [dae, csv] = await Promise.all([s.get(paths.dae), s.get(paths.csv)]);
        if (!dae || !csv) {
          throw new ImportError(400, "Faltan archivos subidos: hacen falta modelo.dae y listado.csv.", "faltan-archivos");
        }
        if (dae.body.byteLength > MAX_DAE_BYTES) throw new ImportError(413, "El .dae supera los 10 MB.", "tamano");
        if (csv.body.byteLength > MAX_CSV_BYTES) throw new ImportError(413, "El CSV supera 1 MB.", "tamano");

        const listing = readListing(text(csv.body));
        if (listing.issues.some((issue) => issue.severity === "error")) {
          return fail(422, "El CSV tiene errores.", "csv", { issues: listing.issues });
        }

        const mueble: ImportedFurnitureDef = buildFurnitureDef(listing.rows, {
          importId,
          dimsMm: { x: dims.x, y: dims.y, z: dims.z },
        });
        const estado = statusOf(listing.issues, cruce?.verification ?? null, cruce?.association ?? null);
        const informe: ImportInforme = {
          importId,
          mueble: mueble.furniture.name,
          estado,
          fecha: now().toISOString(),
          archivos: {
            dae: { nombre: typeof names.dae === "string" ? names.dae : "modelo.dae", bytes: dae.body.byteLength },
            csv: { nombre: typeof names.csv === "string" ? names.csv : "listado.csv", bytes: csv.body.byteLength },
          },
          validadoEn: { dae: "cliente", csv: "servidor" },
          issues: listing.issues,
          cruce,
        };

        // mueble.json va al final: es lo que marca la importación como registrada.
        await s.put(paths.informe, JSON.stringify(informe), "application/json");
        await s.put(paths.mueble, JSON.stringify(mueble), "application/json");
        return Response.json({ id: importId, estado, link: `/prueba/${importId}` }, { status: 201 });
      }),

    list: (request) =>
      run(async () => {
        const denied = await guard(request);
        if (denied) return denied;
        const s = store as ImportStore;
        const items: ImportListItem[] = [];
        for (const id of await registeredIds(s)) {
          const file = await s.get(importPaths(id).informe);
          if (!file) continue;
          const informe = JSON.parse(text(file.body)) as ImportInforme;
          items.push({ id, mueble: informe.mueble, estado: informe.estado, fecha: informe.fecha });
        }
        items.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
        return Response.json(items);
      }),

    read: (id) =>
      run(async () => {
        if (!store) throw new ImportError(503, "Importación no configurada.", "sin-configurar");
        if (!IMPORT_ID_FORMAT.test(id)) throw new ImportError(404, "No existe esa importación.", "no-existe");
        const paths = importPaths(id);
        const [mueble, informe] = await Promise.all([store.get(paths.mueble), store.get(paths.informe)]);
        if (!mueble || !informe) throw new ImportError(404, "No existe esa importación.", "no-existe");
        return Response.json({
          mueble: JSON.parse(text(mueble.body)) as ImportedFurnitureDef,
          informe: JSON.parse(text(informe.body)) as ImportInforme,
        });
      }),

    model: (id) =>
      run(async () => {
        if (!store) throw new ImportError(503, "Importación no configurada.", "sin-configurar");
        if (!IMPORT_ID_FORMAT.test(id)) throw new ImportError(404, "No existe esa importación.", "no-existe");
        const paths = importPaths(id);
        // Una subida sin registrar (sin mueble.json) no se sirve.
        const [registered, dae] = await Promise.all([store.get(paths.mueble), store.get(paths.dae)]);
        if (!registered || !dae) throw new ImportError(404, "No existe esa importación.", "no-existe");
        return new Response(dae.body as unknown as BodyInit, {
          headers: { "content-type": "model/vnd.collada+xml", "cache-control": "private, max-age=3600" },
        });
      }),

    remove: (request, id) =>
      run(async () => {
        const denied = await guard(request);
        if (denied) return denied;
        const s = store as ImportStore;
        if (!IMPORT_ID_FORMAT.test(id)) throw new ImportError(404, "No existe esa importación.", "no-existe");
        const files = await s.list(importPaths(id).dir);
        if (files.length === 0) throw new ImportError(404, "No existe esa importación.", "no-existe");
        await s.delete(files);
        return Response.json({ id, borrados: files.length });
      }),
  };
}

export type { FurnitureDef };
