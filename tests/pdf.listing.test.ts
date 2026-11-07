// Conversión al listado (docs/spec-sesion-2b-listado-cruce.md §2.2, §3 y §5). Casos derivados del fixture del
// Olmo y del fixture sintético (esperado/) cambiando un solo campo.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { olmoDef } from "@/data/furniture.mock";
import { ListingInputError, toListing, type ListedPiece, type Listing } from "@/pdf/listing";
import type { CutListPdf } from "@/pdf/types";
import { validateFurniture, type FurnitureValidation } from "@/pdf/validate";
import { olmoDocuments } from "./helpers/pdfFixtures";

const SINTETICO = path.resolve(__dirname, "fixtures", "pdf-sintetico", "esperado");
const sintetico = (id: string) => JSON.parse(readFileSync(path.join(SINTETICO, `${id}.json`), "utf8")) as CutListPdf;
const sinteticoMueble = () => ["S1", "S2", "S3"].map(sintetico);

function piecesOf(listing: Listing): ListedPiece[] {
  if (listing.status === "bloqueado") throw new Error(`bloqueado: ${listing.reason}`);
  return listing.pieces;
}
const list = (documents: readonly unknown[]) => toListing("mueble", validateFurniture(documents));

describe("TP-10: L < A se conserva", () => {
  it("una fila 100 x 1200 da lengthMm = 100 y widthMm = 1200, sin reordenar", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    row.finalL = 100;
    row.finalA = 1200;
    const listing = list(documents);
    expect(listing.status).toBe("publicable");
    const piece = piecesOf(listing).find((p) => p.code === row.code);
    expect(piece).toMatchObject({ lengthMm: 100, widthMm: 1200 });
  });
});

describe("TP-60: conversión del primer fixture", () => {
  const listing = list(olmoDocuments());
  const pieces = piecesOf(listing);

  it("21 piezas, publicable, con los códigos, medidas y cantidades del mock", () => {
    expect(listing.status).toBe("publicable");
    expect(pieces).toHaveLength(21);
    const mock = [...olmoDef.pieceTypes].sort((a, b) => (a.code < b.code ? -1 : 1));
    expect(pieces.map((p) => p.code)).toEqual(mock.map((p) => p.code));
    for (const [i, piece] of pieces.entries()) {
      const { code, lengthMm, widthMm, thicknessMm, quantity } = mock[i];
      expect({ code: piece.code, lengthMm: piece.lengthMm, widthMm: piece.widthMm, thicknessMm: piece.thicknessMm, quantity: piece.quantity }).toEqual({
        code,
        lengthMm,
        widthMm,
        thicknessMm,
        quantity,
      });
    }
    expect(pieces.reduce((sum, p) => sum + p.quantity, 0)).toBe(33);
  });

  it('edgeBanding es "sin-definir" en todas: nunca los lados del mock, ni [] ni null', () => {
    for (const piece of pieces) expect(piece.edgeBanding, piece.code).toBe("sin-definir");
  });

  it("material del encabezado tal cual, nombre de la fila y notes null", () => {
    const materials = new Set(olmoDocuments().map((d) => d.header.material));
    for (const piece of pieces) {
      expect(materials.has(piece.material), piece.material).toBe(true);
      expect(piece.name.length).toBeGreaterThan(0);
      expect(piece.notes).toBeNull();
      expect(piece.rows.length).toBeGreaterThan(0);
    }
  });
});

describe("TP-62 y TP-62b: bloqueo", () => {
  it("TP-62: con un documento rechazado no hay piezas", () => {
    const documents: unknown[] = olmoDocuments();
    documents[1] = { ...(documents[1] as CutListPdf), schema: "otra-cosa" };
    const listing = list(documents);
    expect(listing).toEqual({ status: "bloqueado", furnitureId: "mueble", reason: "esquema-invalido" });
    expect("pieces" in listing).toBe(false);
  });

  it("TP-62b: la razón es la de rechazo del documento (hoja-incompleta)", () => {
    const documents = olmoDocuments();
    documents[0].boards[0].pages = [1];
    expect(list(documents)).toEqual({ status: "bloqueado", furnitureId: "mueble", reason: "hoja-incompleta" });
  });

  it("TP-62b: la primera razón de rechazo en el orden de los documentos (unidad-no-soportada antes que hoja-incompleta)", () => {
    const documents: unknown[] = olmoDocuments();
    const second = documents[1] as CutListPdf;
    documents[1] = { ...second, header: { ...second.header, unit: "cm" } };
    (documents[2] as CutListPdf).boards[0].pages = [1];
    expect(list(documents)).toMatchObject({ status: "bloqueado", reason: "unidad-no-soportada" });
  });

  it("TP-62b: sin documentos, esquema-invalido", () => {
    expect(list([])).toEqual({ status: "bloqueado", furnitureId: "mueble", reason: "esquema-invalido" });
  });
});

describe("TP-63: borrador", () => {
  it("una fila dudosa (nombre anómalo) deja el listado en borrador, con la pieza y su código normalizado", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    const code = row.code as string;
    row.code = `${code}__`;
    const listing = list(documents);
    expect(listing.status).toBe("borrador");
    expect(piecesOf(listing).map((p) => p.code)).toContain(code);
    expect(piecesOf(listing)).toHaveLength(21);
  });
});

describe("datos que no se pueden tomar sin elegir: el código queda fuera y el listado es borrador", () => {
  it("total ilegible (cantidad pendiente)", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    row.quantity = null;
    documents[0].pending.push({ path: "boards[0].pieces[0].quantity", reason: "ilegible" });
    const listing = list(documents);
    expect(listing.status).toBe("borrador");
    expect(piecesOf(listing).map((p) => p.code)).not.toContain(row.code);
    expect(piecesOf(listing)).toHaveLength(20);
  });

  it("L ilegible", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    row.finalL = null;
    documents[0].pending.push({ path: "boards[0].pieces[0].finalL", reason: "ilegible" });
    const listing = list(documents);
    expect(listing.status).toBe("borrador");
    expect(piecesOf(listing).map((p) => p.code)).not.toContain(row.code);
  });

  it.each([
    ["medidas distintas", (p: CutListPdf["boards"][number]["pieces"][number]) => ({ ...p, finalA: (p.finalA ?? 0) + 1 })],
    ["nombre distinto", (p: CutListPdf["boards"][number]["pieces"][number]) => ({ ...p, name: `${p.name} bis` })],
  ])("mismo código en dos PDF con %s (INV-10 / INV-11)", (_, change) => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    const fondo = documents[2].boards[0];
    fondo.pieces.push({ ...change(row), letter: "Z", quantity: 1 });
    fondo.pieceCount += 1;
    if (fondo.diagram !== "pendiente") fondo.diagram.push({ letter: "Z", count: 1 });
    documents[2].summary.boards[0].parts += 1;
    const listing = list(documents);
    expect(listing.status).toBe("borrador");
    expect(piecesOf(listing).map((p) => p.code)).not.toContain(row.code);
  });
});

describe("2b-S1: fixture sintético como un mueble", () => {
  const documents = sinteticoMueble();
  const furniture = validateFurniture(documents);
  const listing = toListing("sintetico", furniture);
  const pieces = piecesOf(listing);

  it("una pieza por código, en el orden de totals, publicable", () => {
    expect(listing.status).toBe("publicable");
    expect(pieces.map((p) => p.code)).toEqual(furniture.totals.map((t) => t.code));
  });

  it("F de S2 suma 2 + 4 = 6 en una sola pieza, con sus dos filas", () => {
    const s2 = documents[1];
    const rowsF = s2.boards.flatMap((board, b) => board.pieces.flatMap((piece, p) => (piece.letter === "F" ? [{ board: b, piece: p, data: piece }] : [])));
    expect(rowsF.map((r) => r.data.quantity)).toEqual([2, 4]);
    const code = rowsF[0].data.code;
    const piece = pieces.filter((p) => p.code === code);
    expect(piece).toHaveLength(1);
    expect(piece[0].quantity).toBe(6);
    expect(piece[0].rows).toEqual(rowsF.map(({ board, piece: p }) => ({ document: 1, board, piece: p })));
  });

  it('S3 (sin columna de cantos) da "sin-definir"; S1 y S2 dan los lados de las subcolumnas', () => {
    const codesOf = (doc: CutListPdf) => new Set(doc.boards.flatMap((b) => b.pieces.map((p) => p.code)));
    const s3 = codesOf(documents[2]);
    for (const piece of pieces) {
      if (s3.has(piece.code)) expect(piece.edgeBanding, piece.code).toBe("sin-definir");
      else expect(Array.isArray(piece.edgeBanding), piece.code).toBe(true);
    }
    // S2, fila A: s1, s2 y s4 marcadas -> largo-B, largo-A, corto-B (orden de la serialización).
    const a = documents[1].boards[0].pieces[0];
    expect(pieces.find((p) => p.code === a.code)?.edgeBanding).toEqual(["corto-B", "largo-A", "largo-B"]);
  });
});

describe("2b-L1: sin módulo ni qrId", () => {
  it.each([
    ["primer fixture", olmoDocuments()],
    ["sintético", sinteticoMueble()],
  ])("%s: ninguna pieza tiene moduleId ni qrId", (_, documents) => {
    for (const piece of piecesOf(list(documents))) {
      expect(Object.keys(piece)).not.toContain("moduleId");
      expect(Object.keys(piece)).not.toContain("qrId");
      expect(piece.edgeBanding).not.toBeNull();
    }
  });
});

describe("pureza y entradas inconsistentes", () => {
  it("no modifica la validación y da el mismo resultado dos veces", () => {
    const furniture = validateFurniture(olmoDocuments());
    const frozen = structuredClone(furniture);
    deepFreeze(furniture);
    expect(toListing("olmo", furniture)).toEqual(toListing("olmo", furniture));
    expect(furniture).toEqual(frozen);
  });

  it("ListingInputError si un rechazo no trae razón de rechazo o un total no tiene filas", () => {
    const blocked: FurnitureValidation = { documents: [{ status: "rechazado", findings: [] }], findings: [], totals: [], status: "bloqueado" };
    expect(() => toListing("x", blocked)).toThrow(ListingInputError);
    const orphanTotal: FurnitureValidation = { documents: [], findings: [], totals: [{ code: "0001-01-M01-C01", total: 1 }], status: "publicable" };
    expect(() => toListing("x", orphanTotal)).toThrow(ListingInputError);
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
