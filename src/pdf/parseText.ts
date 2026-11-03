// Parser de TextoPdf: de elementos de texto con posición a CutListPdf (docs/spec-esquema-pdf.md §8.2).
// Función pura y determinista, sin IA ni librerías de PDF. No valida ni decide (§8.1): lo que no lee con certeza
// va a `pending`, y solo devuelve un error si no puede armar el documento.
//
// La geometría se midió en los trazados de los PDF de Sabrina; los textos son un SUPUESTO hasta tener un PDF de
// OpenCutList con capa de texto (consulta 58).

import { looksLikeCode } from "./code";
import type {
  Board,
  BoardPiece,
  CutListPdf,
  DiagramLetter,
  EdgeStrip,
  EdgeStrips,
  PdfReading,
  PdfReadingFailure,
  PdfTextElement,
  PdfTextInput,
  PendingField,
  SummaryBoardRow,
} from "./types";

/** Paso de respaldo de las subcolumnas de canto, como fracción del ancho de página (§8.2). */
const EDGE_PITCH_RATIO = 0.066;
/** Una distancia entre marcas mayor que esto (en pasos de respaldo) saltea al menos una subcolumna. */
const EDGE_PITCH_CAP = 1.5;
const EDGE_KEYS = ["s1", "s2", "s3", "s4"] as const;

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const MATERIAL = new RegExp(String.raw`^(.+?)\s*/\s*(${NUMBER})\s*mm$`);
const SHEET = /^(\d+)\s*\/\s*(\d+)$/;
const BOARD_SIZE = new RegExp(String.raw`^(${NUMBER})\s*mm\s*[x×]\s*(${NUMBER})\s*mm$`);
const PIECE_COUNT = /^(\d+)\s*piezas?$/i;
const FOOTER_LINE = /^(\d+\s*piezas?$|Longitud de cortes|Eficiencia|La fibra sigue)/i;
const DATE = /^\d{2}\/\d{2}\/\d{4}\s+\d/;
const MILLIMETER = /^mil[ií]metros?$/i;
const OTHER_UNIT = /^(cent[ií]metros?|metros?|pulgadas?|pies?|inch(es)?|feet)$/i;
const LETTER = /^[A-Z]{1,3}$/;
const DIAGRAM_LETTER = /^[A-Z]$/;
const EDGE_LABEL = new RegExp(String.raw`^Canto\s+(.+?)\s*(~\s*${NUMBER}\s*mm)\s*[x×]\s*(${NUMBER})\s*mm$`, "i");
const PRIVATE_USE = /[-]/gu;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Error interno: corta la lectura y se convierte en `{ ok: false }`. Nunca sale del módulo. */
class ReadFailure extends Error {
  constructor(
    readonly reason: PdfReadingFailure,
    detail: string,
  ) {
    super(detail);
  }
}

// --- Geometría ---

interface Segment {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Line {
  y0: number;
  y1: number;
  elements: PdfTextElement[];
  segments: Segment[];
}

const centerX = (box: { x: number; width: number }) => box.x + box.width / 2;
const centerY = (box: { y: number; height: number }) => box.y + box.height / 2;
const segmentCenter = (segment: Segment) => (segment.x0 + segment.x1) / 2;
const order = (a: number, b: number) => a - b;

/** Agrupa en renglones: cajas que se solapan verticalmente al menos la mitad de la más baja. */
function toLines(elements: readonly PdfTextElement[]): Line[] {
  const sorted = [...elements].sort((a, b) => centerY(a) - centerY(b) || a.x - b.x || compareText(a.text, b.text));
  const lines: Line[] = [];
  for (const element of sorted) {
    const line = lines[lines.length - 1];
    const overlaps =
      line && Math.min(line.y1, element.y + element.height) - Math.max(line.y0, element.y) >= Math.min(line.y1 - line.y0, element.height) / 2;
    if (line && overlaps) {
      line.elements.push(element);
      line.y0 = Math.min(line.y0, element.y);
      line.y1 = Math.max(line.y1, element.y + element.height);
    } else lines.push({ y0: element.y, y1: element.y + element.height, elements: [element], segments: [] });
  }
  for (const line of lines) {
    line.elements.sort((a, b) => a.x - b.x || compareText(a.text, b.text));
    line.segments = toSegments(line.elements);
  }
  return lines;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Une elementos contiguos de un renglón: separación ≤ alto del más bajo de los dos (§8.2). */
function toSegments(elements: readonly PdfTextElement[]): Segment[] {
  const segments: Segment[] = [];
  let previous: PdfTextElement | null = null;
  for (const element of elements) {
    const last = segments[segments.length - 1];
    if (last && previous && element.x - last.x1 <= Math.min(previous.height, element.height)) {
      last.text = `${last.text} ${element.text}`;
      last.x1 = Math.max(last.x1, element.x + element.width);
      last.y0 = Math.min(last.y0, element.y);
      last.y1 = Math.max(last.y1, element.y + element.height);
    } else segments.push({ text: element.text, x0: element.x, x1: element.x + element.width, y0: element.y, y1: element.y + element.height });
    previous = element;
  }
  return segments;
}

function findSegment(lines: readonly Line[], test: (text: string) => boolean): { segment: Segment; line: Line } | null {
  for (const line of lines) {
    const segment = line.segments.find((s) => test(s.text));
    if (segment) return { segment, line };
  }
  return null;
}

const numberFrom = (text: string) => Number(text.replace(",", "."));

/** Número de una celda, con su unidad opcional. null si la celda dice otra cosa. */
function readNumber(text: string | null): number | null {
  if (text === null) return null;
  const match = new RegExp(String.raw`^(${NUMBER})\s*(mm|m|m²|m2|%)?$`).exec(text.trim());
  return match ? numberFrom(match[1]) : null;
}

/** Valor de un rótulo: lo que sigue en el mismo segmento o el segmento siguiente del renglón. */
function labeledValue(lines: readonly Line[], label: string): string | null {
  for (const line of lines) {
    const i = line.segments.findIndex((s) => s.text === label || s.text.startsWith(`${label} `) || s.text.startsWith(`${label}:`));
    if (i < 0) continue;
    const rest = line.segments[i].text.slice(label.length).replace(/^[:\s]+/, "");
    return rest !== "" ? rest : (line.segments[i + 1]?.text ?? null);
  }
  return null;
}

// --- Resumen ---

function readSummary(lines: readonly Line[], pending: PendingField[]): Pick<CutListPdf, "header" | "summary"> {
  const unsupported = findSegment(lines, (text) => OTHER_UNIT.test(text));
  if (unsupported) throw new ReadFailure("unidad-no-soportada", `El PDF dice "${unsupported.segment.text}": solo se admite Milimetro.`);
  if (!findSegment(lines, (text) => MILLIMETER.test(text))) throw new ReadFailure("estructura-no-reconocida", "El resumen no dice la unidad.");

  const title = findSegment(lines, (text) => MATERIAL.test(text));
  const titleMatch = title && MATERIAL.exec(title.segment.text);
  const tableHeader = lines.find((line) => ["Cant.", "Longitud", "Anchura"].every((label) => line.segments.some((s) => s.text === label)));
  if (!titleMatch || !tableHeader || title.line.y0 >= tableHeader.y0) {
    throw new ReadFailure("estructura-no-reconocida", "El resumen no tiene el título del material o la tabla de tableros.");
  }

  const statistic = (label: string, path: string): number | null => {
    const value = readNumber(labeledValue(lines, label));
    if (value === null) pending.push({ path, reason: `No se leyó "${label}".` });
    return value;
  };

  const configuration = findSegment(lines, (text) => text === "Configuraciones");
  const statistics = findSegment(lines, (text) => text === "Estadísticas");
  const settings: Record<string, string> = {};
  if (configuration) {
    const end = statistics?.line.y0 ?? tableHeader.y0;
    for (const line of lines) {
      if (line.y0 <= configuration.line.y0 || line.y0 >= end || line.segments.length < 2) continue;
      settings[line.segments[0].text] = line.segments
        .slice(1)
        .map((s) => s.text)
        .join(" ");
    }
  }

  const column = (label: string) => tableHeader.segments.find((s) => s.text === label) ?? null;
  const columns = ["Cant.", "Longitud", "Anchura", "Σ Areas", "Σ Partes"].flatMap((label) => {
    const segment = column(label);
    return segment ? [{ label, center: segmentCenter(segment) }] : [];
  });

  const boards: SummaryBoardRow[] = [];
  for (const line of lines) {
    if (line.y0 <= tableHeader.y0) continue;
    const material = MATERIAL.exec(line.segments[0].text);
    if (!material) break;
    const cells = new Map<string, string>();
    for (const segment of line.segments.slice(1)) {
      const nearest = columns.reduce((best, c) => (Math.abs(c.center - segmentCenter(segment)) < Math.abs(best.center - segmentCenter(segment)) ? c : best));
      cells.set(nearest.label, segment.text);
    }
    const required = (label: string) => {
      const value = readNumber(cells.get(label) ?? null);
      if (value === null) throw new ReadFailure("estructura-no-reconocida", `Falta "${label}" en la tabla de tableros del resumen.`);
      return value;
    };
    const areaM2 = readNumber(cells.get("Σ Areas") ?? null);
    if (areaM2 === null) pending.push({ path: `summary.boards[${boards.length}].areaM2`, reason: 'No se leyó "Σ Areas".' });
    boards.push({
      material: material[1],
      thicknessMm: numberFrom(material[2]),
      count: required("Cant."),
      lengthMm: required("Longitud"),
      widthMm: required("Anchura"),
      areaM2,
      parts: required("Σ Partes"),
    });
  }
  if (boards.length === 0) throw new ReadFailure("estructura-no-reconocida", "La tabla de tableros del resumen está vacía.");

  const generatedAt = findSegment(lines, (text) => DATE.test(text));
  if (!generatedAt) pending.push({ path: "header.generatedAt", reason: "No se leyó la fecha." });
  const project = findSegment(lines, (text) => text.includes(".skp"));
  if (!project) pending.push({ path: "header.project", reason: "No se leyó el título del recuadro." });

  return {
    header: {
      material: titleMatch[1],
      thicknessMm: numberFrom(titleMatch[2]),
      generatedAt: generatedAt?.segment.text ?? "",
      unit: "mm",
      project: project?.segment.text ?? "",
    },
    summary: {
      settings,
      fillRatePct: statistic("Tasa de llenado", "summary.fillRatePct"),
      cutCount: statistic("Número de cortes", "summary.cutCount"),
      cutLengthM: statistic("Longitud de cortes", "summary.cutLengthM"),
      boards,
    },
  };
}

// --- Hojas ---

interface TableLayout {
  no: { center: number; width: number };
  cant: { center: number; width: number };
  finalL: number;
  finalA: number;
  /** Centros de todas las L y A: las de "Ajustadas" también, para no confundirlas con "Finales" (RP1). */
  valueColumns: readonly number[];
  adjusted: boolean;
  /** Centro del rótulo "Tiras de cantos"; null si la columna no está. */
  edgeLabelCenter: number | null;
  bottom: number;
  top: number;
}

interface SheetPage {
  page: number;
  lines: Line[];
  elements: PdfTextElement[];
  index: number;
  total: number;
  material: string;
  thicknessMm: number;
  size: { lengthMm: number; widthMm: number } | null;
  kind: string | null;
  headerBottom: number;
  table: TableLayout | null;
}

function readTableLayout(lines: readonly Line[]): TableLayout | null {
  const finales = findSegment(lines, (text) => text === "Finales");
  if (!finales) return null;
  const below = lines.filter((line) => line.y0 >= finales.line.y0);
  const subheader = below.find((line) => line.segments.some((s) => s.text === "L") && line.segments.some((s) => s.text === "A"));
  if (!subheader) return null;
  const window = below.filter((line) => line.y0 <= subheader.y0);
  const no = findSegment(window, (text) => text === "No.");
  const cant = findSegment(window, (text) => text === "Cant.");
  if (!no || !cant) return null;

  const center = segmentCenter(finales.segment);
  const nearest = (label: string) => {
    const columns = subheader.segments.filter((s) => s.text === label).map(segmentCenter);
    return columns.reduce((best, x) => (Math.abs(x - center) < Math.abs(best - center) ? x : best));
  };
  const edgeLabel = findSegment(window, (text) => text === "Tiras de cantos");
  return {
    no: { center: segmentCenter(no.segment), width: no.segment.x1 - no.segment.x0 },
    cant: { center: segmentCenter(cant.segment), width: cant.segment.x1 - cant.segment.x0 },
    finalL: nearest("L"),
    finalA: nearest("A"),
    valueColumns: subheader.segments.filter((s) => s.text === "L" || s.text === "A").map(segmentCenter),
    adjusted: findSegment(window, (text) => text === "Ajustadas") !== null,
    edgeLabelCenter: edgeLabel ? segmentCenter(edgeLabel.segment) : null,
    top: finales.line.y0,
    bottom: subheader.y1,
  };
}

function readSheetPage(page: number, elements: PdfTextElement[]): SheetPage {
  const lines = toLines(elements);
  const sheet = findSegment(lines, (text) => SHEET.test(text));
  const sheetMatch = sheet && SHEET.exec(sheet.segment.text);
  if (!sheetMatch) throw new ReadFailure("hoja-incompleta", `La página ${page} no tiene el encabezado "i / N".`);
  const material = findSegment(lines, (text) => MATERIAL.test(text));
  const materialMatch = material && MATERIAL.exec(material.segment.text);
  if (!materialMatch) throw new ReadFailure("hoja-incompleta", `La página ${page} no repite el material y el espesor de la hoja.`);
  const size = findSegment(lines, (text) => BOARD_SIZE.test(text));
  const sizeMatch = size && BOARD_SIZE.exec(size.segment.text);
  const kind = findSegment(lines, (text) => /^Tablero\b/.test(text));
  const headerLines = [sheet.line, material.line, size?.line, kind?.line].flatMap((line) => (line ? [line] : []));
  return {
    page,
    lines,
    elements,
    index: Number(sheetMatch[1]),
    total: Number(sheetMatch[2]),
    material: materialMatch[1],
    thicknessMm: numberFrom(materialMatch[2]),
    size: sizeMatch ? { lengthMm: numberFrom(sizeMatch[1]), widthMm: numberFrom(sizeMatch[2]) } : null,
    kind: kind?.segment.text ?? null,
    headerBottom: Math.max(...headerLines.map((line) => line.y1)),
    table: readTableLayout(lines),
  };
}

/** Agrupa las páginas por hoja y verifica lo que se pierde al unirlas (INV-15 b). */
function groupSheets(pages: readonly SheetPage[]): SheetPage[][] {
  const groups = new Map<number, SheetPage[]>();
  for (const page of pages) {
    const group = groups.get(page.index);
    if (!group) {
      groups.set(page.index, [page]);
      continue;
    }
    const first = group[0];
    const previous = group[group.length - 1];
    if (page.page !== previous.page + 1) throw new ReadFailure("hoja-incompleta", `La hoja ${page.index} ocupa páginas no consecutivas (${previous.page} y ${page.page}).`);
    if (page.total !== first.total) throw new ReadFailure("hoja-incompleta", `La página ${page.page} dice "${page.index} / ${page.total}" y la anterior "${first.index} / ${first.total}".`);
    if (page.material !== first.material || page.thicknessMm !== first.thicknessMm) {
      throw new ReadFailure("hoja-incompleta", `La página ${page.page} tiene otro material o espesor que la primera de su hoja.`);
    }
    group.push(page);
  }
  const sheets = [...groups.keys()].sort(order).map((index) => groups.get(index) ?? []);
  const total = sheets[0]?.[0].total;
  if (sheets.length === 0 || sheets.some((group, i) => group[0].index !== i + 1 || group[0].total !== total) || sheets.length !== total) {
    throw new ReadFailure("estructura-no-reconocida", "Los números de hoja no son 1..N.");
  }
  return sheets;
}

interface Footer {
  pieceCount: number;
  cutLengthM: number | null;
  efficiencyPct: number | null;
}

function readFooter(sheet: readonly SheetPage[]): Footer {
  const last = sheet[sheet.length - 1];
  for (const page of sheet) {
    if (page !== last && findSegment(page.lines, (text) => PIECE_COUNT.test(text))) {
      throw new ReadFailure("hoja-incompleta", `La página ${page.page} tiene el pie de la hoja y no es la última.`);
    }
  }
  const count = findSegment(last.lines, (text) => PIECE_COUNT.test(text));
  const countMatch = count && PIECE_COUNT.exec(count.segment.text);
  if (!countMatch) throw new ReadFailure("hoja-incompleta", `La hoja ${last.index} no tiene pie.`);
  return {
    pieceCount: Number(countMatch[1]),
    cutLengthM: readNumber(labeledValue(last.lines, "Longitud de cortes")),
    efficiencyPct: readNumber(labeledValue(last.lines, "Eficiencia")),
  };
}

function readDiagram(page: SheetPage, table: TableLayout): DiagramLetter[] {
  const counts = new Map<string, number>();
  for (const element of page.elements) {
    if (!DIAGRAM_LETTER.test(element.text)) continue;
    if (centerY(element) > page.headerBottom && centerY(element) < table.top) counts.set(element.text, (counts.get(element.text) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => compareText(a, b)).map(([letter, count]) => ({ letter, count }));
}

// --- Filas ---

interface RawRow {
  letter: string;
  designation: PdfTextElement[];
  cant: PdfTextElement[];
  finalL: PdfTextElement[];
  finalA: PdfTextElement[];
  edge: PdfTextElement[];
}

function readRows(page: SheetPage, table: TableLayout, isFirstPage: boolean): RawRow[] {
  const bottom = Math.min(...page.lines.filter((line) => line.segments.some((s) => FOOTER_LINE.test(s.text))).map((line) => line.y0), Infinity);
  // Con el encabezado de la tabla en esta página, los datos empiezan debajo; si no, debajo del de la hoja.
  const top = page.table ? page.table.bottom : page.headerBottom;
  const data = page.elements.filter((element) => centerY(element) > top && centerY(element) < bottom);
  const isAnchor = (element: PdfTextElement) => LETTER.test(element.text) && Math.abs(centerX(element) - table.no.center) <= table.no.width;
  const anchors = data.filter(isAnchor).sort((a, b) => a.y - b.y);

  const firstRow = anchors[0]?.y ?? Infinity;
  const before = data.filter((element) => element.y < firstRow - 1e-9);
  if (!isFirstPage && before.some((element) => DIAGRAM_LETTER.test(element.text))) {
    throw new ReadFailure("hoja-incompleta", `La página ${page.page} tiene letras de diagrama y no es la primera de su hoja.`);
  }
  if (before.length > 0) throw new ReadFailure("estructura-no-reconocida", `La página ${page.page} tiene texto antes de la primera fila.`);
  if (!isFirstPage && page.table && page.elements.some((e) => DIAGRAM_LETTER.test(e.text) && centerY(e) > page.headerBottom && centerY(e) < table.top)) {
    throw new ReadFailure("hoja-incompleta", `La página ${page.page} tiene letras de diagrama y no es la primera de su hoja.`);
  }

  const edgeZoneStart = table.edgeLabelCenter === null ? Infinity : table.finalA + (table.finalA - table.finalL) / 2;
  return anchors.map((anchor, i) => {
    const end = anchors[i + 1]?.y ?? Infinity;
    const row: RawRow = { letter: anchor.text, designation: [], cant: [], finalL: [], finalA: [], edge: [] };
    for (const element of data) {
      if (element === anchor || centerY(element) < anchor.y || centerY(element) >= end) continue;
      const x = centerX(element);
      if (x > edgeZoneStart) row.edge.push(element);
      else if (Math.abs(x - table.cant.center) <= table.cant.width) row.cant.push(element);
      else if (x < table.cant.center && x > table.no.center) row.designation.push(element);
      else if (x > table.cant.center) {
        const nearest = table.valueColumns.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best));
        if (nearest === table.finalL) row.finalL.push(element);
        else if (nearest === table.finalA) row.finalA.push(element);
        // El resto es "Ajustadas": no entra al esquema (RP1).
      }
    }
    return row;
  });
}

const cellText = (elements: readonly PdfTextElement[]) =>
  elements.length === 0
    ? null
    : [...elements]
        .sort((a, b) => a.x - b.x)
        .map((e) => e.text)
        .join(" ");

/** Une los renglones de la designación y descarta los íconos (§7.1). */
function readDesignation(elements: readonly PdfTextElement[], path: string, pending: PendingField[]): { code: string | null; name: string } {
  const clean = elements.flatMap((element) => {
    const text = element.text.replace(PRIVATE_USE, "").trim();
    return HAS_LETTER_OR_DIGIT.test(text) ? [{ ...element, text }] : [];
  });
  const rows = toLines(clean).map((line) => line.segments.map((s) => s.text).join(" "));

  let code: string | null = null;
  let nameRows: string[] = rows;
  for (let k = 1; k <= rows.length && code === null; k += 1) {
    const joined = rows.slice(0, k).join("").replace(/\s+/g, "");
    if (looksLikeCode(joined)) {
      code = joined;
      nameRows = rows.slice(k);
    }
  }
  if (code === null) {
    pending.push({ path: `${path}.code`, reason: "No se pudo separar el código de la designación." });
    if (rows.length > 0) {
      code = rows[0];
      nameRows = rows.slice(1);
    }
  }
  const name = nameRows.join(" ");
  if (name === "") pending.push({ path: `${path}.name`, reason: "No se leyó el nombre." });
  return { code, name };
}

interface EdgeMark {
  x: number;
  text: string;
}

/**
 * Agrupa el texto de la zona de cantos en marcas. Cada elemento con "Canto" abre una marca, aunque esté pegado a la
 * anterior; la marca suma lo que tiene debajo y se solapa horizontalmente (el texto ocupa 3 renglones). Devuelve
 * además si quedó texto sin atribuir: sin marca, o solapado con más de una.
 */
function readMarks(elements: readonly PdfTextElement[]): { marks: EdgeMark[]; stray: boolean } {
  const groups: { x0: number; x1: number; parts: string[] }[] = [];
  const opensMark = (text: string) => /^Canto\b/i.test(text);
  let stray = false;
  for (const line of toLines(elements)) {
    const runs: PdfTextElement[][] = [];
    for (const element of line.elements) {
      if (opensMark(element.text) || runs.length === 0) runs.push([element]);
      else runs[runs.length - 1].push(element);
    }
    for (const segment of runs.flatMap(toSegments)) {
      if (opensMark(segment.text)) {
        groups.push({ x0: segment.x0, x1: segment.x1, parts: [segment.text] });
        continue;
      }
      const overlapping = groups.filter((g) => Math.min(g.x1, segment.x1) > Math.max(g.x0, segment.x0));
      const group = overlapping[0];
      if (!group || overlapping.length > 1) {
        stray = true;
        continue;
      }
      group.parts.push(segment.text);
      group.x0 = Math.min(group.x0, segment.x0);
      group.x1 = Math.max(group.x1, segment.x1);
    }
  }
  return { marks: groups.map((g) => ({ x: (g.x0 + g.x1) / 2, text: g.parts.join(" ") })), stray };
}

/** Paso de las subcolumnas de una hoja (§8.2): menor distancia entre marcas de una fila, con tope; si no, la constante. */
function edgePitch(rows: readonly (readonly EdgeMark[])[], pageWidth: number | null): number | null {
  if (pageWidth === null) return null;
  const fallback = EDGE_PITCH_RATIO * pageWidth;
  let smallest = Infinity;
  for (const marks of rows) {
    const xs = marks.map((mark) => mark.x).sort(order);
    for (let i = 1; i < xs.length; i += 1) smallest = Math.min(smallest, xs[i] - xs[i - 1]);
  }
  return smallest <= EDGE_PITCH_CAP * fallback ? smallest : fallback;
}

function readEdgeStrip(text: string, path: string, pending: PendingField[]): EdgeStrip {
  const match = EDGE_LABEL.exec(text);
  if (!match) {
    for (const field of ["material", "widthMm", "thicknessText"]) pending.push({ path: `${path}.${field}`, reason: "No se entendió el texto de la marca de canto." });
    return { label: text, material: null, widthMm: null, thicknessText: null };
  }
  return { label: text, material: match[1], widthMm: numberFrom(match[3]), thicknessText: match[2] };
}

function assignEdges(marks: readonly EdgeMark[], stray: boolean, center: number, pitch: number | null, path: string, pending: PendingField[]): EdgeStrips {
  const edges: EdgeStrips = { s1: null, s2: null, s3: null, s4: null };
  let doubtful = stray;
  if (marks.length > 0 && pitch === null) doubtful = true;
  if (pitch !== null) {
    const centers = [center - 1.5 * pitch, center - 0.5 * pitch, center + 0.5 * pitch, center + 1.5 * pitch];
    for (const mark of marks) {
      const slot = centers.reduce((best, c, i) => (Math.abs(c - mark.x) < Math.abs(centers[best] - mark.x) ? i : best), 0);
      // A más de medio paso del centro más cercano no se adivina. Con el paso como la menor distancia entre marcas,
      // esto también cubre dos marcas de una fila en la misma subcolumna.
      if (Math.abs(centers[slot] - mark.x) > pitch / 2) doubtful = true;
      else edges[EDGE_KEYS[slot]] = readEdgeStrip(mark.text, `${path}.edges.${EDGE_KEYS[slot]}`, pending);
    }
  }
  if (doubtful) pending.push({ path: `${path}.edges`, reason: "Una marca de canto no se pudo asignar a una subcolumna." });
  return edges;
}

function buildBoard(sheet: readonly SheetPage[], b: number, pageWidths: PdfTextInput["pageWidths"], pending: PendingField[]): Board {
  const first = sheet[0];
  const table = first.table;
  if (!table || !first.size || !first.kind) throw new ReadFailure("estructura-no-reconocida", `La página ${first.page} no tiene el encabezado completo de la hoja o de la tabla.`);

  const footer = readFooter(sheet);
  const path = `boards[${b}]`;
  if (footer.cutLengthM === null) pending.push({ path: `${path}.cutLengthM`, reason: 'No se leyó "Longitud de cortes".' });
  if (footer.efficiencyPct === null) pending.push({ path: `${path}.efficiencyPct`, reason: 'No se leyó "Eficiencia".' });

  const raw = sheet.flatMap((page, i) => readRows(page, page.table ?? table, i === 0));
  const marks = raw.map((row) => (table.edgeLabelCenter === null ? { marks: [], stray: false } : readMarks(row.edge)));
  const pageWidth = pageWidths.find((p) => p.page === first.page)?.width ?? null;
  const pitch = edgePitch(marks.map((m) => m.marks), pageWidth);

  const pieces = raw.map((row, p): BoardPiece => {
    const piecePath = `${path}.pieces[${p}]`;
    const { code, name } = readDesignation(row.designation, piecePath, pending);
    const value = (cell: readonly PdfTextElement[], field: string) => {
      const parsed = readNumber(cellText(cell));
      if (parsed === null) pending.push({ path: `${piecePath}.${field}`, reason: `No se leyó ${field}.` });
      return parsed;
    };
    const cantText = cellText(row.cant);
    const quantity = cantText !== null && /^\d+$/.test(cantText) && Number(cantText) >= 1 ? Number(cantText) : null;
    if (quantity === null) pending.push({ path: `${piecePath}.quantity`, reason: "No se leyó la cantidad." });
    const finalL = value(row.finalL, "finalL");
    const finalA = value(row.finalA, "finalA");
    const edges =
      table.edgeLabelCenter === null
        ? ("columna-ausente" as const)
        : assignEdges(marks[p].marks, marks[p].stray, table.edgeLabelCenter, pitch, piecePath, pending);
    return { letter: row.letter, code, name, quantity, finalL, finalA, edges };
  });

  const letters = readDiagram(first, table);
  if (letters.length === 0) pending.push({ path: `${path}.diagram`, reason: "No se leyeron letras en el diagrama." });

  return {
    index: first.index,
    total: first.total,
    pages: sheet.map((page) => page.page),
    material: first.material,
    thicknessMm: first.thicknessMm,
    lengthMm: first.size.lengthMm,
    widthMm: first.size.widthMm,
    kind: first.kind,
    pieceCount: footer.pieceCount,
    cutLengthM: footer.cutLengthM,
    efficiencyPct: footer.efficiencyPct,
    pieces,
    diagram: letters.length === 0 ? "pendiente" : letters,
  };
}

function readDocument(input: PdfTextInput): CutListPdf {
  const elements = input.elements.map((element) => ({ ...element, text: element.text.normalize("NFC").trim() })).filter((element) => element.text !== "");
  if (elements.length === 0) throw new ReadFailure("sin-capa-de-texto", "No hay elementos de texto.");

  const byPage = new Map<number, PdfTextElement[]>();
  for (const element of elements) {
    const page = byPage.get(element.page);
    if (page) page.push(element);
    else byPage.set(element.page, [element]);
  }
  const summaryElements = byPage.get(1);
  if (!summaryElements) throw new ReadFailure("estructura-no-reconocida", "Falta la página 1 (resumen).");

  const pending: PendingField[] = [];
  const { header, summary } = readSummary(toLines(summaryElements), pending);

  const pages = [...byPage.keys()]
    .filter((page) => page !== 1)
    .sort(order)
    .map((page) => readSheetPage(page, byPage.get(page) ?? []));
  if (pages.length === 0) throw new ReadFailure("estructura-no-reconocida", "El PDF no tiene hojas de tablero.");
  const sheets = groupSheets(pages);

  const firstTables = sheets.map((sheet) => sheet[0].table);
  const variants = new Set(firstTables.map((table) => (table ? `${table.adjusted}|${table.edgeLabelCenter !== null}` : "sin-tabla")));
  if (variants.size > 1 || firstTables[0] === null) throw new ReadFailure("estructura-no-reconocida", "Las hojas no tienen las mismas columnas.");

  const boards = sheets.map((sheet, b) => buildBoard(sheet, b, input.pageWidths, pending));

  return {
    schema: "cutlist-pdf/1",
    source: {
      fileName: input.fileName,
      pdfId: input.pdfId,
      reader: "texto-pdf",
      readerVersion: input.readerVersion,
      producer: input.producer,
      hasTextLayer: true,
    },
    header,
    summary,
    columns: { adjusted: firstTables[0].adjusted, edgeStrips: firstTables[0].edgeLabelCenter !== null },
    boards,
    pending,
  };
}

/** Elementos de texto de todas las páginas → documento. Pura: la misma entrada da el mismo JSON, byte a byte. */
export function parseCutListText(input: PdfTextInput): PdfReading {
  try {
    return { ok: true, document: readDocument(input) };
  } catch (error) {
    if (error instanceof ReadFailure) return { ok: false, reason: error.reason, detail: error.message };
    throw error;
  }
}
