// T11: publicación del run (docs/spec-t11-harness-minimo.md §4, E10 y E11). Solo directorios temporales.

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publishRun, recordFirstRun } from "../../eval/publish";
import { hashFileName } from "@/engine/hash";
import { okCase } from "../helpers/evalFixtures";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "eval-publish-"));

describe("publishRun", () => {
  it("escribe <runsDir>/<hash>.json con JSON de 2 espacios y salto de línea final, y devuelve la ruta", () => {
    const { run } = okCase("olmo");
    const runsDir = path.join(tmp(), "runs"); // no existe: publishRun lo crea
    const file = publishRun(run, runsDir, ["olmo", "sintetico"]);
    expect(file).toBe(path.join(runsDir, `${hashFileName(run.modelId as `sha256:${string}`)}.json`));
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(run, null, 2) + "\n");
  });

  it("E10: un furnitureId fuera de la lista pública lanza y no escribe nada", () => {
    const { run } = okCase("sabrina");
    const runsDir = path.join(tmp(), "runs");
    expect(() => publishRun(run, runsDir, ["olmo", "sintetico"])).toThrow(/sabrina|lista/);
    expect(existsSync(runsDir)).toBe(false);
  });
});

describe("recordFirstRun", () => {
  it("escribe la fecha del modelId la primera vez y crea el archivo", () => {
    const file = path.join(tmp(), "primera-corrida.json");
    recordFirstRun(file, "sha256:aaa", "2026-11-20");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "sha256:aaa": "2026-11-20" });
  });

  it("E11: no sobrescribe una fecha ya escrita y conserva las otras entradas", () => {
    const file = path.join(tmp(), "primera-corrida.json");
    recordFirstRun(file, "sha256:aaa", "2026-11-20");
    recordFirstRun(file, "sha256:aaa", "2027-01-01");
    recordFirstRun(file, "sha256:bbb", "2027-01-02");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "sha256:aaa": "2026-11-20", "sha256:bbb": "2027-01-02" });
  });
});
