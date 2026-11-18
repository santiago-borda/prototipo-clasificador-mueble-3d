// Cruce del listado del CSV con el .dae y nivel por tipo de pieza (spike, docs/spec-proto-csv-ocl.md §3).
// Función pura: sin React, sin red, sin crypto (corre en el navegador con `observeDaeWithId` + `modelIdBrowser`).
// Reutiliza el motor (`associatePass1`) y el cruce del PDF (`crossCheck`) sin cambios. Sin IA: nada propone ni decide.
//
// Tres niveles por tipo (spec v0.4, §3). `segura`: su código está en el listado publicable, todas sus instancias salen
// `segura` en la pasada 1, la cantidad coincide y ni el cruce ni el motor marcan nada. `advertencia`: hay al menos una
// razón de SOFT_REASONS y todas las demás son derivadas. `dudosa`: cualquier otro caso (por defecto bloquea).

import { associatePass1, type Pass1Result } from "@/engine/associate";
import { normalizeName } from "@/engine/normalize";
import { DEFAULT_PARAMS, type Level } from "@/engine/types";
import type { DaeObservation } from "@/model/observeCore";
import { crossCheck, type CrossCheckResult, type EdgeCheck } from "@/pdf/crossCheck";
import type { CsvListing, CsvPiece } from "./parse";

/** Id de mueble para el motor y el cruce: el spike carga un mueble por vez (no se mezclan). */
export const PROTO_FURNITURE_ID = "proto-csv";

/** Nivel de un tipo de pieza en la revisión (el de las instancias del motor es otro tipo: `Level`). */
export type TypeLevel = "segura" | "advertencia" | "dudosa";

/**
 * Razones que bajan un tipo a `advertencia` (se acepta con motivo obligatorio): diferencias de medida, cantidad y canto.
 * Lista CERRADA: una razón que no está acá bloquea hasta que alguien la clasifique (spec §3, clasificadas el 18/11 con
 * spec-motor §5.4). Vive solo en este archivo.
 */
export const SOFT_REASONS: readonly string[] = ["medida-fuera-de-tolerancia", "medida-no-coincide", "faltante", "cupo-excedido", "cantidad-no-coincide", "canteado-no-coincide"];

/** Ecos de que alguna instancia no es segura: la causa real aparece como razón propia. Se ignoran al clasificar. */
export const DERIVED_REASONS: readonly string[] = ["instancia-no-segura", "sin-confirmar"];

/**
 * Nivel de un tipo a partir de sus razones (sin importar la fuente). Sin razones: segura. Advertencia solo si hay al
 * menos una blanda y todas las demás son derivadas; solo derivadas, o cualquier razón fuera de las listas: dudosa.
 */
export function levelOf(reasons: readonly { reason: string }[]): TypeLevel {
  if (reasons.length === 0) return "segura";
  const own = reasons.filter((r) => !DERIVED_REASONS.includes(r.reason));
  return own.length > 0 && own.every((r) => SOFT_REASONS.includes(r.reason)) ? "advertencia" : "dudosa";
}

export interface TypeReason {
  /** De dónde sale: el parser del CSV, la pasada 1 del motor o el cruce de medidas/canto. */
  source: "csv" | "motor" | "cruce";
  reason: string;
}

export interface ReviewedInstance {
  instanceKey: string;
  level: Level;
  /** Caja de la instancia en el marco, ascendente (mm), para comparar con el CSV. */
  sizeMm: [number, number, number];
  /** Largos de las caras `Canto_*`, o "no-disponible". */
  edgeRunsMm: number[] | "no-disponible";
}

export interface TypeReview {
  code: string;
  level: TypeLevel;
  /** Sin duplicados (fuente + razón), en orden de aparición. Vacía solo si es segura. */
  reasons: TypeReason[];
  /** La pieza del listado; null si el código quedó en `excluded`. */
  piece: CsvPiece | null;
  /** Instancias del .dae con ese código (por nombre), en orden de instanceKey, con lo medido en el .dae. */
  instances: ReviewedInstance[];
  edgeCheck: EdgeCheck | "excluido";
}

export interface Review {
  modelId: string;
  /** Por código: primero los del listado, después los excluidos; orden binario. */
  types: TypeReview[];
  /** Instancias con código que el CSV no trae, o con nombre inválido: `dudosa`, bloquean la aprobación. */
  orphanInstances: { instanceKey: string; rawName: string | null; reasons: string[] }[];
  /** Mallas sin componente (geometría suelta): informativas, no bloquean (como las 6 de Olmo). */
  looseMeshes: number;
  /** Filas del CSV sin código: bloquean. */
  unkeyedRows: number;
  /** El .dae trae caras `Canto_*` en alguna instancia (regla de modelo, ver `edgeCheckOf`). */
  modelHasEdgeFaces: boolean;
  /** Aprobar exige 0 dudosas, 0 huérfanas, 0 filas sin código y listado publicable (§4.2). */
  canApprove: boolean;
  dudosas: number;
  /** Tipos con nivel `advertencia`: no bloquean, pero Aprobar exige un motivo (§4.2). */
  advertencias: number;
  pass1: Pass1Result;
  cross: CrossCheckResult;
}

const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Canteado por código, con una regla de modelo (spike, ASUMIDO): `crossCheck` decide código por código y un código
 * sin caras `Canto_*` sale `no-disponible`. Si el .dae trae caras `Canto_*` en ALGUNA instancia, el modelo sí marca
 * el canto, así que la ausencia en un código es un dato: sin lados marcados en el CSV → `cumple` (0 = 0); con lados
 * marcados → `no-coincide`. Si el .dae no tiene ninguna cara de canto, queda `no-disponible` (no baja el nivel).
 */
function edgeCheckOf(piece: CsvPiece, cross: CrossCheckResult, modelHasEdgeFaces: boolean, instanceCount: number): EdgeCheck {
  const check = cross.edges[piece.code] ?? "no-disponible";
  if (check !== "no-disponible" || !modelHasEdgeFaces || instanceCount === 0) return check;
  return Array.isArray(piece.edgeBanding) && piece.edgeBanding.length === 0 ? "cumple" : "no-coincide";
}

export function reviewListing(listing: CsvListing, dae: DaeObservation, toleranceMm: number): Review {
  const { modelId, observations } = dae;
  const excluded = listing.status === "borrador" ? listing.excluded : [];
  const excludedCodes = excluded.map((e) => e.code);

  const pass1 = associatePass1({
    furnitureId: PROTO_FURNITURE_ID,
    modelId,
    observations,
    listado: listing.pieces,
    params: { ...DEFAULT_PARAMS, toleranceMm },
    excludedCodes,
  });
  const cross = crossCheck(listing.pieces, observations, { furnitureId: PROTO_FURNITURE_ID, modelId, toleranceMm }, { excludedCodes });

  const codeOf = new Map(
    observations.map((o) => {
      const name = normalizeName(o.rawName);
      return [o.instanceKey, name.kind === "canonico" || name.kind === "anomalo" ? name.code : null] as const;
    }),
  );
  const modelHasEdgeFaces = observations.some((o) => o.edgeRunsMm !== "no-disponible");
  const known = new Set([...listing.pieces.map((p) => p.code), ...excludedCodes]);

  const obsByKey = new Map(observations.map((o) => [o.instanceKey, o]));
  const instancesOf = (code: string) =>
    pass1.results
      .filter((r) => codeOf.get(r.instanceKey) === code)
      .map((r) => {
        const o = obsByKey.get(r.instanceKey);
        return {
          instanceKey: r.instanceKey,
          level: r.level,
          reasons: r.reasons,
          sizeMm: (o ? [...o.sizeMm] : [0, 0, 0]) as [number, number, number],
          edgeRunsMm: o ? (o.edgeRunsMm === "no-disponible" ? ("no-disponible" as const) : [...o.edgeRunsMm]) : ("no-disponible" as const),
        };
      })
      .sort((a, b) => binary(a.instanceKey, b.instanceKey));
  const strip = (i: ReturnType<typeof instancesOf>[number]): ReviewedInstance => ({ instanceKey: i.instanceKey, level: i.level, sizeMm: i.sizeMm, edgeRunsMm: i.edgeRunsMm });

  const types: TypeReview[] = [];
  for (const piece of [...listing.pieces].sort((a, b) => binary(a.code, b.code))) {
    const instances = instancesOf(piece.code);
    const reasons: TypeReason[] = [];
    const add = (source: TypeReason["source"], reason: string) => {
      if (!reasons.some((r) => r.source === source && r.reason === reason)) reasons.push({ source, reason });
    };
    for (const i of instances) for (const r of i.reasons) if (r !== "codigo-exacto") add("motor", r);
    for (const inc of pass1.inconsistencies) if (inc.pieceCode === piece.code) add("motor", inc.kind);
    for (const f of cross.findings) if (f.code === piece.code && f.affectsLevel) add("cruce", f.reason);
    if (instances.length !== piece.quantity) add("cruce", "cantidad-no-coincide");
    const edgeCheck = edgeCheckOf(piece, cross, modelHasEdgeFaces, instances.length);
    if (edgeCheck === "no-coincide") add("cruce", "canteado-no-coincide");
    if (instances.some((i) => i.level !== "segura")) add("motor", "instancia-no-segura");

    types.push({
      code: piece.code,
      level: levelOf(reasons),
      reasons,
      piece,
      instances: instances.map(strip),
      edgeCheck,
    });
  }
  for (const e of [...excluded].sort((a, b) => binary(a.code, b.code))) {
    types.push({
      code: e.code,
      level: "dudosa",
      reasons: e.reasons.map((reason) => ({ source: "csv" as const, reason })),
      piece: null,
      instances: instancesOf(e.code).map(strip),
      edgeCheck: "excluido",
    });
  }

  const orphanInstances = pass1.results
    .filter((r) => r.level !== "sin-asociar")
    .filter((r) => {
      const code = codeOf.get(r.instanceKey);
      return code === null || code === undefined || !known.has(code);
    })
    .map((r) => ({
      instanceKey: r.instanceKey,
      rawName: observations.find((o) => o.instanceKey === r.instanceKey)?.rawName ?? null,
      reasons: [...r.reasons],
    }));
  const looseMeshes = pass1.results.filter((r) => r.level === "sin-asociar").length;
  const unkeyedRows = listing.status === "borrador" ? listing.unkeyedRows.length : 0;
  const dudosas = types.filter((t) => t.level === "dudosa").length;
  const advertencias = types.filter((t) => t.level === "advertencia").length;

  return {
    modelId,
    types,
    orphanInstances,
    looseMeshes,
    unkeyedRows,
    modelHasEdgeFaces,
    canApprove: listing.status === "publicable" && dudosas === 0 && orphanInstances.length === 0 && unkeyedRows === 0,
    dudosas,
    advertencias,
    pass1,
    cross,
  };
}

/** Resumen del cruce que el navegador manda al registrar (el servidor no lee el .dae más allá del modelId). */
export interface CruceCliente {
  canApprove: boolean;
  dudosas: number;
  advertencias: number;
  orphanInstances: number;
  looseMeshes: number;
  unkeyedRows: number;
  modelHasEdgeFaces: boolean;
  types: { code: string; level: TypeLevel; reasons: TypeReason[]; edgeCheck: string }[];
}

export function summarizeReview(review: Review): CruceCliente {
  return {
    canApprove: review.canApprove,
    dudosas: review.dudosas,
    advertencias: review.advertencias,
    orphanInstances: review.orphanInstances.length,
    looseMeshes: review.looseMeshes,
    unkeyedRows: review.unkeyedRows,
    modelHasEdgeFaces: review.modelHasEdgeFaces,
    types: review.types.map(({ code, level, reasons, edgeCheck }) => ({ code, level, reasons, edgeCheck })),
  };
}

/**
 * Por qué no se puede aprobar, en texto para la pantalla (§4.2). Vacío = se puede. Con dudosas, huérfanas o filas sin
 * código, la revisión solo puede rechazar: resolverlas queda fuera del spike.
 */
export function approveBlockers(review: Pick<Review, "dudosas" | "orphanInstances" | "unkeyedRows">, listingStatus: "publicable" | "borrador"): string[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const out: string[] = [];
  if (review.dudosas > 0) out.push(`${plural(review.dudosas, "pieza dudosa", "piezas dudosas")}.`);
  if (review.orphanInstances.length > 0) out.push(`${plural(review.orphanInstances.length, "instancia del .dae sin fila en el CSV", "instancias del .dae sin fila en el CSV")}.`);
  if (review.unkeyedRows > 0) out.push(`${plural(review.unkeyedRows, "fila del CSV sin código", "filas del CSV sin código")}.`);
  if (listingStatus !== "publicable" && out.length === 0) out.push("El listado del CSV quedó como borrador.");
  return out;
}
