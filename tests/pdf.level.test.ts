// combinarNivel (docs/spec-sesion-2b-listado-cruce.md §4.1 y §5: 2b-N1 a 2b-N6).

import { describe, expect, it } from "vitest";
import type { CrossCheckFinding } from "@/pdf/crossCheck";
import { combinarNivel } from "@/pdf/level";

const X = "9999-01-M01-C04";
const Y = "9999-01-M01-C05";
const evidence = [{ kind: "codigo" as const, result: "no-cumple" as const, detail: "prueba" }];
const finding = (reason: CrossCheckFinding["reason"], code = X): CrossCheckFinding =>
  reason === "instancias-sin-fila" || reason === "canteado-sin-definir"
    ? { furnitureId: "a", code, reason, affectsLevel: false, evidence }
    : { furnitureId: "a", code, reason, affectsLevel: true, evidence };

describe("combinarNivel", () => {
  it("2b-N1: sin hallazgos, el nivel no cambia", () => {
    expect(combinarNivel("segura", X, [])).toBe("segura");
    expect(combinarNivel("dudosa", X, [])).toBe("dudosa");
  });

  it.each(["codigo-sin-instancias", "cantidad-no-coincide", "medida-no-coincide", "canteado-no-coincide"] as const)(
    "2b-N2: gana el peor: segura + %s -> dudosa",
    (reason) => {
      expect(combinarNivel("segura", X, [finding(reason)])).toBe("dudosa");
    },
  );

  it("2b-N3: nunca mejora: dudosa con hallazgos solo informativos sigue dudosa", () => {
    expect(combinarNivel("dudosa", X, [finding("instancias-sin-fila"), finding("canteado-sin-definir")])).toBe("dudosa");
  });

  it("2b-N4: los informativos del mismo código no cuentan", () => {
    expect(combinarNivel("segura", X, [finding("instancias-sin-fila"), finding("canteado-sin-definir")])).toBe("segura");
  });

  it("2b-N5: pura: mismo resultado dos veces y argumentos sin cambios", () => {
    const findings = Object.freeze([Object.freeze(finding("medida-no-coincide")), Object.freeze(finding("canteado-sin-definir", Y))]);
    const copy = structuredClone(findings);
    expect(combinarNivel("segura", X, findings)).toBe(combinarNivel("segura", X, findings));
    expect(findings).toEqual(copy);
  });

  it("2b-N6: un hallazgo de otro código no cambia el nivel", () => {
    expect(combinarNivel("segura", X, [finding("medida-no-coincide", Y)])).toBe("segura");
    expect(combinarNivel("segura", X, [finding("medida-no-coincide", Y), finding("cantidad-no-coincide", X)])).toBe("dudosa");
  });
});
