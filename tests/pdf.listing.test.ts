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

type Row = CutListPdf["boards"][number]["pieces"][number];
type Borrador = Extract<Listing, { status: "borrador" }>;

function borrador(listing: Listing): Borrador {
  if (listing.status !== "borrador") throw new Error(`se esperaba borrador y es ${listing.status}`);
  return listing;
}

/** Agrega `row` como fila nueva (letra Z) en la hoja 0 del documento `target`, ajustando pie, diagrama y resumen. */
function addRow(documents: CutListPdf[], target: number, row: Row): void {
  const board = documents[target].boards[0];
  board.pieces.push({ ...row, letter: "Z", quantity: 1 });
  board.pieceCount += 1;
  if (board.diagram !== "pendiente") board.diagram.push({ letter: "Z", count: 1 });
  documents[target].summary.boards[0].parts += 1;
}

const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

describe("I1 / I11: datos que no se pueden tomar sin elegir -> excluded, con sus razones y filas", () => {
  it("total ilegible (cantidad pendiente): campo-pendiente", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    row.quantity = null;
    documents[0].pending.push({ path: "boards[0].pieces[0].quantity", reason: "ilegible" });
    const listing = borrador(list(documents));
    expect(listing.pieces.map((p) => p.code)).not.toContain(row.code);
    expect(listing.pieces).toHaveLength(20);
    expect(listing.excluded).toEqual([{ code: row.code, reasons: ["campo-pendiente"], rows: [{ document: 0, board: 0, piece: 0 }] }]);
    expect(listing.unkeyedRows).toEqual([]);
  });

  it("L y total ilegibles en el mismo código: campo-pendiente una sola vez", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    row.finalL = null;
    row.quantity = null;
    documents[0].pending.push({ path: "boards[0].pieces[0].finalL", reason: "ilegible" }, { path: "boards[0].pieces[0].quantity", reason: "ilegible" });
    expect(borrador(list(documents)).excluded).toEqual([{ code: row.code, reasons: ["campo-pendiente"], rows: [{ document: 0, board: 0, piece: 0 }] }]);
  });

  it("mismo código en otro PDF (3 mm) con otra A: material y medidas, en el orden del catálogo", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    addRow(documents, 2, { ...row, finalA: (row.finalA ?? 0) + 1 });
    const listing = borrador(list(documents));
    expect(listing.pieces.map((p) => p.code)).not.toContain(row.code);
    const zRow = { document: 2, board: 0, piece: documents[2].boards[0].pieces.length - 1 };
    expect(listing.excluded).toEqual([
      { code: row.code, reasons: ["codigo-con-distinto-material", "codigo-con-distintas-medidas"], rows: [{ document: 0, board: 0, piece: 0 }, zRow] },
    ]);
  });

  it("mismo código en la misma hoja con otro nombre: solo codigo-con-distinto-nombre", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    addRow(documents, 0, { ...row, name: `${row.name} bis` });
    expect(borrador(list(documents)).excluded).toMatchObject([{ code: row.code, reasons: ["codigo-con-distinto-nombre"] }]);
  });

  it("mismo código en la misma hoja, una fila con subcolumnas y otra sin columna: codigo-con-distinto-canteado", () => {
    const documents = olmoDocuments();
    const row = documents[0].boards[0].pieces[0];
    addRow(documents, 0, { ...row, edges: { s1: null, s2: null, s3: null, s4: null } });
    expect(borrador(list(documents)).excluded).toMatchObject([{ code: row.code, reasons: ["codigo-con-distinto-canteado"] }]);
  });

  it("excluded va en orden binario por código, y ningún código está a la vez en pieces y en excluded", () => {
    const documents = olmoDocuments();
    // Se excluyen las filas 0 y 2, puestas en el pending en orden inverso al de sus códigos.
    for (const p of [2, 0]) {
      documents[0].boards[0].pieces[p].quantity = null;
      documents[0].pending.push({ path: `boards[0].pieces[${p}].quantity`, reason: "ilegible" });
    }
    const listing = borrador(list(documents));
    const codes = listing.excluded.map((e) => e.code);
    expect(codes).toHaveLength(2);
    expect(codes).toEqual([...codes].sort(binary));
    const listed = new Set(listing.pieces.map((p) => p.code));
    expect(codes.some((code) => listed.has(code))).toBe(false);
    expect(listing.pieces.length + listing.excluded.length).toBe(21);
  });
});

describe("I11: filas sin código válido -> unkeyedRows, con las razones de su fila", () => {
  it("código ilegible: campo-pendiente y codigo-ausente, en el orden del catálogo", () => {
    const documents = olmoDocuments();
    documents[1].boards[0].pieces[2].code = null;
    documents[1].pending.push({ path: "boards[0].pieces[2].code", reason: "ilegible" });
    const listing = borrador(list(documents));
    expect(listing.unkeyedRows).toEqual([{ row: { document: 1, board: 0, piece: 2 }, reasons: ["campo-pendiente", "codigo-ausente"] }]);
    expect(listing.excluded).toEqual([]);
  });

  it("formato inválido: formato-invalido; varias filas en el orden de documento, hoja y fila", () => {
    const documents = olmoDocuments();
    documents[2].boards[0].pieces[0].code = "PATA-01";
    documents[0].boards[0].pieces[1].code = "OTRA";
    const listing = borrador(list(documents));
    expect(listing.unkeyedRows.map((u) => u.row)).toEqual([
      { document: 0, board: 0, piece: 1 },
      { document: 2, board: 0, piece: 0 },
    ]);
    for (const unkeyed of listing.unkeyedRows) expect(unkeyed.reasons).toContain("formato-invalido");
  });
});

describe("I11: publicable no deja nada fuera (por tipo)", () => {
  it("el primer fixture es publicable con excluded y unkeyedRows vacíos", () => {
    const listing = list(olmoDocuments());
    if (listing.status !== "publicable") throw new Error(listing.status);
    expect(listing.excluded).toEqual([]);
    expect(listing.unkeyedRows).toEqual([]);
  });

  it("un publicable con excluded o unkeyedRows no compila", () => {
    const excluded = { code: "9999-01-M01-C04", reasons: ["campo-pendiente" as const], rows: [] };
    const unkeyed = { row: { document: 0, board: 0, piece: 0 }, reasons: ["codigo-ausente" as const] };
    // @ts-expect-error publicable no puede dejar códigos fuera
    const withExcluded: Listing = { status: "publicable", furnitureId: "a", pieces: [], excluded: [excluded], unkeyedRows: [] };
    // @ts-expect-error publicable no puede tener filas sin código
    const withUnkeyed: Listing = { status: "publicable", furnitureId: "a", pieces: [], excluded: [], unkeyedRows: [unkeyed] };
    const fine: Listing = { status: "borrador", furnitureId: "a", pieces: [], excluded: [excluded], unkeyedRows: [unkeyed] };
    expect([withExcluded, withUnkeyed, fine]).toHaveLength(3);
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
