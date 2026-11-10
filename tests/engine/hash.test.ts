// Congelar entradas: modelId y listadoId (docs/plan-motor-asociacion.md T1; spec-motor §3 y §5.1, enmendada por
// docs/spec-adapter-observation-listadoid.md §2). Pruebas H1 a H10.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalListado,
  hashFileName,
  ListadoInvalidoError,
  listadoId,
  modelId,
} from "@/engine/hash";
import type { ListadoRow } from "@/engine/types";

const ROOT = path.resolve(__dirname, "..", "..");
const sha = (text: string) => "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");

const row = (overrides: Partial<ListadoRow> = {}): ListadoRow => ({
  code: "9999-01-M01-C04",
  name: "Lateral",
  lengthMm: 700,
  widthMm: 500,
  thicknessMm: 18,
  material: "Melamina",
  quantity: 2,
  edgeBanding: ["largo-A"],
  notes: null,
  ...overrides,
});

describe("H0: .gitattributes", () => {
  it("declara *.dae binary", () => {
    expect(readFileSync(path.join(ROOT, ".gitattributes"), "utf8")).toMatch(/^\*\.dae\s+binary\s*$/m);
  });
});

describe("modelId (Q4: \\r\\n -> \\n antes de hashear)", () => {
  it("CRLF y LF dan el mismo hash, y es el sha256 de la versión LF", () => {
    const lf = new TextEncoder().encode("<a>\n<b/>\n</a>\n");
    const crlf = new TextEncoder().encode("<a>\r\n<b/>\r\n</a>\r\n");
    expect(modelId(crlf)).toBe(modelId(lf));
    expect(modelId(lf)).toBe(sha("<a>\n<b/>\n</a>\n"));
  });

  it("un \\r suelto no se toca", () => {
    const loneCr = new TextEncoder().encode("a\rb");
    expect(modelId(loneCr)).toBe(sha("a\rb"));
  });

  it("el de olmo.dae no depende de cómo git dejó el archivo en disco", () => {
    const bytes = readFileSync(path.join(ROOT, "public", "models", "Olmo", "olmo.dae"));
    const lfOnly = Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
    expect(modelId(bytes)).toBe(modelId(lfOnly));
    expect(modelId(bytes)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("hashFileName", () => {
  it("devuelve el hex sin el prefijo sha256:", () => {
    expect(hashFileName(`sha256:${"ab".repeat(32)}`)).toBe("ab".repeat(32));
  });
});

describe("H1-H6: canonicalListado y listadoId (§5.1)", () => {
  const rows: ListadoRow[] = [
    { code: "9999-01-M01-C05", name: "Cajón", lengthMm: 400, widthMm: 100.5, thicknessMm: 18, material: "M", quantity: 2, edgeBanding: ["largo-B", "corto-A"], notes: null },
    { code: "9999-01-M01-C04", name: "X", lengthMm: 1, widthMm: 2, thicknessMm: 3, material: "M", quantity: 1, edgeBanding: null, notes: null },
  ];
  const EXPECTED =
    '[{"code":"9999-01-M01-C04","name":"X","lengthMm":1,"widthMm":2,"thicknessMm":3,"material":"M","quantity":1,"edgeBanding":null,"notes":null},' +
    '{"code":"9999-01-M01-C05","name":"Cajón","lengthMm":400,"widthMm":100.5,"thicknessMm":18,"material":"M","quantity":2,"edgeBanding":["corto-A","largo-B"],"notes":null}]';

  it("H1-H3: orden por code, claves fijas, null explícito y edgeBanding ordenado", () => {
    expect(canonicalListado(rows)).toBe(EXPECTED);
  });

  it("H1: el orden de entrada no cambia el resultado", () => {
    expect(canonicalListado([...rows].reverse())).toBe(EXPECTED);
  });

  it("H4: las cadenas pasan a NFC", () => {
    const nfd = rows.map((r) => ({ ...r, name: r.name.normalize("NFD") }));
    expect(nfd[0].name).not.toBe(rows[0].name);
    expect(canonicalListado(nfd)).toBe(EXPECTED);
  });

  it("H5: qrId y moduleId quedan fuera; un campo ausente va como null", () => {
    const withExtras = rows.map((r) => ({ ...r, qrId: "olmo-c04", moduleId: "mod-x" }));
    expect(canonicalListado(withExtras)).toBe(EXPECTED);
    const { notes: _notes, ...sinNotes } = rows[1];
    void _notes;
    expect(canonicalListado([rows[0], sinNotes as ListadoRow])).toBe(EXPECTED);
  });

  it("H6: listadoId = sha256 de la cadena canónica (literal calculado aparte)", () => {
    // Calculado una vez con: node -e "console.log(require('crypto').createHash('sha256').update(<EXPECTED>).digest('hex'))"
    expect(listadoId(rows)).toBe("sha256:5ce059a02ed8a016a67ddad4195c30c438b8964e6275fee906a62ce243f4a4f2");
  });
});

describe("H7: \"sin-definir\", null y [] son distintos", () => {
  it("tres hashes distintos; \"sin-definir\" se serializa como cadena", () => {
    const ids = [row({ edgeBanding: "sin-definir" }), row({ edgeBanding: null }), row({ edgeBanding: [] })].map((r) => listadoId([r]));
    expect(new Set(ids).size).toBe(3);
    expect(canonicalListado([row({ edgeBanding: "sin-definir" })])).toContain('"edgeBanding":"sin-definir"');
    expect(canonicalListado([row({ edgeBanding: [] })])).toContain('"edgeBanding":[]');
  });
});

describe("H8: ListedPiece con rows", () => {
  it("da el mismo hash que la fila sin rows", () => {
    const listed = { ...row(), rows: [{ document: 0, board: 0, piece: 0 }] };
    expect(listadoId([listed])).toBe(listadoId([row()]));
  });
});

describe("H9: aserciones (ListadoInvalidoError)", () => {
  const cases: [string, ListadoRow[], string, ListadoInvalidoError["motivo"]][] = [
    ["código con _ inicial", [row({ code: "_9999-01-M01-C04" })], "_9999-01-M01-C04", "codigo-formato"],
    ["código fuera de formato", [row({ code: "C04" })], "C04", "codigo-formato"],
    ["código vacío", [row({ code: "" })], "", "codigo-formato"],
    ["código repetido", [row(), row({ name: "Otro" })], "9999-01-M01-C04", "codigo-repetido"],
    ["largo NaN", [row({ lengthMm: Number.NaN })], "9999-01-M01-C04", "numero-no-finito"],
    ["espesor infinito", [row({ thicknessMm: Number.POSITIVE_INFINITY })], "9999-01-M01-C04", "numero-no-finito"],
    ["cantidad infinita", [row({ quantity: Number.POSITIVE_INFINITY })], "9999-01-M01-C04", "numero-no-finito"],
    ["ancho cero", [row({ widthMm: 0 })], "9999-01-M01-C04", "medida-no-positiva"],
    ["ancho -0", [row({ widthMm: -0 })], "9999-01-M01-C04", "medida-no-positiva"],
    ["espesor negativo", [row({ thicknessMm: -18 })], "9999-01-M01-C04", "medida-no-positiva"],
    ["cantidad fraccionaria", [row({ quantity: 1.5 })], "9999-01-M01-C04", "cantidad-no-entera"],
    ["cantidad cero", [row({ quantity: 0 })], "9999-01-M01-C04", "cantidad-no-positiva"],
    ["cantidad negativa", [row({ quantity: -2 })], "9999-01-M01-C04", "cantidad-no-positiva"],
    ["cantidad fraccionaria y negativa", [row({ quantity: -1.5 })], "9999-01-M01-C04", "cantidad-no-entera"],
    ["canto repetido", [row({ edgeBanding: ["largo-A", "largo-A"] })], "9999-01-M01-C04", "canto-repetido"],
    ["canto desconocido", [row({ edgeBanding: ["arriba" as never] })], "9999-01-M01-C04", "canto-desconocido"],
  ];

  it.each(cases)("%s", (_caso, rows, code, motivo) => {
    let error: unknown;
    try {
      listadoId(rows);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ListadoInvalidoError);
    expect(error).toMatchObject({ code, motivo });
  });

  it("-0 se rechaza como medida-no-positiva", () => {
    expect(() => canonicalListado([row({ lengthMm: -0 })])).toThrow(ListadoInvalidoError);
  });
});

describe("H10: dónde corre hash.ts", () => {
  const filesUnder = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => path.join(ROOT, dir, f));
  // T10-E1: run.ts importa hash.ts y tiene la misma regla. T11-E1: src/lib/modelSources.ts usa node:fs y también.
  const IMPORTS_HASH = /from\s+["'](@\/engine\/(hash|run)|@\/lib\/modelSources|[./]+(engine\/)?(hash|run)|[./]+(lib\/)?modelSources)["']/;

  it("el regex de H10 reconoce modelSources (por alias y relativo)", () => {
    expect('import { x } from "@/lib/modelSources";').toMatch(IMPORTS_HASH);
    expect('import { x } from "../lib/modelSources";').toMatch(IMPORTS_HASH);
    expect('import { x } from "./modelSources";').toMatch(IMPORTS_HASH);
  });

  it("ningún archivo de src/pdf/ importa @/engine/hash, @/engine/run ni @/lib/modelSources", () => {
    for (const file of filesUnder("src/pdf")) expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_HASH);
  });

  it("ningún archivo con \"use client\" importa @/engine/hash, @/engine/run ni @/lib/modelSources", () => {
    const clients = filesUnder("src").filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(clients.length).toBeGreaterThan(0);
    for (const file of clients) expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_HASH);
  });
});
