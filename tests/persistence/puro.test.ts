// S2: pruebas de lo que no necesita repositorios. PB-13 (imports), PB-14 (guarda de base local), PB-15 (newQrId)
// y los mapeadores con datos mal formados (DocumentoInvalidoError).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "@/persistence/localGuard";
import { decodeEdgeBanding, encodeEdgeBanding, parseRunDocument, parseStatus } from "@/persistence/mappers";
import { BaseNoLocalError, DocumentoInvalidoError } from "@/persistence/ports";
import { newQrId, QR_ID_ALPHABET, QR_ID_FORMAT, QR_ID_LENGTH } from "@/persistence/qrId";

const SRC = path.resolve(__dirname, "..", "..", "src");

function sources(dir: string): { name: string; src: string }[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ name: path.relative(SRC, path.join(dir, f)).replaceAll("\\", "/"), src: readFileSync(path.join(dir, f), "utf8") }));
}

/** Especificadores de todos los import / export ... from / import() / require() de un archivo. */
function specifiers(src: string): string[] {
  const found = [...src.matchAll(/(?:from|import|require\()\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
  return found;
}

describe("PB-13 (B9, S2-D2): imports", () => {
  const all = sources(SRC);

  it("hay archivos que revisar", () => {
    const names = all.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining(["persistence/ports.ts", "persistence/mappers.ts", "persistence/rows.ts", "persistence/memory/index.ts", "lib/lookup.ts"]),
    );
  });

  it("src/engine, src/pdf, src/app, src/components y src/lib no importan src/persistence", () => {
    const prohibidos = all
      .filter((f) => /^(engine|pdf|app|components|lib)\//.test(f.name))
      .filter((f) => specifiers(f.src).some((s) => /(^@\/|\/)persistence(\/|$)/.test(s)))
      .map((f) => f.name);
    expect(prohibidos).toEqual([]);
  });

  it("solo src/persistence/sql importa kysely y pg; nada de src/persistence fuera de sql/ importa next", () => {
    const esBase = (s: string) => /^(kysely|pg|tedious|tarn)(\/|$)/.test(s);
    const conBase = all.filter((f) => !f.name.startsWith("persistence/sql/") && specifiers(f.src).some(esBase)).map((f) => f.name);
    expect(conBase).toEqual([]);
    const conNext = all
      .filter((f) => f.name.startsWith("persistence/") && !f.name.startsWith("persistence/sql/"))
      .filter((f) => specifiers(f.src).some((s) => /^next(\/|$)/.test(s)))
      .map((f) => f.name);
    expect(conNext).toEqual([]);
  });

  it("el detector reconoce las formas de import", () => {
    const src = `import a from "kysely";\nexport { b } from '@/persistence/ports';\nconst c = await import("pg");\nimport "next/server";\nimport type { D } from "../persistence/rows";`;
    expect(specifiers(src)).toEqual(["kysely", "@/persistence/ports", "pg", "next/server", "../persistence/rows"]);
  });
});

describe("PB-14 (B10): assertLocalDatabase", () => {
  it.each(["postgres://u:c@localhost:5432/pfg", "postgres://u:c@127.0.0.1:5432/pfg", "postgresql://localhost/pfg"])("pasa con %s", (url) => {
    expect(() => assertLocalDatabase(url)).not.toThrow();
  });

  it.each([
    ["postgres://u:c@db.casamueble.com.ar:5432/pfg", "db.casamueble.com.ar"],
    ["postgres://u:c@200.45.10.7:5432/pfg", "200.45.10.7"],
    ["postgres://u:c@localhost.ejemplo.com/pfg", "localhost.ejemplo.com"],
    ["postgres://u:c@127.0.0.1.ejemplo.com/pfg", "127.0.0.1.ejemplo.com"],
    ["postgres://u:c@0.0.0.0/pfg", "0.0.0.0"],
    ["no es una url", "(URL ilegible)"],
    ["", "(URL ilegible)"],
  ])("BaseNoLocalError con %s", (url, host) => {
    let error: unknown;
    try {
      assertLocalDatabase(url);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BaseNoLocalError);
    expect((error as BaseNoLocalError).host).toBe(host);
  });

  it("el mensaje no lleva usuario ni clave", () => {
    expect(() => assertLocalDatabase("postgres://usuario:secreto@db.ejemplo.com/pfg")).toThrow(/^(?!.*(usuario|secreto)).*$/);
  });
});

describe("PB-15 (S2-D8): newQrId", () => {
  it("mil ids: 26 caracteres del alfabeto, sin repetidos", () => {
    const ids = Array.from({ length: 1000 }, newQrId);
    for (const id of ids) {
      expect(id).toMatch(QR_ID_FORMAT);
      expect(id).toHaveLength(QR_ID_LENGTH);
      expect([...id].every((c) => QR_ID_ALPHABET.includes(c))).toBe(true);
    }
    expect(new Set(ids).size).toBe(1000);
  });

  it("alfabeto de 32 símbolos sin i, l, o ni u; el primer carácter lleva solo 3 bits", () => {
    expect(new Set(QR_ID_ALPHABET).size).toBe(32);
    expect(QR_ID_ALPHABET).not.toMatch(/[ilou]/);
    const primeros = new Set(Array.from({ length: 300 }, () => newQrId()[0]));
    expect([...primeros].every((c) => "01234567".includes(c))).toBe(true);
  });
});

describe("mapeadores: datos mal formados", () => {
  it("edgeBanding: null, [] y lados van y vuelven; lo demás es DocumentoInvalidoError", () => {
    expect(decodeEdgeBanding(encodeEdgeBanding(null))).toBeNull();
    expect(decodeEdgeBanding(encodeEdgeBanding([]))).toStrictEqual([]);
    expect(decodeEdgeBanding(encodeEdgeBanding(["largo-B", "corto-A"]))).toStrictEqual(["largo-B", "corto-A"]);
    for (const malo of ["", "{}", '"largo-A"', '["largo-C"]', "[1]", "null", "[" ]) {
      expect(() => decodeEdgeBanding(malo), malo).toThrow(DocumentoInvalidoError);
    }
  });

  it("estado de versión desconocido", () => {
    expect(parseStatus("publicada")).toBe("publicada");
    expect(() => parseStatus("Publicada")).toThrow(DocumentoInvalidoError);
  });

  it("documento de una corrida: JSON ilegible, otra forma u otra corrida", () => {
    const doc = { engineRunId: "sha256:a", modelId: "m", listadoId: "l", passes: 1, results: [], typeSummary: [], inconsistencies: [] };
    expect(parseRunDocument({ engine_run_id: "sha256:a", document: JSON.stringify(doc) })).toEqual(doc);
    const malos = ["{", "null", "[]", JSON.stringify({ ...doc, passes: 3 }), JSON.stringify({ ...doc, results: {} })];
    for (const document of malos) expect(() => parseRunDocument({ engine_run_id: "sha256:a", document }), document).toThrow(DocumentoInvalidoError);
    expect(() => parseRunDocument({ engine_run_id: "sha256:b", document: JSON.stringify(doc) })).toThrow(DocumentoInvalidoError);
  });
});
