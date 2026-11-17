// S2: batería de contrato de los repositorios (docs/spec-s2-base-de-datos.md §5, PB-3 a PB-12).
// Una sola batería que recibe una fábrica: corre igual contra memoria y contra SQL (ADR-002, decisión 5).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { createRegistry } from "@/data/registry";
import type { FurnitureDef, PieceType } from "@/data/types";
import { buildRun } from "@/engine/run";
import { DEFAULT_PARAMS, type AssociationRun } from "@/engine/types";
import { listQrEntries, resolveQr, type QrTarget } from "@/lib/lookup";
import { observeDae } from "@/model/observe";
import { toListing } from "@/pdf/listing";
import { validateFurniture } from "@/pdf/validate";
import {
  CodigoRepetidoEnVersionError,
  MuebleInvalidoError,
  QrDuplicadoError,
  ReferenciaDeOtroTenantError,
  TenantInexistenteError,
  TenantRequeridoError,
  VersionInmutableError,
  type NewDesignVersion,
  type Persistence,
  type PersistenceDeps,
} from "@/persistence/ports";
import { QR_ID_FORMAT } from "@/persistence/qrId";
import { olmoDocuments } from "../helpers/pdfFixtures";

export type PersistenceFactory = (overrides?: Partial<PersistenceDeps>) => Promise<Persistence>;

const ROOT = path.resolve(__dirname, "..", "..");

// --- Datos de prueba (inventados, sin relación con ningún cliente) -------------------------------------

function piece(prefix: string, suffix: string, overrides: Partial<PieceType> = {}): PieceType {
  return {
    qrId: `${prefix}-${suffix.toLowerCase()}`,
    code: `9999-01-M01-${suffix}`,
    name: `Pieza ${suffix}`,
    moduleId: "mod-a",
    lengthMm: 500,
    widthMm: 300.5,
    thicknessMm: 18,
    material: "Demo",
    quantity: 2,
    edgeBanding: null,
    notes: null,
    ...overrides,
  };
}

/** Mueble sintético con dos módulos. Todos sus qrId llevan `prefix`, así dos muebles no chocan. */
function demoDef(prefix: string, pieceTypes?: PieceType[]): FurnitureDef {
  return {
    furniture: {
      id: prefix,
      qrId: `${prefix}-mueble`,
      name: `Mueble ${prefix}`,
      dimsMm: { x: 1000, y: 800.5, z: 500 },
      designVersion: "v0",
      newerVersionAvailable: false,
      edgeBandSpec: { type: "ABS", widthMm: 22, thicknessMm: 0.22, status: "confirmado" },
    },
    modules: [
      { id: "mod-a", qrId: `${prefix}-mod-a`, furnitureId: prefix, name: "Módulo A" },
      { id: "mod-b", qrId: `${prefix}-mod-b`, furnitureId: prefix, name: "Módulo B" },
    ],
    pieceTypes: pieceTypes ?? [piece(prefix, "C02", { moduleId: "mod-b" }), piece(prefix, "C01")],
    modelUrl: `/models/${prefix}.dae`,
    toleranceMm: 2,
  };
}

const input = (def: FurnitureDef, extra: Partial<NewDesignVersion> = {}): NewDesignVersion => ({ def, modelId: null, createdBy: "prueba", ...extra });

/** Run real del primer fixture (igual que N9 de tests/engine/run.test.ts). */
let olmoRunCache: AssociationRun | undefined;
function olmoRun(): AssociationRun {
  if (olmoRunCache) return olmoRunCache;
  const bytes = readFileSync(path.join(ROOT, "public", "models", "Olmo", "olmo.dae"));
  const listing = toListing("olmo", validateFurniture(olmoDocuments()));
  if (listing.status === "bloqueado") throw new Error(listing.reason);
  const observed = observeDae(bytes);
  olmoRunCache = buildRun({
    furnitureId: "olmo",
    modelId: observed.modelId,
    observations: observed.observations,
    listado: listing.pieces,
    params: { toleranceMm: olmoDef.toleranceMm, ...DEFAULT_PARAMS },
    excludedCodes: listing.excluded.map((e) => e.code),
  });
  return olmoRunCache;
}

/** La misma regla que `resolveQr` de `@/lib/lookup`, sobre un mueble dado (lookup.ts no se toca en S2). */
function resolveIn(def: FurnitureDef, qrId: string): QrTarget | undefined {
  const found = createRegistry([def]).findDefByQrId(qrId);
  if (!found) return undefined;
  if (qrId === def.furniture.qrId) return { kind: "furniture", qrId, def, furniture: def.furniture, modules: def.modules };
  const mod = def.modules.find((m) => m.qrId === qrId);
  if (mod) {
    const pieces = def.pieceTypes.filter((p) => p.moduleId === mod.id);
    return { kind: "module", qrId, def, module: mod, pieces, componentCodes: pieces.map((p) => p.code) };
  }
  const found2 = def.pieceTypes.find((p) => p.qrId === qrId);
  return found2 ? { kind: "piece", qrId, def, piece: found2, module: def.modules.find((m) => m.id === found2.moduleId) } : undefined;
}

// --- Batería -------------------------------------------------------------------------------------

export function persistenceContract(label: string, factory: PersistenceFactory): void {
  /** Base nueva con dos carpinterías, A y B. */
  async function setup(overrides?: Partial<PersistenceDeps>) {
    const p = await factory(overrides);
    const a = (await p.tenants.create({ name: "Carpintería A" })).id;
    const b = (await p.tenants.create({ name: "Carpintería B" })).id;
    return { p, a, b };
  }

  describe(`contrato de persistencia: ${label}`, () => {
    it("PB-3 (B3): un código repetido dentro de una versión se rechaza; el mismo código en dos muebles se guarda", async () => {
      const { p, a } = await setup();
      const repetido = demoDef("rep", [piece("rep", "C01"), piece("rep", "C01", { qrId: "rep-otro" })]);
      await expect(p.furniture.saveDesignVersion(a, input(repetido))).rejects.toThrow(CodigoRepetidoEnVersionError);
      expect(await p.furniture.listDesignVersions(a)).toEqual([]); // no quedó nada a medias

      const uno = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      const dos = await p.furniture.saveDesignVersion(a, input(demoDef("dos")));
      expect((await p.furniture.getFurnitureDef(a, uno.designVersionId))?.pieceTypes.map((x) => x.code)).toEqual(
        (await p.furniture.getFurnitureDef(a, dos.designVersionId))?.pieceTypes.map((x) => x.code),
      );

      // También al agregar un tipo de pieza a una versión existente.
      const dup = { moduleId: uno.moduleIds["mod-a"], piece: piece("uno", "C01", { qrId: "uno-nuevo" }) };
      await expect(p.furniture.addPieceType(a, uno.designVersionId, dup)).rejects.toThrow(CodigoRepetidoEnVersionError);
      await p.close();
    });

    it("PB-4 (B4): dos QR con el mismo id (forzado) dan QrDuplicadoError", async () => {
      const { p, a, b } = await setup({ newQrId: () => "0000000000000000000000fij0" });
      // El publicId de la versión usa el mismo generador: no es un QR y no choca.
      const ref = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      const pieceTypeId = ref.pieceTypeIds["9999-01-M01-C01"];
      expect(await p.qr.create(a, pieceTypeId)).toBe("0000000000000000000000fij0");
      await expect(p.qr.create(a, pieceTypeId)).rejects.toThrow(QrDuplicadoError);

      // Un qrId heredado tampoco se repite, ni dentro de un mueble ni entre carpinterías.
      const interno = demoDef("int", [piece("int", "C01"), piece("int", "C02", { qrId: "int-c01" })]);
      await expect(p.furniture.saveDesignVersion(a, input(interno))).rejects.toThrow(QrDuplicadoError);
      await expect(p.furniture.saveDesignVersion(b, input(demoDef("uno")))).rejects.toThrow(QrDuplicadoError);
      const chocaConModulo = demoDef("tres", [piece("tres", "C01", { qrId: "uno-mod-a" })]);
      await expect(p.furniture.saveDesignVersion(b, input(chocaConModulo))).rejects.toThrow(QrDuplicadoError);
      expect(await p.furniture.listDesignVersions(b)).toEqual([]);
      await p.close();
    });

    it("PB-5 (B5): una versión publicada no se modifica", async () => {
      const { p, a } = await setup();
      const ref = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      const nueva = { moduleId: ref.moduleIds["mod-a"], piece: piece("uno", "C03") };
      await p.furniture.addPieceType(a, ref.designVersionId, nueva); // antes de publicar se puede
      await p.furniture.publish(a, ref.designVersionId, "prueba");

      const otra = { moduleId: ref.moduleIds["mod-a"], piece: piece("uno", "C04") };
      await expect(p.furniture.addPieceType(a, ref.designVersionId, otra)).rejects.toThrow(VersionInmutableError);
      await expect(p.qr.create(a, ref.pieceTypeIds["9999-01-M01-C01"])).rejects.toThrow(VersionInmutableError);
      await expect(p.furniture.publish(a, ref.designVersionId, "otra persona")).rejects.toThrow(VersionInmutableError);

      const def = await p.furniture.getFurnitureDef(a, ref.designVersionId);
      expect(def?.pieceTypes.map((x) => x.code)).toEqual(["9999-01-M01-C02", "9999-01-M01-C01", "9999-01-M01-C03"]);
      expect((await p.furniture.listDesignVersions(a)).map((v) => v.status)).toEqual(["publicada"]);
      await p.close();
    });

    it("PB-6 (B6): lo guardado en la carpintería A no se lee ni se lista desde la B", async () => {
      const { p, a, b } = await setup();
      const ref = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      await p.runs.save(a, ref.designVersionId, olmoRun());

      expect(await p.furniture.getFurnitureDef(b, ref.designVersionId)).toBeNull();
      expect(await p.furniture.listDesignVersions(b)).toEqual([]);
      expect(await p.runs.get(b, ref.designVersionId, olmoRun().engineRunId)).toBeNull();
      expect(await p.furniture.listDesignVersions(a)).toHaveLength(1);
      expect(await p.furniture.getFurnitureDef(a, "no-existe")).toBeNull();
      await p.close();
    });

    it("PB-7 (B6): una referencia a una fila de otra carpintería se rechaza", async () => {
      const { p, a, b } = await setup();
      const deA = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      const deB = await p.furniture.saveDesignVersion(b, input(demoDef("dos")));

      // Tipo de pieza de B que apunta a un módulo de A.
      const cruzada = { moduleId: deA.moduleIds["mod-a"], piece: piece("dos", "C09") };
      await expect(p.furniture.addPieceType(b, deB.designVersionId, cruzada)).rejects.toThrow(ReferenciaDeOtroTenantError);
      // Versión, mueble y tipo de pieza de A, usados desde B.
      const propia = { moduleId: deB.moduleIds["mod-a"], piece: piece("dos", "C09") };
      await expect(p.furniture.addPieceType(b, deA.designVersionId, propia)).rejects.toThrow(ReferenciaDeOtroTenantError);
      await expect(p.furniture.publish(b, deA.designVersionId, "prueba")).rejects.toThrow(ReferenciaDeOtroTenantError);
      await expect(p.furniture.saveDesignVersion(b, input(demoDef("uno"), { furnitureId: deA.furnitureId }))).rejects.toThrow(
        ReferenciaDeOtroTenantError,
      );
      await expect(p.qr.create(b, deA.pieceTypeIds["9999-01-M01-C01"])).rejects.toThrow(ReferenciaDeOtroTenantError);
      await expect(p.runs.save(b, deA.designVersionId, olmoRun())).rejects.toThrow(ReferenciaDeOtroTenantError);

      // Nada de eso dejó datos en B ni cambió A.
      expect((await p.furniture.getFurnitureDef(b, deB.designVersionId))?.pieceTypes).toHaveLength(2);
      expect((await p.furniture.listDesignVersions(a)).map((v) => v.status)).toEqual(["borrador"]);
      await p.close();
    });

    it("PB-8 (B6): sin tenantId, cada función lanza TenantRequeridoError; una carpintería que no existe no escribe", async () => {
      const { p, a } = await setup();
      const ref = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      const nueva = { moduleId: ref.moduleIds["mod-a"], piece: piece("uno", "C03") };
      for (const vacio of ["", "   "]) {
        const llamadas: (() => Promise<unknown>)[] = [
          () => p.tenants.get(vacio),
          () => p.furniture.saveDesignVersion(vacio, input(demoDef("dos"))),
          () => p.furniture.addPieceType(vacio, ref.designVersionId, nueva),
          () => p.furniture.getFurnitureDef(vacio, ref.designVersionId),
          () => p.furniture.listDesignVersions(vacio),
          () => p.furniture.publish(vacio, ref.designVersionId, "prueba"),
          () => p.qr.create(vacio, ref.pieceTypeIds["9999-01-M01-C01"]),
          () => p.runs.save(vacio, ref.designVersionId, olmoRun()),
          () => p.runs.get(vacio, ref.designVersionId, olmoRun().engineRunId),
        ];
        for (const llamada of llamadas) await expect(llamada()).rejects.toThrow(TenantRequeridoError);
      }
      await expect(p.furniture.saveDesignVersion("no-existe", input(demoDef("dos")))).rejects.toThrow(TenantInexistenteError);
      expect(await p.tenants.get("no-existe")).toBeNull();
      await p.close();
    });

    it("PB-9 (B7): equivalencia de la ficha: el primer fixture guardado y leído es igual a olmoDef", async () => {
      const { p, a } = await setup();
      const ref = await p.furniture.saveDesignVersion(a, input(olmoDef));
      const leido = await p.furniture.getFurnitureDef(a, ref.designVersionId);
      expect(leido).toEqual(olmoDef);
      expect(leido?.pieceTypes).toHaveLength(21);
      expect(leido?.pieceTypes.reduce((n, x) => n + x.quantity, 0)).toBe(33);
      // Tipo por tipo, para que una diferencia se lea en el reporte.
      for (const [i, esperado] of olmoDef.pieceTypes.entries()) expect(leido?.pieceTypes[i], esperado.code).toEqual(esperado);

      await p.furniture.publish(a, ref.designVersionId, "prueba");
      expect(await p.furniture.getFurnitureDef(a, ref.designVersionId)).toEqual(olmoDef); // publicar no cambia la ficha
      await p.close();
    });

    it("PB-10 (B7): equivalencia de la resolución: cada qrId del primer fixture resuelve al mismo QrTarget", async () => {
      const { p, a } = await setup();
      const ref = await p.furniture.saveDesignVersion(a, input(olmoDef));
      await p.furniture.publish(a, ref.designVersionId, "prueba");

      const entries = listQrEntries().filter((e) => e.furnitureId === "olmo");
      expect(entries).toHaveLength(1 + 2 + 21);
      for (const entry of entries) {
        const resolution = await p.qr.resolve(entry.qrId);
        expect(resolution, entry.qrId).toMatchObject({ kind: entry.kind, tenantId: a, designVersionId: ref.designVersionId });
        if (!resolution) continue;
        const def = await p.furniture.getFurnitureDef(resolution.tenantId, resolution.designVersionId);
        expect(def && resolveIn(def, entry.qrId), entry.qrId).toEqual(resolveQr(entry.qrId));
      }
      expect(await p.qr.resolve("olmo-c99")).toBeNull();
      await p.close();
    });

    it("PB-11 (B8): el run del primer fixture guardado y leído es igual byte a byte", async () => {
      const { p, a } = await setup();
      const ref = await p.furniture.saveDesignVersion(a, input(olmoDef));
      const run = olmoRun();
      await p.runs.save(a, ref.designVersionId, run);
      await p.runs.save(a, ref.designVersionId, run); // dos veces: no hace nada
      const leido = await p.runs.get(a, ref.designVersionId, run.engineRunId);
      expect(JSON.stringify(leido)).toBe(JSON.stringify(run));
      expect(await p.runs.get(a, ref.designVersionId, "sha256:no-existe")).toBeNull();
      await p.close();
    });

    it("PB-12 (B7): edgeBanding null, [] y con lados, y notas null o con texto, se leen como se guardaron", async () => {
      const { p, a } = await setup();
      const def: FurnitureDef = {
        ...demoDef("uno", [
          piece("uno", "C01", { edgeBanding: null, notes: null }),
          piece("uno", "C02", { edgeBanding: [], notes: "" }),
          piece("uno", "C03", { edgeBanding: ["corto-B", "largo-A"], notes: "veta a lo largo", moduleId: "mod-b" }),
        ]),
        textureBaseUrl: "/texturas/uno",
      };
      def.furniture.edgeBandSpec = { type: "ABS", widthMm: 22, thicknessMm: 0.45, status: "provisorio", note: "a confirmar" };
      const ref = await p.furniture.saveDesignVersion(a, input(def));
      const leido = await p.furniture.getFurnitureDef(a, ref.designVersionId);
      expect(leido).toEqual(def);
      expect(leido?.pieceTypes.map((x) => x.edgeBanding)).toStrictEqual([null, [], ["corto-B", "largo-A"]]);
      expect(leido?.pieceTypes.map((x) => x.notes)).toStrictEqual([null, "", "veta a lo largo"]);
      await p.close();
    });

    it("versiones de un mismo mueble: numeración, publicación, reemplazo y aviso de versión más nueva", async () => {
      const { p, a } = await setup();
      const v1 = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      // La versión 2 del mismo mueble trae QR nuevos para módulos y piezas (un QR no cambia de destino).
      const def2: FurnitureDef = {
        ...demoDef("uno", [piece("uno", "C01", { qrId: "uno-v2-c01" })]),
        modules: [{ id: "mod-a", qrId: "uno-v2-mod-a", furnitureId: "uno", name: "Módulo A" }],
      };
      await expect(p.furniture.saveDesignVersion(a, input(demoDef("uno"), { furnitureId: v1.furnitureId }))).rejects.toThrow(QrDuplicadoError);
      await expect(p.furniture.saveDesignVersion(a, input(demoDef("otro"), { furnitureId: v1.furnitureId }))).rejects.toThrow(MuebleInvalidoError);
      const v2 = await p.furniture.saveDesignVersion(a, input(def2, { furnitureId: v1.furnitureId }));
      expect([v1.number, v2.number, v2.furnitureId]).toEqual([1, 2, v1.furnitureId]);

      expect(await p.qr.resolve("uno-mueble")).toBeNull(); // sin versión publicada, el QR de mueble no resuelve
      await p.furniture.publish(a, v1.designVersionId, "prueba");
      expect(await p.qr.resolve("uno-mueble")).toMatchObject({ kind: "furniture", designVersionId: v1.designVersionId });
      await p.furniture.publish(a, v2.designVersionId, "prueba");
      expect(await p.qr.resolve("uno-mueble")).toMatchObject({ kind: "furniture", designVersionId: v2.designVersionId });

      const estados = Object.fromEntries((await p.furniture.listDesignVersions(a)).map((v) => [v.number, v.status]));
      expect(estados).toEqual({ 1: "reemplazada", 2: "publicada" });
      expect((await p.furniture.getFurnitureDef(a, v1.designVersionId))?.furniture.newerVersionAvailable).toBe(true);
      expect((await p.furniture.getFurnitureDef(a, v2.designVersionId))?.furniture.newerVersionAvailable).toBe(false);
      // La etiqueta vieja sigue abriendo su versión.
      expect(await p.qr.resolve("uno-c01")).toMatchObject({ kind: "piece", designVersionId: v1.designVersionId, status: "reemplazada" });
      await p.close();
    });

    it("QrRepository.create: QR opaco nuevo que resuelve al tipo de pieza; la ficha conserva el QR original", async () => {
      const { p, a } = await setup();
      const ref = await p.furniture.saveDesignVersion(a, input(demoDef("uno")));
      const pieceTypeId = ref.pieceTypeIds["9999-01-M01-C01"];
      const qrId = await p.qr.create(a, pieceTypeId);
      expect(qrId).toMatch(QR_ID_FORMAT);
      expect(await p.qr.resolve(qrId)).toEqual({
        kind: "piece",
        qrId,
        tenantId: a,
        designVersionId: ref.designVersionId,
        status: "borrador",
        pieceTypeId,
        revoked: false,
      });
      expect(await p.qr.resolve("uno-mod-b")).toMatchObject({ kind: "module", tenantId: a, moduleId: ref.moduleIds["mod-b"] });
      expect((await p.furniture.getFurnitureDef(a, ref.designVersionId))?.pieceTypes.map((x) => x.qrId)).toEqual(["uno-c02", "uno-c01"]);
      await p.close();
    });

    it("un mueble incoherente no se guarda (MuebleInvalidoError)", async () => {
      const { p, a } = await setup();
      const sinModulo = demoDef("uno", [piece("uno", "C01", { moduleId: "mod-z" })]);
      await expect(p.furniture.saveDesignVersion(a, input(sinModulo))).rejects.toThrow(MuebleInvalidoError);
      const moduloAjeno = demoDef("uno");
      const otroMueble: FurnitureDef = { ...moduloAjeno, modules: moduloAjeno.modules.map((m) => ({ ...m, furnitureId: "otro" })) };
      await expect(p.furniture.saveDesignVersion(a, input(otroMueble))).rejects.toThrow(MuebleInvalidoError);
      expect(await p.furniture.listDesignVersions(a)).toEqual([]);
      await p.close();
    });
  });
}
