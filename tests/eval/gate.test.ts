// T11: gate G1 a G5 (docs/spec-t11-harness-minimo.md §3 y §4; plan T11). Pruebas E1 a E5, E7 (parte del gate) y E8.
// "olmo" es el caso del repo y "sabrina" el segundo fixture (local). Todo en memoria: no toca eval/ del repo.

import { describe, expect, it } from "vitest";
import type { RealCase } from "../../eval/cases";
import { evaluateGate, projectRun, type EsperadosFile, type ExpectedRun } from "../../eval/gate";
import type { AssociationRun, InstanceResult } from "@/engine/types";
import { okCase } from "../helpers/evalFixtures";

const olmo = okCase("olmo");
const sabrina = okCase("sabrina");
const ausente: RealCase = { furnitureId: "sabrina", status: "no-ejecutado", motivo: "carpeta ausente" };

const igual = (c: typeof olmo): EsperadosFile => ({ [c.run.modelId]: projectRun(c.run) });

const base = {
  determinism: { a: "x", b: "x" },
  permutations: { ok: true, detail: "20 permutaciones iguales" },
  published: () => null,
};

const check = (gate: ReturnType<typeof evaluateGate>, id: string) => {
  const found = gate.checks.find((c) => c.id === id);
  if (found === undefined) throw new Error(`falta el check ${id}`);
  return found;
};

describe("projectRun (proyección para G2)", () => {
  it("guarda furnitureId, listadoId, passes y por instancia clave, nivel, código, razones y top-3; sin evidencia", () => {
    const withCandidates: InstanceResult = {
      ...olmo.run.results[0],
      level: "dudosa",
      pieceCode: null,
      reasons: ["medida-fuera-de-tolerancia"],
      candidates: ["C1", "C2", "C3", "C4"].map((pieceCode) => ({ pieceCode, tuple: [0, 0, 0, 0, 0, 0, 0], cupoCompleto: false, notes: [], evidence: [] })),
      evidence: [{ kind: "medidas", result: "no-cumple", detail: "texto" }],
    };
    const run: AssociationRun = { ...olmo.run, results: [withCandidates] };
    const projected: ExpectedRun = projectRun(run);
    expect(projected).toEqual({
      furnitureId: "olmo",
      listadoId: run.listadoId,
      passes: 1,
      results: [{ instanceKey: withCandidates.instanceKey, level: "dudosa", pieceCode: null, reasons: ["medida-fuera-de-tolerancia"], top3: ["C1", "C2", "C3"] }],
    });
    expect(JSON.stringify(projected)).not.toContain("texto");
  });
});

describe("G2: casos reales contra esperados", () => {
  it("E1: un caso real presente distinto de esperados falla", () => {
    const projected = projectRun(olmo.run);
    const alterado: ExpectedRun = { ...projected, results: projected.results.map((r, i) => (i === 0 ? { ...r, level: "dudosa" as const } : r)) };
    const gate = evaluateGate({ ...base, real: [olmo], esperados: () => ({ [olmo.run.modelId]: alterado }) });
    expect(check(gate, "G2").status).toBe("falla");
    expect(gate.passed).toBe(false);
  });

  it("igual a esperados: G2 ok", () => {
    const gate = evaluateGate({ ...base, real: [olmo], esperados: () => igual(olmo) });
    expect(check(gate, "G2").status).toBe("ok");
    expect(gate.passed).toBe(true);
  });

  it("E2: modelo del repo con modelId ausente en un esperados no vacío falla con 'hash distinto'", () => {
    const gate = evaluateGate({ ...base, real: [olmo], esperados: () => ({ "sha256:otro": projectRun(olmo.run) }) });
    expect(check(gate, "G2").status).toBe("falla");
    expect(check(gate, "G2").detail).toMatch(/hash distinto/);
  });

  it("T11-E9: sin esperados (vacío o sin fuente) el primer fixture falla con 'falta esperados'", () => {
    for (const esperados of [() => ({}), () => null]) {
      const gate = evaluateGate({ ...base, real: [olmo], esperados });
      expect(check(gate, "G2").status).toBe("falla");
      expect(check(gate, "G2").detail).toMatch(/falta esperados/);
    }
  });

  it("E3 (§9.1): segundo fixture ausente → no ejecutado y el gate aprueba", () => {
    const gate = evaluateGate({ ...base, real: [olmo, ausente], esperados: (id) => (id === "olmo" ? igual(olmo) : null) });
    expect(check(gate, "G2").status).toBe("ok");
    expect(check(gate, "G2").detail).toMatch(/sabrina: no ejecutado/);
    expect(gate.passed).toBe(true);
  });

  it("E4: segundo fixture presente sin esperados falla", () => {
    const gate = evaluateGate({ ...base, real: [olmo, sabrina], esperados: (id) => (id === "olmo" ? igual(olmo) : {}) });
    expect(check(gate, "G2").status).toBe("falla");
    expect(gate.passed).toBe(false);
  });

  it("T11-E5: un no-ejecutado del primer fixture es una falla de G2", () => {
    const sinRun: RealCase = { furnitureId: "olmo", status: "no-ejecutado", motivo: "listado inválido (codigo-repetido)" };
    const gate = evaluateGate({ ...base, real: [sinRun], esperados: () => ({}) });
    expect(check(gate, "G2").status).toBe("falla");
    expect(check(gate, "G2").detail).toMatch(/codigo-repetido/);
  });

  it("E5: run publicado con engineRunId distinto del actual falla con 'publicación desactualizada'", () => {
    const gate = evaluateGate({ ...base, real: [olmo], esperados: () => igual(olmo), published: () => ({ engineRunId: "sha256:viejo" }) });
    expect(check(gate, "G2").status).toBe("falla");
    expect(check(gate, "G2").detail).toMatch(/publicación desactualizada/);
  });

  it("run publicado con el engineRunId actual: ok; sin run publicado: ok", () => {
    for (const published of [() => ({ engineRunId: olmo.run.engineRunId }), () => null]) {
      expect(check(evaluateGate({ ...base, real: [olmo], esperados: () => igual(olmo), published }), "G2").status).toBe("ok");
    }
  });

  it("E13 (parte del gate): el detalle del segundo fixture no lleva códigos, claves ni cifras", () => {
    const gate = evaluateGate({ ...base, real: [sabrina], esperados: () => ({ "sha256:otro": projectRun(sabrina.run) }) });
    const detail = check(gate, "G2").detail;
    expect(detail).not.toMatch(/\d/);
    expect(detail).not.toContain("9999");
  });
});

describe("G3 y G4", () => {
  it("E7: dos corridas idénticas y permutaciones iguales → ok, con la versión de Node en G3", () => {
    const gate = evaluateGate({ ...base, real: [olmo], esperados: () => igual(olmo) });
    expect(check(gate, "G3").status).toBe("ok");
    expect(check(gate, "G3").detail).toContain(process.version);
    expect(check(gate, "G4").status).toBe("ok");
  });

  it("dos corridas distintas → G3 falla; permutaciones distintas → G4 falla", () => {
    const g3 = evaluateGate({ ...base, real: [olmo], esperados: () => igual(olmo), determinism: { a: "x", b: "y" } });
    expect(check(g3, "G3").status).toBe("falla");
    expect(g3.passed).toBe(false);
    const g4 = evaluateGate({ ...base, real: [olmo], esperados: () => igual(olmo), permutations: { ok: false, detail: "difiere" } });
    expect(check(g4, "G4").status).toBe("falla");
    expect(g4.passed).toBe(false);
  });
});

describe("G1 y G5 sin sintéticos ni baseline", () => {
  it("E8 (T11-E7): G1 y G5 quedan no-ejecutado, con motivo, y no hacen fallar el gate", () => {
    const gate = evaluateGate({ ...base, real: [olmo], esperados: () => igual(olmo) });
    expect(check(gate, "G1").status).toBe("no-ejecutado");
    expect(check(gate, "G1").detail).toMatch(/sin casos sintéticos \(T13\)/);
    expect(check(gate, "G5").status).toBe("no-ejecutado");
    expect(gate.checks.map((c) => c.id)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    expect(gate.passed).toBe(true);
  });
});
