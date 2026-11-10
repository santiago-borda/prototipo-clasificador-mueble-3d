// Pureza del motor (spec-motor §4b y §13; plan T2, M3): src/engine/ no importa three, ni el adapter, ni usa el DOM.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, FRAME_VERSION, VOCABULARY_VERSION } from "@/engine/versions";

const ENGINE = path.resolve(__dirname, "..", "..", "src", "engine");
const files = readdirSync(ENGINE, { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join(ENGINE, f));

describe("M3: pureza de src/engine/", () => {
  it("hay archivos que revisar", () => {
    expect(files.map((f) => path.basename(f)).sort()).toEqual(
      expect.arrayContaining(["associate.ts", "evidence.ts", "hash.ts", "normalize.ts", "run.ts", "types.ts", "versions.ts"]),
    );
  });

  it.each(files.map((f) => [path.relative(ENGINE, f), f]))("%s no importa three ni @/model/ ni usa el DOM", (_name, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/from\s+["'](three|@react-three)[^"']*["']/);
    expect(src).not.toMatch(/from\s+["']@\/model\//); // el adapter es la única capa con three
    expect(src).not.toMatch(/\b(DOMParser|XMLSerializer|document|window)\b/);
  });

  // T8-E1: la pasada 1 no arma ids; listadoId y engineRunId son de T10.
  it("associate.ts no importa node:crypto ni ./hash", () => {
    const src = readFileSync(path.join(ENGINE, "associate.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'](node:)?crypto["']/);
    expect(src).not.toMatch(/from\s+["'](\.\/hash|@\/engine\/hash)["']/);
    expect(src).not.toMatch(/\b(createHash|require)\b/);
  });
});

describe("versiones", () => {
  it("motor/1, marco/1 y vocabulario/0 (T10-E5)", () => {
    expect(ENGINE_VERSION).toBe("motor/1");
    expect(VOCABULARY_VERSION).toBe("vocabulario/0");
    expect(FRAME_VERSION).toBe("marco/1");
  });
});
