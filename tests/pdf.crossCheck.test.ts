// Cruce del listado con las observaciones del .dae (docs/spec-sesion-2b-listado-cruce.md §2.3, §4 y §5).
// Observaciones escritas a mano: los casos de nombres (`_`, `__`, sin código) no se pueden armar con el .dae real.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import type { EdgeId, FurnitureDef } from "@/data/types";
import type { Observation } from "@/engine/types";
import {
  CodigoExcluidoYListadoError,
  CrossCheckInputError,
  MuebleDistintoError,
  crossCheck,
  type CrossCheckContext,
  type CrossCheckFinding,
  type CrossCheckOptions,
} from "@/pdf/crossCheck";
import { toListing, type ListedPiece } from "@/pdf/listing";
import { PDF_REASONS } from "@/pdf/reasons";
import type { CutListPdf } from "@/pdf/types";
import { validateFurniture } from "@/pdf/validate";
import { observationsFromDae } from "./helpers/observations";
import { HAS_SABRINA_FIXTURE, olmoDocuments, sabrinaDocuments } from "./helpers/pdfFixtures";

const CODE = "9999-01-M01-C04";
const OTHER = "9999-01-M01-C05";
const CONTEXT: CrossCheckContext = { furnitureId: "a", modelId: "a", toleranceMm: 2 };

function piece(overrides: Partial<ListedPiece> = {}): ListedPiece {
  return {
    code: CODE,
    name: "Lateral",
    lengthMm: 700,
    widthMm: 500,
    thicknessMm: 18,
    material: "Blanco",
    quantity: 1,
    edgeBanding: [],
    notes: null,
    rows: [{ document: 0, board: 0, piece: 0 }],
    ...overrides,
  };
}

/** Observación de prueba: solo los campos que usa el cruce son reales (§2.1); el resto, fijos y no reales. */
function observation(overrides: Partial<Observation> & { n?: number } = {}): Observation {
  const { n = 1, ...rest } = overrides;
  return {
    modelId: "a",
    instanceKey: `${CODE}#${n}`,
    rawName: `_${CODE}`,
    sizeMm: [18, 500, 700],
    edgeRunsMm: "no-disponible",
    frameVersion: "no-real",
    axisAligned: true,
    orientation: "horizontal",
    centerRel: [0.5, 0.5, 0.5],
    crossesMidplane: [false, false, false],
    mirrored: false,
    ...rest,
  };
}

const reasons = (findings: readonly CrossCheckFinding[]) => findings.map((f) => f.reason);
const levelFindings = (findings: readonly CrossCheckFinding[]) => findings.filter((f) => f.affectsLevel);

// Hallazgos de los casos de §4, para 2b-C9.
const collected: CrossCheckFinding[] = [];
function check(pieces: readonly ListedPiece[], observations: readonly Observation[], context: CrossCheckContext = CONTEXT, options?: CrossCheckOptions) {
  const result = crossCheck(pieces, observations, context, options);
  collected.push(...result.findings);
  return result;
}

describe("TP-11: el cruce ordena", () => {
  it("fila 100 x 1200 x 18 contra la caja [18, 100, 1200] cumple", () => {
    const result = check([piece({ lengthMm: 100, widthMm: 1200 })], [observation({ sizeMm: [18, 100, 1200] })]);
    expect(result.findings).toEqual([]);
  });

  it("también con L > A en el listado: {L, A, e} se ordena antes de comparar", () => {
    expect(check([piece({ lengthMm: 1200, widthMm: 100 })], [observation({ sizeMm: [18, 100, 1200] })]).findings).toEqual([]);
  });
});

describe("TP-41 a TP-46: casos de §4", () => {
  it("TP-41 / 2b-C4: código del listado sin observaciones -> codigo-sin-instancias, baja el nivel, evidencia de código", () => {
    const { findings, edges } = check([piece()], []);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ furnitureId: "a", code: CODE, reason: "codigo-sin-instancias", affectsLevel: true });
    expect(findings[0].evidence.map((e) => e.kind)).toEqual(["codigo"]);
    expect(edges[CODE]).toBe("no-disponible");
  });

  it("TP-42 / 2b-C5: observaciones sin fila -> instancias-sin-fila, informativo, evidencia de código", () => {
    const { findings, edges } = check([piece()], [observation(), observation({ rawName: `_${OTHER}`, instanceKey: `${OTHER}#1` })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: OTHER, reason: "instancias-sin-fila", affectsLevel: false });
    expect(findings[0].evidence.map((e) => e.kind)).toEqual(["codigo"]);
    expect(Object.keys(edges)).toEqual([CODE]);
  });

  it("TP-43: total 2 contra 3 instancias -> cantidad-no-coincide", () => {
    const { findings } = check([piece({ quantity: 2 })], [1, 2, 3].map((n) => observation({ n })));
    expect(reasons(findings)).toEqual(["cantidad-no-coincide"]);
    expect(findings[0]).toMatchObject({ affectsLevel: true });
    expect(findings[0].evidence.map((e) => e.kind)).toEqual(["cantidad"]);
  });

  it.each([
    [0.95, []],
    [1.0, []],
    [1.05, ["medida-no-coincide"]],
  ])("TP-44: A del listado + %s·tol -> %j", (k, expected) => {
    const tol = CONTEXT.toleranceMm;
    const { findings } = check([piece()], [observation({ sizeMm: [18, 500 + k * tol, 700] })]);
    expect(reasons(findings)).toEqual(expected);
    for (const finding of findings) {
      expect(finding.affectsLevel).toBe(true);
      expect(finding.evidence.map((e) => e.kind)).toEqual(["medidas"]);
    }
  });

  it("TP-44: también fuera de tolerancia por defecto (y en el espesor)", () => {
    expect(reasons(check([piece()], [observation({ sizeMm: [18, 495, 700] })]).findings)).toEqual(["medida-no-coincide"]);
    expect(reasons(check([piece()], [observation({ sizeMm: [21, 500, 700] })]).findings)).toEqual(["medida-no-coincide"]);
  });

  it("una caja rota (NaN) no cumple medidas", () => {
    expect(reasons(check([piece()], [observation({ sizeMm: [18, Number.NaN, 700] })]).findings)).toEqual(["medida-no-coincide"]);
  });

  it("medidas: una evidencia por instancia fuera de tolerancia, en un solo hallazgo", () => {
    const { findings } = check(
      [piece({ quantity: 3 })],
      [observation({ n: 1 }), observation({ n: 2, sizeMm: [18, 500, 710] }), observation({ n: 3, sizeMm: [18, 490, 700] })],
    );
    expect(reasons(findings)).toEqual(["medida-no-coincide"]);
    expect(findings[0].evidence.map((e) => e.detail.split(":")[0])).toEqual([`${CODE}#2`, `${CODE}#3`]);
  });

  it("TP-45: caras de canto que miden L dos veces y una sola marca en lado L -> canteado-no-coincide", () => {
    const { findings, edges } = check([piece({ edgeBanding: ["largo-A"] })], [observation({ edgeRunsMm: [700, 700] })]);
    expect(edges[CODE]).toBe("no-coincide");
    expect(reasons(findings)).toEqual(["canteado-no-coincide"]);
    expect(findings[0]).toMatchObject({ affectsLevel: true });
    expect(findings[0].evidence.map((e) => e.kind)).toEqual(["canto"]);
  });

  it("TP-45: mismos lados L y A que caras -> cumple, sin hallazgo", () => {
    const edgeBanding: EdgeId[] = ["corto-A", "largo-A", "largo-B"];
    const { findings, edges } = check([piece({ edgeBanding })], [observation({ edgeRunsMm: [700, 500.4, 699] })]);
    expect(edges[CODE]).toBe("cumple");
    expect(findings).toEqual([]);
  });

  it("TP-45: con L < A el lado L sigue siendo el que mide lengthMm", () => {
    const { edges } = check([piece({ lengthMm: 300, widthMm: 800, edgeBanding: ["largo-A"] })], [observation({ sizeMm: [18, 300, 800], edgeRunsMm: [300] })]);
    expect(edges[CODE]).toBe("cumple");
    const swapped = check([piece({ lengthMm: 300, widthMm: 800, edgeBanding: ["largo-A"] })], [observation({ sizeMm: [18, 300, 800], edgeRunsMm: [800] })]);
    expect(swapped.edges[CODE]).toBe("no-coincide");
  });

  it("TP-46: |L - A| <= tol -> neutral, sin razón de canteado aunque las caras no coincidan", () => {
    const { findings, edges } = check([piece({ lengthMm: 600, widthMm: 601.5, edgeBanding: ["largo-A"] })], [observation({ sizeMm: [18, 600, 601.5], edgeRunsMm: [600, 600, 601] })]);
    expect(edges[CODE]).toBe("neutral");
    expect(findings).toEqual([]);
  });

  it('sin caras Canto_* en el .dae -> "no-disponible", sin hallazgo', () => {
    const { findings, edges } = check([piece({ edgeBanding: ["largo-A"] })], [observation()]);
    expect(edges[CODE]).toBe("no-disponible");
    expect(findings).toEqual([]);
  });

  it("instancias del mismo código, unas con caras y otras sin -> no-coincide (el modelo no es parejo)", () => {
    const { findings, edges } = check([piece({ quantity: 2, edgeBanding: ["largo-A"] })], [observation({ n: 1, edgeRunsMm: [700] }), observation({ n: 2 })]);
    expect(edges[CODE]).toBe("no-coincide");
    expect(reasons(findings)).toEqual(["canteado-no-coincide"]);
    expect(findings[0].evidence).toHaveLength(1);
  });

  it("una cara a igual distancia de L y de A (dentro de la tolerancia de los dos) no se clasifica -> no-coincide", () => {
    const { edges } = check([piece({ lengthMm: 503, widthMm: 500, edgeBanding: ["largo-A"] })], [observation({ sizeMm: [18, 500, 503], edgeRunsMm: [501.5] })]);
    expect(edges[CODE]).toBe("no-coincide");
    const nearer = check([piece({ lengthMm: 503, widthMm: 500, edgeBanding: ["largo-A"] })], [observation({ sizeMm: [18, 500, 503], edgeRunsMm: [502] })]);
    expect(nearer.edges[CODE]).toBe("cumple");
  });

  it("una cara que no mide ni L ni A -> no-coincide", () => {
    expect(check([piece({ edgeBanding: ["largo-A"] })], [observation({ edgeRunsMm: [700, 18] })]).edges[CODE]).toBe("no-coincide");
  });
});

describe("2b-C1 a 2b-C8: nombres, muebles y canteado", () => {
  it("2b-C1: observación `_<código>` se cruza con la fila", () => {
    expect(check([piece()], [observation({ rawName: `_${CODE}` })]).findings).toEqual([]);
  });

  it("2b-C1: también sin `_` inicial", () => {
    expect(check([piece()], [observation({ rawName: CODE })]).findings).toEqual([]);
  });

  it("2b-C2: `_<código>__` se cruza y el cruce no agrega razón por el nombre", () => {
    expect(check([piece()], [observation({ rawName: `_${CODE}__` })]).findings).toEqual([]);
  });

  it("2b-C3: rawName null no entra: ni instancias-sin-fila ni cantidad", () => {
    const { findings } = check([piece()], [observation(), observation({ n: 2, rawName: null, instanceKey: "malla#1" })]);
    expect(findings).toEqual([]);
  });

  it("un nombre que no da un código válido tampoco entra", () => {
    expect(check([piece()], [observation(), observation({ n: 2, rawName: "Pata", instanceKey: "Pata#1" })]).findings).toEqual([]);
  });

  it("2b-C6: una observación de otro modelo con un código del listado -> MuebleDistintoError, nunca se empareja", () => {
    const foreign = observation({ modelId: "b" });
    expect(() => crossCheck([piece()], [observation(), foreign], CONTEXT)).toThrow(MuebleDistintoError);
    try {
      crossCheck([piece()], [foreign], CONTEXT);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MuebleDistintoError);
      expect(error).toMatchObject({ expectedModelId: "a", receivedModelId: "b", instanceKey: foreign.instanceKey, name: "MuebleDistintoError" });
    }
  });

  it('2b-C6b: modelId "a-dae" distinto de furnitureId "a": se cruzan y los hallazgos salen con furnitureId "a"', () => {
    const context = { furnitureId: "a", modelId: "a-dae", toleranceMm: 2 };
    const { findings } = check([piece({ quantity: 2 })], [observation({ modelId: "a-dae" })], context);
    expect(reasons(findings)).toEqual(["cantidad-no-coincide"]);
    expect(findings.every((f) => f.furnitureId === "a")).toBe(true);
    expect(() => crossCheck([piece()], [observation({ modelId: "a" })], context)).toThrow(MuebleDistintoError);
  });

  it('2b-C7: "sin-definir" no se compara, aunque las caras contradigan []', () => {
    const { findings, edges } = check([piece({ edgeBanding: "sin-definir" })], [observation({ edgeRunsMm: [700, 700, 500] })]);
    expect(edges[CODE]).toBe("sin-definir");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ reason: "canteado-sin-definir", affectsLevel: false });
    expect(findings[0].evidence).toEqual([expect.objectContaining({ kind: "canto", result: "no-disponible" })]);
    expect(reasons(findings)).not.toContain("canteado-no-coincide");
  });

  it('2b-C7: "sin-definir" tiene prioridad sobre "no-disponible", y sale uno por código aunque no haya instancias', () => {
    expect(check([piece({ edgeBanding: "sin-definir" })], [observation()]).edges[CODE]).toBe("sin-definir");
    const { findings, edges } = check([piece({ edgeBanding: "sin-definir" })], []);
    expect(edges[CODE]).toBe("sin-definir");
    expect(reasons(findings)).toEqual(["codigo-sin-instancias", "canteado-sin-definir"]);
  });

  it("2b-C8: [] sí se compara: caras Canto_* en la observación -> canteado-no-coincide", () => {
    const { findings, edges } = check([piece({ edgeBanding: [] })], [observation({ edgeRunsMm: [700] })]);
    expect(edges[CODE]).toBe("no-coincide");
    expect(reasons(findings)).toEqual(["canteado-no-coincide"]);
  });

  it("2b-C8: [] con observación sin caras de canto -> cumple", () => {
    expect(check([piece({ edgeBanding: [] })], [observation({ edgeRunsMm: [] })]).edges[CODE]).toBe("cumple");
  });
});

describe("I11: códigos excluidos del listado (excludedCodes)", () => {
  it("un código excluido presente en el .dae no genera ningún hallazgo (ni instancias-sin-fila)", () => {
    const { findings, edges } = check([piece()], [observation(), observation({ rawName: `_${OTHER}`, instanceKey: `${OTHER}#1` })], CONTEXT, { excludedCodes: [OTHER] });
    expect(findings).toEqual([]);
    expect(Object.keys(edges)).toEqual([CODE]);
  });

  it("un código excluido sin instancias tampoco genera hallazgos", () => {
    expect(check([piece()], [observation()], CONTEXT, { excludedCodes: [OTHER] }).findings).toEqual([]);
  });

  it("un código ausente de las dos listas y presente en el .dae sigue dando instancias-sin-fila", () => {
    const third = "9999-01-M01-C06";
    const { findings } = check([piece()], [observation(), observation({ rawName: `_${third}`, instanceKey: `${third}#1` })], CONTEXT, { excludedCodes: [OTHER] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: third, reason: "instancias-sin-fila", affectsLevel: false });
  });

  it("un código en el listado y entre los excluidos -> CodigoExcluidoYListadoError", () => {
    try {
      crossCheck([piece()], [observation()], CONTEXT, { excludedCodes: [CODE] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CodigoExcluidoYListadoError);
      expect(error).toBeInstanceOf(CrossCheckInputError);
      expect(error).toMatchObject({ code: CODE, name: "CodigoExcluidoYListadoError" });
    }
  });

  it("sin opciones se comporta como antes", () => {
    expect(reasons(crossCheck([piece()], [observation(), observation({ rawName: `_${OTHER}`, instanceKey: `${OTHER}#1` })], CONTEXT).findings)).toEqual(["instancias-sin-fila"]);
  });
});

describe("entradas que el cruce no interpreta", () => {
  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])("tolerancia %s -> CrossCheckInputError", (toleranceMm) => {
    expect(() => crossCheck([piece()], [], { ...CONTEXT, toleranceMm })).toThrow(CrossCheckInputError);
  });

  it("un código repetido en el listado -> CrossCheckInputError", () => {
    expect(() => crossCheck([piece(), piece()], [], CONTEXT)).toThrow(CrossCheckInputError);
  });

  it("es pura: argumentos congelados, mismo resultado dos veces", () => {
    const pieces = Object.freeze([Object.freeze(piece({ quantity: 2, edgeBanding: Object.freeze<EdgeId[]>(["largo-A"]) }))]);
    const observations = Object.freeze([Object.freeze(observation({ sizeMm: [18, 600, 700], edgeRunsMm: [700, 700] }))]);
    const first = crossCheck(pieces, observations, CONTEXT);
    expect(crossCheck(pieces, observations, CONTEXT)).toEqual(first);
    expect(reasons(first.findings)).toEqual(["cantidad-no-coincide", "medida-no-coincide", "canteado-no-coincide"]);
  });
});

describe("2b-C9: evidencia", () => {
  it("cada hallazgo de los casos anteriores tiene al menos una Evidence con detail, y su razón está en el catálogo", () => {
    const KIND: Record<string, string> = {
      "codigo-sin-instancias": "codigo",
      "instancias-sin-fila": "codigo",
      "cantidad-no-coincide": "cantidad",
      "medida-no-coincide": "medidas",
      "canteado-no-coincide": "canto",
      "canteado-sin-definir": "canto",
    };
    expect(new Set(reasons(collected))).toEqual(new Set(Object.keys(KIND)));
    for (const finding of collected) {
      expect(PDF_REASONS).toContain(finding.reason);
      expect(finding.evidence.length, finding.reason).toBeGreaterThan(0);
      for (const evidence of finding.evidence) {
        expect(evidence.detail.trim().length).toBeGreaterThan(0);
        expect(evidence.kind).toBe(KIND[finding.reason]);
        expect(evidence.rule).toBeUndefined();
      }
    }
  });
});

describe("2b-T1: el tipo fuerza affectsLevel", () => {
  it("una razón informativa con affectsLevel: true, o una de nivel con false, no compila", () => {
    const base = { furnitureId: "a", code: CODE, evidence: [{ kind: "canto" as const, result: "no-disponible" as const, detail: "x" }] };
    // @ts-expect-error canteado-sin-definir nunca baja el nivel (D5)
    const sinDefinir: CrossCheckFinding = { ...base, reason: "canteado-sin-definir", affectsLevel: true };
    // @ts-expect-error instancias-sin-fila no tiene fila que marcar
    const sinFila: CrossCheckFinding = { ...base, reason: "instancias-sin-fila", affectsLevel: true };
    // @ts-expect-error medida-no-coincide siempre baja el nivel
    const medida: CrossCheckFinding = { ...base, reason: "medida-no-coincide", affectsLevel: false };
    // @ts-expect-error una razón del validador no es del cruce
    const otra: CrossCheckFinding = { ...base, reason: "hoja-incompleta", affectsLevel: true };
    const valid: CrossCheckFinding[] = [
      { ...base, reason: "canteado-sin-definir", affectsLevel: false },
      { ...base, reason: "canteado-no-coincide", affectsLevel: true },
    ];
    expect([sinDefinir, sinFila, medida, otra, ...valid]).toHaveLength(6);
  });
});

// --- 2b-S2: fixture sintético. Observaciones armadas a mano desde esperado/ (no desde fuente.ts ni desde el listado). ---

const SINTETICO = path.resolve(__dirname, "fixtures", "pdf-sintetico", "esperado");
const sintetico = ["S1", "S2", "S3"].map((id) => JSON.parse(readFileSync(path.join(SINTETICO, `${id}.json`), "utf8")) as CutListPdf);
const S_CONTEXT: CrossCheckContext = { furnitureId: "sintetico", modelId: "sintetico-dae", toleranceMm: 2 };

/** Una observación por pieza física de esperado/: caja {L, A, e} ordenada y una cara de canto por subcolumna marcada (s1, s2 miden L; s3, s4, A). */
function syntheticObservations(): Observation[] {
  const counters = new Map<string, number>();
  return sintetico.flatMap((document) =>
    document.boards.flatMap((board) =>
      board.pieces.flatMap((row) => {
        const code = row.code as string;
        const L = row.finalL as number;
        const A = row.finalA as number;
        const runs: number[] | "no-disponible" =
          row.edges === "columna-ausente" ? "no-disponible" : [row.edges.s1 && L, row.edges.s2 && L, row.edges.s3 && A, row.edges.s4 && A].filter((r): r is number => typeof r === "number");
        return Array.from({ length: row.quantity as number }, () => {
          const n = (counters.get(code) ?? 0) + 1;
          counters.set(code, n);
          return observation({
            modelId: S_CONTEXT.modelId,
            instanceKey: `${code}#${n}`,
            rawName: `_${code}`,
            sizeMm: [board.thicknessMm, L, A].sort((a, b) => a - b) as [number, number, number],
            edgeRunsMm: runs,
          });
        });
      }),
    ),
  );
}

describe("2b-S2: cruce del sintético", () => {
  const listing = toListing(S_CONTEXT.furnitureId, validateFurniture(sintetico));
  if (listing.status === "bloqueado") throw new Error("el sintético no debería bloquear");
  const pieces = listing.pieces;
  const base = syntheticObservations();
  const s3Codes = new Set(sintetico[2].boards.flatMap((b) => b.pieces.map((p) => p.code)));
  const target = pieces.find((p) => Array.isArray(p.edgeBanding) && p.edgeBanding.length > 0 && Math.abs(p.lengthMm - p.widthMm) > 10) as ListedPiece;
  const targetCode = target.code;

  it("sin razones que bajen el nivel; solo canteado-sin-definir en los códigos de S3", () => {
    const { findings, edges } = crossCheck(pieces, base, S_CONTEXT);
    expect(levelFindings(findings)).toEqual([]);
    expect(findings.map((f) => f.code).sort()).toEqual([...s3Codes].sort());
    expect(new Set(reasons(findings))).toEqual(new Set(["canteado-sin-definir"]));
    for (const piece of pieces) expect(edges[piece.code], piece.code).toBe(s3Codes.has(piece.code) ? "sin-definir" : Math.abs(piece.lengthMm - piece.widthMm) <= S_CONTEXT.toleranceMm ? "neutral" : "cumple");
  });

  const perturbations: [string, (obs: Observation[]) => Observation[], CrossCheckFinding["reason"]][] = [
    ["sin las instancias de un código", (obs) => obs.filter((o) => o.rawName !== `_${targetCode}`), "codigo-sin-instancias"],
    ["una instancia de un código que el listado no trae", (obs) => [...obs, observation({ modelId: S_CONTEXT.modelId, rawName: "_9999-99-M01-C99", instanceKey: "9999-99-M01-C99#1" })], "instancias-sin-fila"],
    ["una instancia de menos", (obs) => obs.filter((o) => o.instanceKey !== `${targetCode}#1`), "cantidad-no-coincide"],
    ["una caja 3 mm más larga", (obs) => obs.map((o) => (o.instanceKey === `${targetCode}#1` ? { ...o, sizeMm: [o.sizeMm[0], o.sizeMm[1], o.sizeMm[2] + 3] } : o)), "medida-no-coincide"],
    ["una cara de canto de más", (obs) => obs.map((o) => (o.instanceKey === `${targetCode}#1` && Array.isArray(o.edgeRunsMm) ? { ...o, edgeRunsMm: [...o.edgeRunsMm, target.lengthMm] } : o)), "canteado-no-coincide"],
  ];

  it.each(perturbations)("perturbación: %s -> %s", (_, perturb, reason) => {
    const { findings } = crossCheck(pieces, perturb(base), S_CONTEXT);
    const changed = findings.filter((f) => f.reason !== "canteado-sin-definir");
    expect(reasons(changed)).toEqual([reason]);
  });
});

// --- TP-40 y TP-40b: con el .dae real (D2), mediante el adaptador de prueba tests/helpers/observations.ts. ---

const ROOT = path.resolve(__dirname, "..");

describe("TP-40: primer fixture contra su .dae", () => {
  const context: CrossCheckContext = { furnitureId: olmoDef.furniture.id, modelId: olmoDef.modelUrl, toleranceMm: olmoDef.toleranceMm };
  const listing = toListing(context.furnitureId, validateFurniture(olmoDocuments()));
  const observations = observationsFromDae(path.join(ROOT, "public", "models", "Olmo", "olmo.dae"), context.modelId);

  it("21 códigos con instancias, cantidades y medidas dentro de 2 mm, canteado sin-definir, nada que baje el nivel", () => {
    expect(context.toleranceMm).toBe(2);
    if (listing.status === "bloqueado") throw new Error(listing.reason);
    expect(listing.pieces).toHaveLength(21);
    expect(observations).toHaveLength(33);
    const { findings, edges } = crossCheck(listing.pieces, observations, context);
    expect(levelFindings(findings)).toEqual([]);
    expect(Object.keys(edges)).toHaveLength(21);
    for (const piece of listing.pieces) expect(edges[piece.code], piece.code).toBe("sin-definir");
    // Solo el informativo del canteado, uno por código; ni instancias-sin-fila (el `__` de C01 se normaliza).
    expect(findings.map((f) => [f.code, f.reason])).toEqual(listing.pieces.map((p) => [p.code, "canteado-sin-definir"]));
  });

  it('el .dae no trae caras Canto_*: con el canteado definido daría "no-disponible"', () => {
    if (listing.status === "bloqueado") throw new Error(listing.reason);
    expect(observations.every((o) => o.edgeRunsMm === "no-disponible")).toBe(true);
    const defined = listing.pieces.map((p) => ({ ...p, edgeBanding: [] as EdgeId[] }));
    const { findings, edges } = crossCheck(defined, observations, context);
    expect(findings).toEqual([]);
    expect(new Set(Object.values(edges))).toEqual(new Set(["no-disponible"]));
  });
  it("I11 con el .dae real: un código excluido del listado no aparece como instancias-sin-fila", () => {
    const documents = olmoDocuments();
    documents[0].boards[0].pieces[0].quantity = null;
    documents[0].pending.push({ path: "boards[0].pieces[0].quantity", reason: "ilegible" });
    const draft = toListing(context.furnitureId, validateFurniture(documents));
    if (draft.status !== "borrador") throw new Error(draft.status);
    expect(draft.excluded).toHaveLength(1);
    const excludedCodes = draft.excluded.map((e) => e.code);
    const withOption = crossCheck(draft.pieces, observations, context, { excludedCodes });
    expect(withOption.findings.filter((f) => excludedCodes.includes(f.code))).toEqual([]);
    expect(levelFindings(withOption.findings)).toEqual([]);
    // Sin la opción, el código aparecería como "el PDF no lo trae": es lo que la opción evita.
    const without = crossCheck(draft.pieces, observations, context);
    expect(without.findings.filter((f) => excludedCodes.includes(f.code)).map((f) => f.reason)).toEqual(["instancias-sin-fila"]);
  });
});

// Segundo fixture: local (carpeta ignorada). Se saltea si falta, como sabrina.test.ts; no escribe códigos ni cifras.
const SABRINA = path.join(ROOT, "Sabrina");
const SABRINA_DEF = path.join(SABRINA, "data", "sabrina.def.ts");
const SABRINA_DAE_DIR = path.join(SABRINA, "Archivo Collada");
const sabrinaDae = existsSync(SABRINA_DAE_DIR) ? readdirSync(SABRINA_DAE_DIR).find((name) => name.toLowerCase().endsWith(".dae")) : undefined;
const hasSabrina = HAS_SABRINA_FIXTURE && existsSync(SABRINA_DEF) && sabrinaDae !== undefined;
const sabrinaDef: FurnitureDef | undefined = hasSabrina ? ((await import(/* @vite-ignore */ SABRINA_DEF)) as { sabrinaDef: FurnitureDef }).sabrinaDef : undefined;

describe.skipIf(!hasSabrina)("TP-40b: segundo fixture contra su .dae (local)", () => {
  it("sin hallazgos que bajen el nivel, con su tolerancia; solo informativos de canteado sin definir", () => {
    const def = sabrinaDef as FurnitureDef;
    const context: CrossCheckContext = { furnitureId: def.furniture.id, modelId: def.modelUrl, toleranceMm: def.toleranceMm };
    const listing = toListing(context.furnitureId, validateFurniture(sabrinaDocuments()));
    if (listing.status === "bloqueado") throw new Error(listing.reason);
    expect(listing.status).toBe("publicable");
    const observations = observationsFromDae(path.join(SABRINA_DAE_DIR, sabrinaDae as string), context.modelId);
    const { findings, edges } = crossCheck(listing.pieces, observations, context);
    expect(levelFindings(findings)).toEqual([]);
    expect(new Set(findings.map((f) => f.reason))).toEqual(new Set(findings.length > 0 ? ["canteado-sin-definir"] : []));
    // Con columna de cantos, el canteado se comparó contra las caras del .dae y cumple (o es neutral).
    for (const piece of listing.pieces) {
      if (piece.edgeBanding === "sin-definir") expect(edges[piece.code]).toBe("sin-definir");
      else expect(["cumple", "neutral", "no-disponible"]).toContain(edges[piece.code]);
    }
    expect(Object.values(edges)).toContain("cumple");
  });
});
