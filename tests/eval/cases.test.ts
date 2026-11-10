// T11: casos reales y fuentes de modelos (docs/spec-t11-harness-minimo.md §2 T11-E2, T11-E4, T11-E5; §4 E6).

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRealCase } from "../../eval/cases";
import { evaluateGate } from "../../eval/gate";
import { modelSourceFor } from "../../src/lib/modelSources";
import { MarcoDistintoError } from "@/engine/run";
import { listingOf, daeFixture, piece } from "../helpers/evalFixtures";
import { obs, params } from "../helpers/engineFixtures";
import type { Listing } from "@/pdf/listing";

const build = (listing: Listing, dae = daeFixture()) => buildRealCase({ furnitureId: listing.furnitureId, listing, dae, toleranceMm: params.toleranceMm });

describe("buildRealCase (T11-E5, E6)", () => {
  it("listado publicable: caso ok con el run de la pasada 1", () => {
    const c = build(listingOf("olmo", "publicable"));
    expect(c.status).toBe("ok");
    if (c.status === "ok") expect(c.run.passes).toBe(1);
  });

  it("T11-E4: un borrador pasa excludedCodes al motor (el código excluido sale dudosa 'codigo-excluido')", () => {
    const dae = daeFixture();
    dae.observations.push(obs("_C09", { key: "ID5" }));
    const c = build(listingOf("olmo", "borrador"), dae);
    expect(c.status).toBe("ok");
    if (c.status !== "ok") return;
    expect(c.run.results.find((r) => r.instanceKey === "ID5")).toMatchObject({ level: "dudosa", reasons: ["codigo-excluido"] });
  });

  it("E6: un código repetido (ListadoInvalidoError) da no-ejecutado con el motivo, sin el código, y G2 falla en el primer fixture", () => {
    const c = build(listingOf("olmo", "publicable", [piece("C01", 1), piece("C01", 2)]));
    expect(c.status).toBe("no-ejecutado");
    if (c.status !== "no-ejecutado") return;
    expect(c.motivo).toMatch(/codigo-repetido/);
    expect(c.motivo).not.toContain("9999");
    const gate = evaluateGate({ real: [c], esperados: () => ({}), published: () => null, determinism: { a: "x", b: "x" }, permutations: { ok: true, detail: "" } });
    expect(gate.checks.find((x) => x.id === "G2")?.status).toBe("falla");
  });

  it("T11-E5: un listado 'bloqueado' da no-ejecutado con su motivo", () => {
    const c = build({ status: "bloqueado", furnitureId: "olmo", reason: "esquema-invalido" });
    expect(c).toEqual({ furnitureId: "olmo", status: "no-ejecutado", motivo: "listado bloqueado (esquema-invalido)" });
  });

  it("E6: cualquier otro error se propaga (MarcoDistintoError no es un caso)", () => {
    const dae = daeFixture();
    dae.observations[0] = { ...dae.observations[0], frameVersion: "marco/0" };
    expect(() => build(listingOf("olmo", "publicable"), dae)).toThrow(MarcoDistintoError);
  });
});

describe("modelSourceFor", () => {
  it("primer fixture: .dae, runs y esperados del repo", () => {
    const s = modelSourceFor("olmo");
    expect(s).not.toBeNull();
    const norm = (p: string | undefined) => (p ?? "").replaceAll("\\", "/");
    expect(norm(s?.daePath)).toMatch(/public\/models\/Olmo\/olmo\.dae$/);
    expect(norm(s?.runsDir)).toMatch(/\/eval\/runs$/);
    expect(norm(s?.esperadosPath)).toMatch(/\/eval\/esperados\.json$/);
  });

  it("segundo fixture: null si la carpeta no existe; con carpeta, su único .dae y su eval/ local", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "eval-sources-"));
    expect(modelSourceFor("sabrina", { sabrinaDir: path.join(dir, "no-existe") })).toBeNull();
    mkdirSync(path.join(dir, "Archivo Collada"));
    writeFileSync(path.join(dir, "Archivo Collada", "modelo.dae"), "<COLLADA/>");
    expect(modelSourceFor("sabrina", { sabrinaDir: dir })).toEqual({
      daePath: path.join(dir, "Archivo Collada", "modelo.dae"),
      runsDir: path.join(dir, "eval", "runs"),
      esperadosPath: path.join(dir, "eval", "esperados.json"),
    });
  });

  it("segundo fixture con carpeta pero sin un único .dae lanza (configuración rota, no un caso)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "eval-sources-"));
    mkdirSync(path.join(dir, "Archivo Collada"));
    expect(() => modelSourceFor("sabrina", { sabrinaDir: dir })).toThrow(/\.dae/);
  });

  it("un furnitureId desconocido da null", () => {
    expect(modelSourceFor("otro")).toBeNull();
  });
});
