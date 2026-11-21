// S2A: la ficha y el visor de /p/<qrId> leen de la base (docs/spec-s2a-app-lee-base.md v0.2, §4).
// S2A PB-14 (la ficha no cambió, contra la captura previa), S2A PB-15 (mismo destino y misma respuesta de la página;
// inexistente y no publicado: 404),
// S2A PB-16 (base caída: error con nombre, nunca datos estáticos), S2A PB-17 (`OLMO_MODEL_ID`) y S2A PB-18 (v0.3: QR
// de una versión reemplazada, con el aviso de versión más nueva).
// Memoria siempre; PostgreSQL solo con TEST_DATABASE_URL (esquema propio por prueba, que se borra), como sql.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import QrPage from "@/app/p/[qrId]/page";
import FichaError from "@/app/p/error";
import { QrSheets } from "@/components/QrSheets";
import { LoadBaseFurniture } from "@/components/viewer/LoadBaseFurniture";
import { olmoDef } from "@/data/furniture.mock";
import type { FurnitureDef } from "@/data/types";
import { OLMO_MODEL_ID } from "@/data/olmoModelId";
import { modelId } from "@/engine/hash";
import { listQrEntriesOf, resolveQr, type QrTarget } from "@/lib/lookup";
import { createMemoryPersistence } from "@/persistence/memory";
import { PersistenciaNoDisponibleError, type Persistence } from "@/persistence/ports";
import { createSqlPersistence } from "@/persistence/sql";
import { closePersistence, getPersistence, resolveQrTargetWith } from "@/server/datos";
import { seedOlmo } from "../../db/seed";
import captura from "../fixtures/s2a/ficha-olmo.json";
import { AVISO_SIN_BASE, createTestSchema, TEST_DATABASE_URL, type TestSchema } from "./postgres";

const OLMO_QR = listQrEntriesOf(olmoDef).map((entry) => entry.qrId);
const INEXISTENTE = "no-existe-c99";

/** Copia del primer fixture como otro mueble, con ids y qrId propios: se guarda sin publicar (S2A-4). */
function sinPublicar(): FurnitureDef {
  const qr = (id: string) => `s2a-borrador-${id}`;
  return {
    ...olmoDef,
    furniture: { ...olmoDef.furniture, id: "s2a-borrador", qrId: qr("mueble") },
    modules: olmoDef.modules.map((m) => ({ ...m, id: qr(m.id), furnitureId: "s2a-borrador", qrId: qr(m.qrId) })),
    pieceTypes: olmoDef.pieceTypes.map((piece) => ({ ...piece, moduleId: qr(piece.moduleId), qrId: qr(piece.qrId) })),
  };
}

/** Primer fixture como otro mueble, con qrId propios por versión (`v`): la 2 trae QR nuevos de módulo y pieza. */
function versionDe(v: 1 | 2): FurnitureDef {
  const id = "s2a-versiones";
  const qr = (x: string) => `s2a-v${v}-${x}`;
  return {
    ...olmoDef,
    furniture: { ...olmoDef.furniture, id, qrId: "s2a-versiones-mueble", designVersion: `v${v}` },
    modules: olmoDef.modules.map((m) => ({ ...m, id: `s2a-${m.id}`, furnitureId: id, qrId: qr(m.qrId) })),
    pieceTypes: olmoDef.pieceTypes.map((piece) => ({ ...piece, moduleId: `s2a-${piece.moduleId}`, qrId: qr(piece.qrId) })),
  };
}

/** Lo que devuelve la página: el elemento de `QrSheets` (con el `target`) y el de `LoadBaseFurniture` (con el `def`). */
async function renderPage(qrId: string): Promise<{ target: QrTarget; loadedDef: unknown }> {
  const page = (await QrPage({ params: Promise.resolve({ qrId }) })) as ReactElement<{ children: ReactNode }>;
  const children = (Array.isArray(page.props.children) ? page.props.children : [page.props.children]) as ReactNode[];
  const find = <P,>(type: unknown) => children.find((c): c is ReactElement<P> => isValidElement(c) && c.type === type);
  const sheets = find<{ target: QrTarget }>(QrSheets);
  const loader = find<{ def: unknown }>(LoadBaseFurniture);
  if (!sheets || !loader) throw new Error("La página no devolvió la ficha y el visor.");
  return { target: sheets.props.target, loadedDef: loader.props.def };
}

/** `notFound()` de Next: el error con el que la página responde 404. */
async function pageStatus(qrId: string): Promise<200 | 404> {
  try {
    await renderPage(qrId);
    return 200;
  } catch (error) {
    if ((error as { digest?: unknown }).digest === "NEXT_HTTP_ERROR_FALLBACK;404") return 404;
    throw error;
  }
}

/** URL de la base de pruebas con el esquema de la prueba como search_path (la usa la raíz de composición). */
function urlConEsquema(schema: string): string {
  const url = new URL(TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

interface Caso {
  /** Repositorios con el Olmo cargado por `seedOlmo`. */
  persistence: Persistence;
  /** Valor de DATABASE_URL con el que la raíz de composición (src/server/datos.ts) abre esa misma base. */
  databaseUrl: string;
}

function bateria(nombre: string, abrir: () => Promise<Caso & { cerrar(): Promise<void> }>) {
  describe(`S2A contra ${nombre}`, () => {
    let caso: Caso & { cerrar(): Promise<void> };

    beforeAll(async () => {
      caso = await abrir();
      vi.stubEnv("DATABASE_URL", caso.databaseUrl);
      await closePersistence();
    });
    afterAll(async () => {
      await closePersistence();
      vi.unstubAllEnvs();
      await caso.cerrar();
    });

    describe("S2A PB-14: la ficha recibe lo mismo que antes de la enmienda", () => {
      it("la captura tiene los 21 tipos del primer fixture", () => {
        expect(captura.entries).toHaveLength(21);
        expect(captura.entries.map((e) => e.qrId)).toEqual(olmoDef.pieceTypes.map((piece) => piece.qrId));
      });

      it.each(captura.entries.map((entry) => [entry.qrId, entry] as const))("%s: resolveQrTargetWith", async (qrId, entry) => {
        expect(await resolveQrTargetWith(caso.persistence, qrId)).toEqual({ ...entry, def: captura.def });
      });

      it.each(captura.entries.map((entry) => [entry.qrId, entry] as const))("%s: lo que la página pasa a QrSheets y al visor", async (qrId, entry) => {
        const { target, loadedDef } = await renderPage(qrId);
        expect(target).toEqual({ ...entry, def: captura.def });
        expect(loadedDef).toEqual(captura.def);
      });
    });

    describe("S2A PB-15: mismo destino y misma respuesta en /p/<qrId>", () => {
      it("son los 24 qrId del primer fixture (mueble, 2 módulos, 21 piezas)", () => {
        expect(OLMO_QR).toHaveLength(24);
      });

      it.each(OLMO_QR)("%s: mismo QrTarget que resolveQr y la página responde con la ficha", async (qrId) => {
        const antes = resolveQr(qrId);
        expect(antes).toBeDefined();
        expect(await resolveQrTargetWith(caso.persistence, qrId)).toEqual(antes);
        expect(await pageStatus(qrId)).toBe(200);
        expect((await renderPage(qrId)).target).toEqual(antes);
      });

      it("un qrId inexistente: undefined, como resolveQr, y la página responde 404 (notFound)", async () => {
        expect(resolveQr(INEXISTENTE)).toBeUndefined();
        expect(await resolveQrTargetWith(caso.persistence, INEXISTENTE)).toBeUndefined();
        expect(await pageStatus(INEXISTENTE)).toBe(404);
      });

      describe("S2A-4: un QR de una versión no publicada responde 404", () => {
        // Mueble sintético con qrId propios, guardado como `borrador` (sin publicar) en la persistencia que usa la
        // página: en memoria, la de la raíz de composición; en PostgreSQL, el mismo esquema de la prueba.
        const borrador = sinPublicar();
        const qrIds = [borrador.furniture.qrId, borrador.modules[0].qrId, borrador.pieceTypes[3].qrId];

        beforeAll(async () => {
          const raiz = await getPersistence();
          await raiz.furniture.saveDesignVersion("desarrollo", { def: borrador, modelId: null, createdBy: "prueba" });
        });

        it.each(qrIds)("%s: undefined y la página responde 404 (notFound)", async (qrId) => {
          const raiz = await getPersistence();
          const resolution = await raiz.qr.resolve(qrId);
          // Existe en la base (módulo y pieza, como borrador); el qrId de mueble sin versión publicada no resuelve.
          if (qrId === borrador.furniture.qrId) expect(resolution).toBeNull();
          else expect(resolution?.status).toBe("borrador");
          expect(await resolveQrTargetWith(raiz, qrId)).toBeUndefined();
          expect(await pageStatus(qrId)).toBe(404);
        });
      });
    });

    describe("S2A PB-18 (v0.3): un QR de una versión reemplazada abre su versión con el aviso", () => {
      const v1 = versionDe(1);
      const v2 = versionDe(2);
      const pieza1 = v1.pieceTypes[3].qrId;
      const modulo1 = v1.modules[0].qrId;
      const pieza2 = v2.pieceTypes[3].qrId;

      beforeAll(async () => {
        const raiz = await getPersistence();
        const r1 = await raiz.furniture.saveDesignVersion("desarrollo", { def: v1, modelId: null, createdBy: "prueba" });
        await raiz.furniture.publish("desarrollo", r1.designVersionId, "prueba");
        const r2 = await raiz.furniture.saveDesignVersion("desarrollo", { def: v2, modelId: null, createdBy: "prueba", furnitureId: r1.furnitureId });
        await raiz.furniture.publish("desarrollo", r2.designVersionId, "prueba");
      });

      it.each([pieza1, modulo1])("%s (versión 1, reemplazada): abre la versión 1 con newerVersionAvailable y la página responde 200", async (qrId) => {
        const raiz = await getPersistence();
        expect((await raiz.qr.resolve(qrId))?.status).toBe("reemplazada");
        const target = await resolveQrTargetWith(raiz, qrId);
        expect(target?.def.furniture.designVersion).toBe("v1");
        expect(target?.def.furniture.newerVersionAvailable).toBe(true);
        expect(await pageStatus(qrId)).toBe(200);
        const { target: enPagina, loadedDef } = await renderPage(qrId);
        expect(enPagina).toEqual(target);
        expect((loadedDef as FurnitureDef).furniture.newerVersionAvailable).toBe(true);
        const html = renderToStaticMarkup(createElement(QrSheets, { target: enPagina }));
        expect(html).toContain("Hay una versión más nueva de este diseño");
        expect(html).toContain("Esta ficha corresponde a la versión v1");
      });

      it("la versión 2 (publicada) abre sin aviso; el QR de mueble abre la versión vigente", async () => {
        const raiz = await getPersistence();
        const t2 = await resolveQrTargetWith(raiz, pieza2);
        expect(t2?.def.furniture).toMatchObject({ designVersion: "v2", newerVersionAvailable: false });
        expect(renderToStaticMarkup(createElement(QrSheets, { target: t2! }))).not.toContain("Hay una versión más nueva");
        expect((await resolveQrTargetWith(raiz, "s2a-versiones-mueble"))?.def.furniture.designVersion).toBe("v2");
      });

      it("un QR revocado de la versión reemplazada sigue en 404 (S2A-4)", async () => {
        const raiz = await getPersistence();
        const revocado: Persistence = {
          ...raiz,
          qr: { ...raiz.qr, resolve: async (id) => { const r = await raiz.qr.resolve(id); return r && r.kind === "piece" ? { ...r, revoked: true } : r; } },
        };
        expect(await resolveQrTargetWith(revocado, pieza1)).toBeUndefined();
      });
    });
  });
}

bateria("memoria", async () => {
  const persistence = createMemoryPersistence();
  await seedOlmo(persistence);
  // DATABASE_URL vacía: la raíz de composición usa la memoria con la misma semilla.
  return { persistence, databaseUrl: "", cerrar: () => persistence.close() };
});

if (!TEST_DATABASE_URL) {
  describe("S2A contra PostgreSQL", () => {
    it.skip(AVISO_SIN_BASE, () => {});
  });
} else {
  bateria("PostgreSQL", async () => {
    const schema: TestSchema = await createTestSchema({ migrate: true });
    const persistence = createSqlPersistence(schema.db);
    await seedOlmo(persistence);
    return { persistence, databaseUrl: urlConEsquema(schema.schema), cerrar: () => schema.drop() };
  });
}

describe("S2A PB-16: con la base caída, error con nombre y nunca datos estáticos", () => {
  // Un puerto cerrado de 127.0.0.1: la conexión se rechaza. No necesita una base levantada (corre siempre).
  const CAIDA = "postgres://pfg:clave-de-prueba@127.0.0.1:1/pfg";

  afterEach(async () => {
    await closePersistence();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it(
    "la página lanza PersistenciaNoDisponibleError, lo registra sin la URL y error.tsx muestra el texto y el botón",
    async () => {
      vi.stubEnv("DATABASE_URL", CAIDA);
      await closePersistence();
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      let thrown: unknown;
      try {
        await renderPage(olmoDef.pieceTypes[3].qrId);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(PersistenciaNoDisponibleError);
      expect((thrown as Error).cause).toBeDefined();

      const lineas = log.mock.calls.map((args) => args.map(String).join(" "));
      expect(lineas.some((l) => l.startsWith("PersistenciaNoDisponibleError:"))).toBe(true);
      expect(lineas.join("\n")).not.toContain("clave-de-prueba");

      const html = renderToStaticMarkup(createElement(FichaError, { error: thrown, retry: () => {} }));
      expect(html).toContain("No se pudo cargar la ficha. Revisá la conexión e intentá de nuevo");
      expect(html).toMatch(/<button[^>]*>Reintentar<\/button>/);
      expect(html).not.toContain(olmoDef.pieceTypes[3].name);
    },
    30_000,
  );

  it(
    "un qrId inexistente con la base caída tampoco cae al registro estático: es el mismo error, no un 404",
    async () => {
      vi.stubEnv("DATABASE_URL", CAIDA);
      await closePersistence();
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(renderPage(INEXISTENTE)).rejects.toBeInstanceOf(PersistenciaNoDisponibleError);
    },
    30_000,
  );
});

describe("S2A PB-17: OLMO_MODEL_ID", () => {
  it("coincide con el modelId del .dae real", () => {
    const bytes = readFileSync(path.join(__dirname, "..", "..", "public", olmoDef.modelUrl));
    expect(OLMO_MODEL_ID).toBe(modelId(bytes));
  });
});
