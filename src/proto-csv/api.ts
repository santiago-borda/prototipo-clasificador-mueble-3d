// Lógica de las rutas del spike (Request -> Response), separada de los route.ts para probarla con el store en memoria
// (docs/spec-proto-csv-ocl.md §4). Solo servidor: usa node:crypto (sha256 y modelId).
//
// Escritura (token, registrar, cambiar estado, listar, borrar): clave compartida `x-import-key`, con el mismo `guard`
// del importador. Lectura (`read`, `file`): abierta por link, con id no adivinable, solo de cargas registradas.
// Todo acceso al store pasa por `scopedStore` (solo `proto-csv/`, P3).

import { createHash } from "node:crypto";
import { listadoId, modelId as modelIdOf } from "@/engine/hash";
import { createImportApi } from "@/importer/api";
import type { ImportStore } from "@/importer/store";
import { parseOclCsv, type CsvIssue } from "./parse";
import type { CruceCliente, TypeReason } from "./review";
import { MAX_BYTES, MAX_CARGAS, PROTO_ID, PROTO_PREFIX, ProtoPathError, parseProtoKey, protoDir, protoPath, scopedStore } from "./paths";

export const ESTADOS = ["en-revision", "aprobado", "rechazado", "publicado-simulado"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Transiciones válidas (§4). Cualquier otra responde 409. */
const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  "en-revision": ["aprobado", "rechazado"],
  aprobado: ["publicado-simulado"],
  rechazado: [],
  "publicado-simulado": [],
};

export interface Evento {
  n: number;
  estado: Estado;
  fecha: string;
  motivo?: string;
  /**
   * Solo en `aprobado` con advertencias (v0.4): las que quien revisa aceptó, leídas de `informe.cruce` (no del cuerpo de
   * la petición). Opcional: los eventos anteriores, sin este campo, siguen siendo válidos.
   */
  advertenciasAceptadas?: { code: string; reasons: TypeReason[] }[];
}

export interface ProtoInforme {
  id: string;
  fecha: string;
  archivos: { path: string; nombre: string; bytes: number; sha256: string }[];
  modelId: string;
  /** Solo si el listado es publicable (un borrador no tiene listadoId publicado). */
  listadoId: string | null;
  svgMaterial: string | null;
  csv: { status: "publicable" | "borrador"; tipos: number; piezas: number; excluidos: string[]; filasSinCodigo: number; edgeTotalMm: number; issues: CsvIssue[] };
  cruce: CruceCliente;
  validadoEn: { csv: "servidor"; modelId: "servidor"; cruce: "cliente" };
}

export interface ProtoApiConfig {
  store?: ImportStore;
  uploadKey?: string;
  now?: () => Date;
  /** Registro de fallos (borrado de una carga rechazada). Por defecto, console.error. */
  log?: (message: string) => void;
}

const fail = (status: number, error: string, code: string, extra: Record<string, unknown> = {}) => Response.json({ error, code, ...extra }, { status });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function parseCruce(value: unknown): CruceCliente {
  const ok =
    isObject(value) &&
    typeof value.canApprove === "boolean" &&
    ["dudosas", "orphanInstances", "looseMeshes", "unkeyedRows"].every((k) => typeof value[k] === "number") &&
    (value.advertencias === undefined || typeof value.advertencias === "number") &&
    typeof value.modelHasEdgeFaces === "boolean" &&
    Array.isArray(value.types) &&
    value.types.every(
      (t) =>
        isObject(t) &&
        typeof t.code === "string" &&
        (t.level === "segura" || t.level === "advertencia" || t.level === "dudosa") &&
        Array.isArray(t.reasons) &&
        t.reasons.every((r) => isObject(r) && typeof r.source === "string" && typeof r.reason === "string") &&
        typeof t.edgeCheck === "string",
    );
  if (!ok) throw new HttpError(400, "El resultado del cruce con el .dae no tiene el formato esperado.", "cuerpo");
  const cruce = value as unknown as CruceCliente;
  // Cruce con el formato anterior (sin contador): se completa desde los tipos.
  return { ...cruce, advertencias: cruce.advertencias ?? cruce.types.filter((t) => t.level === "advertencia").length };
}

/**
 * Content-Type fijo por tipo de archivo permitido (el que valida `parseProtoKey`), nunca el que guardó el Blob.
 * Las texturas se distinguen por la extensión ya validada (.png / .jpg / .jpeg).
 */
function contentTypeOf(rel: string, kind: "csv" | "dae" | "textura" | "svg"): string {
  switch (kind) {
    case "csv":
      return "text/csv; charset=utf-8";
    case "dae":
      return "model/vnd.collada+xml";
    case "svg":
      return "image/svg+xml";
    case "textura":
      return /\.png$/i.test(rel) ? "image/png" : "image/jpeg";
  }
}

/** Cabeceras de todo archivo servido: sin sniffing y sin ejecutar nada (un SVG con <script> no corre). */
export const FILE_SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
} as const;

export function createProtoApi({ store: rawStore, uploadKey, now = () => new Date(), log = (m) => console.error(m) }: ProtoApiConfig) {
  const store = rawStore ? scopedStore(rawStore) : undefined;
  // Mismo guard del importador: 503 sin store o sin clave, 401 con clave ausente o incorrecta.
  const { guard } = createImportApi({ store, uploadKey });

  const need = (): ImportStore => {
    if (!store) throw new HttpError(503, "Carga por CSV no configurada.", "sin-configurar");
    return store;
  };

  async function run(handler: () => Promise<Response>): Promise<Response> {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.message, error.code, error.extra);
      if (error instanceof ProtoPathError) return fail(400, error.message, "path");
      throw error;
    }
  }

  /** Ids con algún archivo bajo `proto-csv/<id>/` (el tope cuenta estos). */
  async function existingIds(s: ImportStore): Promise<string[]> {
    const keys = await s.list(PROTO_PREFIX);
    return [...new Set(keys.map((k) => k.slice(PROTO_PREFIX.length).split("/")[0]).filter((id) => PROTO_ID.test(id)))].sort();
  }

  async function eventsOf(s: ImportStore, id: string): Promise<Evento[]> {
    const keys = (await s.list(protoDir(id))).filter((k) => k.startsWith(`${protoDir(id)}eventos/`)).sort();
    const events: Evento[] = [];
    for (const key of keys) {
      const file = await s.get(key);
      if (file) events.push(JSON.parse(text(file.body)) as Evento);
    }
    return events;
  }

  async function writeEvent(s: ImportStore, id: string, estado: Estado, motivo?: string, advertenciasAceptadas?: Evento["advertenciasAceptadas"]) {
    const n = (await eventsOf(s, id)).length + 1;
    const evento: Evento = { n, estado, fecha: now().toISOString(), ...(motivo ? { motivo } : {}), ...(advertenciasAceptadas ? { advertenciasAceptadas } : {}) };
    try {
      await s.put(protoPath(id, `eventos/${String(n).padStart(4, "0")}-${estado}.json`), JSON.stringify(evento), "application/json");
    } catch {
      throw new HttpError(409, "Otro cambio de estado llegó al mismo tiempo. Recargá y volvé a intentar.", "concurrencia");
    }
    return evento;
  }

  async function informeOf(s: ImportStore, id: string): Promise<ProtoInforme> {
    if (!PROTO_ID.test(id)) throw new HttpError(404, "No existe esa carga.", "no-existe");
    const file = await s.get(protoPath(id, "informe.json"));
    if (!file) throw new HttpError(404, "No existe esa carga.", "no-existe");
    return JSON.parse(text(file.body)) as ProtoInforme;
  }

  /** Rechazo del servidor: borra lo subido. Si el borrado falla, la carga sigue contando para el tope y se registra. */
  async function rejectAndClean(s: ImportStore, id: string, status: number, message: string, code: string, extra: Record<string, unknown> = {}) {
    let limpieza: "hecha" | "fallida" = "hecha";
    try {
      await s.delete(await s.list(protoDir(id)));
    } catch (error) {
      limpieza = "fallida";
      log(`proto-csv: no se pudo borrar la carga rechazada ${id} (${code}): ${error instanceof Error ? error.message : String(error)}`);
    }
    return fail(status, message, code, { ...extra, limpieza });
  }

  return {
    get configured() {
      return Boolean(store && uploadKey);
    },
    guard,

    /** Token de subida directa: solo archivos que sube el navegador, con su tamaño máximo, y respetando el tope. */
    async authorizeUpload(pathname: string) {
      const s = need();
      const { id, upload } = parseProtoKey(pathname);
      if (!upload) throw new HttpError(400, "Ese archivo lo escribe el servidor, no se sube.", "path");
      // Registrada = tiene informe.json (y su evento en-revision): no se suben más archivos, así el sha256 del informe
      // no queda desactualizado. `allowOverwrite: false` además impide pisar un archivo que ya existe.
      if (await s.get(protoPath(id, "informe.json"))) {
        throw new HttpError(409, "Esa carga ya está registrada: no se le pueden subir más archivos. Empezá una carga nueva.", "ya-registrada");
      }
      const ids = await existingIds(s);
      if (!ids.includes(id) && ids.length >= MAX_CARGAS) {
        throw new HttpError(409, `Se llegó al máximo de ${MAX_CARGAS} cargas de prueba. Borrá alguna para subir otra.`, "limite");
      }
      return { maximumSizeInBytes: MAX_BYTES[upload], addRandomSuffix: false, allowOverwrite: false };
    },

    register: (request: Request) =>
      run(async () => {
        const denied = await guard(request);
        if (denied) return denied;
        const s = need();

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new HttpError(400, "El cuerpo no es JSON.", "cuerpo");
        }
        if (!isObject(body) || typeof body.id !== "string" || !PROTO_ID.test(body.id)) throw new HttpError(400, "id inválido (16 hexadecimales).", "cuerpo");
        if (typeof body.modelId !== "string") throw new HttpError(400, "Falta el modelId calculado en el navegador.", "cuerpo");
        const id = body.id;
        const cruce = parseCruce(body.cruce);
        const svgMaterial = typeof body.svgMaterial === "string" ? body.svgMaterial : null;
        const names = isObject(body.nombres) ? body.nombres : {};

        if (await s.get(protoPath(id, "informe.json"))) throw new HttpError(409, "Esa carga ya está registrada.", "existe");
        const keys = await s.list(protoDir(id));
        const [csvFile, daeFile] = await Promise.all([s.get(protoPath(id, "listado.csv")), s.get(protoPath(id, "modelo.dae"))]);
        if (!csvFile || !daeFile) throw new HttpError(400, "Faltan archivos subidos: hacen falta listado.csv y modelo.dae.", "faltan-archivos");

        // Rechazos con limpieza (C15): encabezado o contenido del CSV que no se puede leer, y modelId distinto.
        const parsed = parseOclCsv(text(csvFile.body));
        if (!parsed.ok) return rejectAndClean(s, id, 422, parsed.message, parsed.reason, { column: parsed.column });
        const serverModelId = modelIdOf(daeFile.body);
        if (serverModelId !== body.modelId) {
          return rejectAndClean(s, id, 422, "El .dae guardado no es el que se validó en el navegador (modelId distinto). Volvé a subir los archivos.", "modelo-distinto");
        }

        const { listing } = parsed;
        // El cruce del cliente tiene que hablar de los mismos códigos que el CSV que revalidó el servidor.
        const serverCodes = [...listing.pieces.map((p) => p.code), ...(listing.status === "borrador" ? listing.excluded.map((e) => e.code) : [])].sort();
        const clientCodes = cruce.types.map((t) => t.code).sort();
        if (JSON.stringify(serverCodes) !== JSON.stringify(clientCodes)) {
          throw new HttpError(400, "El cruce enviado no corresponde al CSV subido.", "cruce-distinto");
        }

        const archivos = [];
        for (const key of keys.sort()) {
          const { rel } = parseProtoKey(key);
          const file = await s.get(key);
          if (!file) continue;
          const nombre = rel === "listado.csv" && typeof names.csv === "string" ? names.csv : rel === "modelo.dae" && typeof names.dae === "string" ? names.dae : rel;
          archivos.push({ path: rel, nombre, bytes: file.body.byteLength, sha256: `sha256:${sha256(file.body)}` });
        }

        const informe: ProtoInforme = {
          id,
          fecha: now().toISOString(),
          archivos,
          modelId: serverModelId,
          listadoId: listing.status === "publicable" ? listadoId(listing.pieces) : null,
          svgMaterial,
          csv: {
            status: listing.status,
            tipos: listing.pieces.length,
            piezas: listing.pieces.reduce((n, p) => n + p.quantity, 0),
            excluidos: listing.status === "borrador" ? listing.excluded.map((e) => e.code) : [],
            filasSinCodigo: listing.status === "borrador" ? listing.unkeyedRows.length : 0,
            edgeTotalMm: parsed.edgeTotalMm,
            issues: parsed.issues,
          },
          cruce,
          validadoEn: { csv: "servidor", modelId: "servidor", cruce: "cliente" },
        };
        await s.put(protoPath(id, "informe.json"), JSON.stringify(informe), "application/json");
        await writeEvent(s, id, "en-revision");
        return Response.json({ id, estado: "en-revision", link: `/backoffice/csv/${id}` }, { status: 201 });
      }),

    changeState: (request: Request, id: string) =>
      run(async () => {
        const denied = await guard(request);
        if (denied) return denied;
        const s = need();
        const informe = await informeOf(s, id);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new HttpError(400, "El cuerpo no es JSON.", "cuerpo");
        }
        const to = isObject(body) ? body.estado : undefined;
        if (typeof to !== "string" || !(ESTADOS as readonly string[]).includes(to)) throw new HttpError(400, "Estado desconocido.", "cuerpo");
        const motivo = isObject(body) && typeof body.motivo === "string" ? body.motivo.trim() : "";

        const events = await eventsOf(s, id);
        const current = events.at(-1)?.estado ?? "en-revision";
        if (!TRANSICIONES[current].includes(to as Estado)) {
          throw new HttpError(409, `No se puede pasar de «${current}» a «${to}».`, "transicion", { estado: current });
        }
        if (to === "aprobado" && !(informe.csv.status === "publicable" && informe.cruce.canApprove && informe.cruce.dudosas === 0)) {
          throw new HttpError(409, "Con dudosas solo se puede rechazar: resolverlas queda fuera del spike.", "dudosas", { estado: current });
        }
        if (to === "rechazado" && motivo === "") throw new HttpError(400, "Rechazar exige un motivo.", "motivo");
        // Aprobar con advertencias (v0.4): motivo obligatorio y se guarda lo aceptado, leído del informe y no del cuerpo.
        const aceptadas =
          to === "aprobado"
            ? informe.cruce.types.filter((t) => t.level === "advertencia").map((t) => ({ code: t.code, reasons: t.reasons }))
            : [];
        if (aceptadas.length > 0 && motivo === "") {
          throw new HttpError(400, "Aprobar con advertencias exige un motivo: indicá que las revisaste y por qué las aceptás.", "motivo");
        }
        const evento = await writeEvent(s, id, to as Estado, motivo || undefined, aceptadas.length > 0 ? aceptadas : undefined);
        return Response.json({ id, estado: evento.estado, evento });
      }),

    list: (request: Request) =>
      run(async () => {
        const denied = await guard(request);
        if (denied) return denied;
        const s = need();
        const items = [];
        for (const id of await existingIds(s)) {
          const file = await s.get(protoPath(id, "informe.json"));
          const events = file ? await eventsOf(s, id) : [];
          items.push({ id, registrada: Boolean(file), estado: events.at(-1)?.estado ?? null, fecha: file ? (JSON.parse(text(file.body)) as ProtoInforme).fecha : null });
        }
        return Response.json({ cargas: items, tope: MAX_CARGAS });
      }),

    read: (id: string) =>
      run(async () => {
        const s = need();
        const informe = await informeOf(s, id);
        const eventos = await eventsOf(s, id);
        return Response.json({ informe, eventos, estado: eventos.at(-1)?.estado ?? "en-revision" });
      }),

    /**
     * Archivo de una carga registrada (el Blob es privado: se transmite desde acá). Solo los que lista el informe y
     * con el mismo sha256: un archivo agregado o cambiado después del registro no se sirve.
     */
    file: (id: string, rel: string) =>
      run(async () => {
        const s = need();
        const informe = await informeOf(s, id);
        const key = protoPath(id, rel);
        const { upload } = parseProtoKey(key);
        const listed = informe.archivos.find((a) => a.path === rel);
        if (upload === null || !listed) throw new HttpError(404, "No existe ese archivo.", "no-existe");
        const file = await s.get(key);
        if (!file) throw new HttpError(404, "No existe ese archivo.", "no-existe");
        if (`sha256:${sha256(file.body)}` !== listed.sha256) {
          throw new HttpError(409, "El archivo no coincide con el registrado (sha256 distinto): no se sirve.", "archivo-alterado");
        }
        return new Response(file.body as unknown as BodyInit, {
          headers: { "content-type": contentTypeOf(rel, upload), "cache-control": "private, max-age=3600", ...FILE_SECURITY_HEADERS },
        });
      }),

    remove: (request: Request, id: string) =>
      run(async () => {
        const denied = await guard(request);
        if (denied) return denied;
        const s = need();
        if (!PROTO_ID.test(id)) throw new HttpError(404, "No existe esa carga.", "no-existe");
        const keys = await s.list(protoDir(id));
        if (keys.length === 0) throw new HttpError(404, "No existe esa carga.", "no-existe");
        await s.delete(keys);
        return Response.json({ id, borrados: keys.length });
      }),
  };
}

export type ProtoApi = ReturnType<typeof createProtoApi>;
export { HttpError as ProtoHttpError };
