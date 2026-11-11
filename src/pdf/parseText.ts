// Parser de TextoPdf: de elementos de texto con posición a CutListPdf (docs/spec-esquema-pdf.md §8.2).
// Función pura y determinista, sin IA ni librerías de PDF. No valida ni decide (§8.1): lo que no lee con certeza
// va a `pending`, y solo devuelve un error si no puede armar el documento.
//
// La geometría se midió en los trazados de los PDF de Sabrina; los textos son un SUPUESTO hasta tener un PDF de
// OpenCutList con capa de texto (consulta 58).

import { looksLikeCode } from "./code";
import { PDF_REJECT_RULES, type PdfRejectRule } from "./rejectRules";
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
  PdfTextLayout,
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
/** R-5: fecha y hora con "am"/"pm"; los espacios alrededor de los signos se ignoran (N-1: el OCR los separa). */
const DATE_TIME = /^\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}\s+\d{1,2}\s*:\s*\d{2}\s*[ap]m$/i;
/** Variante /-b (R-6): material y espesor sin el `/`, que el OCR pierde. Solo vale si coincide con el resumen. */
const MATERIAL_WITHOUT_SLASH = new RegExp(String.raw`^(.+?)\s+(${NUMBER})\s*mm$`);
const KIND = /^Tablero\b/;
/** R-2: un renglón que contiene un rótulo del pie (además de los que tienen un segmento que empieza con `FOOTER_LINE`). */
const FOOTER_LABEL = /(Longitud de cortes|Eficiencia|La fibra sigue)/i;
const MILLIMETER = /^mil[ií]metros?$/i;
/** R-11 d: formato de cada columna de la tabla del Resumen (entero; número con `mm` opcional; número con `m²` opcional). */
const SUMMARY_INTEGER = /^\d+$/;
const SUMMARY_LENGTH = new RegExp(String.raw`^${NUMBER}\s*(?:mm)?$`);
const SUMMARY_AREA = new RegExp(String.raw`^${NUMBER}\s*(?:m²|m2)?$`);
/** R-11 b: las únicas columnas de la tabla del Resumen que se leen. `Σ Costos` y cualquier otro rótulo se descartan. */
const SUMMARY_ANCHORS = ["Cant.", "Longitud", "Anchura", "Σ Areas", "Σ Partes"] as const;
const OTHER_UNIT = /^(cent[ií]metros?|metros?|pulgadas?|pies?|inch(es)?|feet)$/i;
const LETTER = /^[A-Z]{1,3}$/;
/**
 * R-13 a: las 11 mayúsculas cirílicas de glifo idéntico a una latina, cada una con su única gemela. Tabla cerrada: no hay
 * distancia de edición ni heurística, y cualquier otro carácter no latino sigue sin ser ancla. Solo vale para la columna
 * "No." (la letra de fila es una etiqueta local, no una clave; el código no se autocorrige, H-02) y no se extiende al
 * diagrama (H-E). Los escapes evitan confundir cada par a simple vista.
 */
const LATIN_TWINS: Readonly<Record<string, string>> = {
  "\u0410": "A",
  "\u0412": "B",
  "\u0415": "E",
  "\u041A": "K",
  "\u041C": "M",
  "\u041D": "H",
  "\u041E": "O",
  "\u0420": "P",
  "\u0421": "C",
  "\u0422": "T",
  "\u0425": "X",
};
const rowLetter = (text: string) => [...text].map((char) => LATIN_TWINS[char] ?? char).join("");
const DIAGRAM_LETTER = /^[A-Z]$/;
const EDGE_LABEL = new RegExp(String.raw`^Canto\s+(.+?)\s*(~\s*${NUMBER}\s*mm)\s*[x×]\s*(${NUMBER})\s*mm$`, "i");
const PRIVATE_USE = /[-]/gu;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** `PdfTextLayout` con todos los campos resueltos. `glueGapRatio: null` = no se pega nada (TextoPdf). */
interface ResolvedLayout {
  joinGapRatio: number;
  glueGapRatio: number | null;
  rowToleranceRatio: number;
}

/** Valores de TextoPdf: los que rigen sin `layout` (spec-esquema §8.2). */
const TEXT_LAYOUT: ResolvedLayout = { joinGapRatio: 1, glueGapRatio: null, rowToleranceRatio: 0 };

/** Un parámetro fuera de [0, ∞) o no finito es un error de programación de quien llama, no un problema del PDF. */
function resolveLayout(layout: PdfTextLayout | undefined): ResolvedLayout {
  const read = (name: keyof PdfTextLayout): number | undefined => {
    const value = layout?.[name];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new RangeError(`layout.${name} tiene que ser un número finito ≥ 0 (llegó ${value}).`);
    return value;
  };
  return {
    joinGapRatio: read("joinGapRatio") ?? TEXT_LAYOUT.joinGapRatio,
    glueGapRatio: read("glueGapRatio") ?? TEXT_LAYOUT.glueGapRatio,
    rowToleranceRatio: read("rowToleranceRatio") ?? TEXT_LAYOUT.rowToleranceRatio,
  };
}

/** Un trozo sin letras ni dígitos (".", "~", "-"): el único que `glueGapRatio` permite pegar. */
const isSign = (text: string) => !HAS_LETTER_OR_DIGIT.test(text);

/** R-10: una palabra de un solo carácter, sin letras ni dígitos. */
const isSeparator = (text: string) => [...text].length === 1 && isSign(text);

/**
 * Error interno: corta la lectura y se convierte en `{ ok: false }`. Nunca sale del módulo. `rule` es el id del sitio
 * (catálogo cerrado, C2) y fija la razón; `page` es la página del rechazo, o null si es del documento. El `detail`
 * puede citar texto del documento: solo va a archivos locales.
 */
class ReadFailure extends Error {
  readonly reason: PdfReadingFailure;
  constructor(
    readonly rule: PdfRejectRule,
    readonly page: number | null,
    detail: string,
  ) {
    super(detail);
    this.reason = PDF_REJECT_RULES[rule].reason;
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

/** Palabra de un renglón, para los patrones delimitados (R-1). Una frase de una capa de texto aporta varias. */
interface Word {
  text: string;
  /** Segmento del renglón: un hueco mayor que `joinGapRatio` separa segmentos y es un límite. */
  segment: number;
  /** Va con un espacio antes, dentro de su segmento (no, si es la primera o si la pegó `glueGapRatio`). */
  space: boolean;
  /** R-10: separador, salvo que el patrón lo consuma. */
  separator: boolean;
}

interface Line {
  y0: number;
  y1: number;
  elements: PdfTextElement[];
  segments: Segment[];
  words: Word[];
}

const centerX = (box: { x: number; width: number }) => box.x + box.width / 2;
const centerY = (box: { y: number; height: number }) => box.y + box.height / 2;
const segmentCenter = (segment: Segment) => (segment.x0 + segment.x1) / 2;
const order = (a: number, b: number) => a - b;

/** Agrupa en renglones: cajas que se solapan verticalmente al menos la mitad de la más baja. */
function toLines(elements: readonly PdfTextElement[], layout: ResolvedLayout): Line[] {
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
    } else lines.push({ y0: element.y, y1: element.y + element.height, elements: [element], segments: [], words: [] });
  }
  for (const line of lines) {
    line.elements.sort((a, b) => a.x - b.x || compareText(a.text, b.text));
    ({ segments: line.segments, words: line.words } = segmentElements(line.elements, layout));
  }
  return lines;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Une elementos contiguos de un renglón: separación ≤ `joinGapRatio` × alto del más bajo de los dos (§8.2). Con
 * `glueGapRatio`, un signo suelto casi pegado a su vecino se concatena sin espacio.
 */
function toSegments(elements: readonly PdfTextElement[], layout: ResolvedLayout): Segment[] {
  return segmentElements(elements, layout).segments;
}

/** Segmentos de un renglón y, con la misma partición, sus palabras (cada elemento se parte en sus espacios). */
function segmentElements(elements: readonly PdfTextElement[], layout: ResolvedLayout): { segments: Segment[]; words: Word[] } {
  const segments: Segment[] = [];
  const words: Word[] = [];
  let previous: PdfTextElement | null = null;
  for (const element of elements) {
    const last = segments[segments.length - 1];
    const lowest = previous ? Math.min(previous.height, element.height) : 0;
    const joined = last !== undefined && previous !== null && element.x - last.x1 <= lowest * layout.joinGapRatio;
    let glued = false;
    if (last !== undefined && previous !== null && joined) {
      glued = layout.glueGapRatio !== null && element.x - last.x1 <= lowest * layout.glueGapRatio && (isSign(previous.text) || isSign(element.text));
      last.text = glued ? `${last.text}${element.text}` : `${last.text} ${element.text}`;
      last.x1 = Math.max(last.x1, element.x + element.width);
      last.y0 = Math.min(last.y0, element.y);
      last.y1 = Math.max(last.y1, element.y + element.height);
    } else segments.push({ text: element.text, x0: element.x, x1: element.x + element.width, y0: element.y, y1: element.y + element.height });
    element.text
      .split(" ")
      .filter((text) => text !== "")
      .forEach((text, k) => words.push({ text, segment: segments.length - 1, space: k > 0 || (joined && !glued), separator: isSeparator(text) }));
    previous = element;
  }
  return { segments, words };
}

interface Match<T> {
  value: T;
  /** Índices de la primera y la última palabra en `Line.words`. */
  start: number;
  end: number;
}

/**
 * R-1: secuencias contiguas de palabras de un segmento cuyo texto cumple el patrón (`read` devuelve el valor o null) y
 * que tienen un límite a cada lado: el borde del segmento (inicio o fin del renglón, o un hueco > `joinGapRatio`) o
 * un separador (R-10). Un separador solo puede quedar adentro si es uno de los signos que el patrón consume.
 */
function delimited<T>(words: readonly Word[], consumes: readonly string[], read: (text: string) => T | null): Match<T>[] {
  const limitBefore = (i: number) => i === 0 || words[i - 1].segment !== words[i].segment || words[i - 1].separator;
  const limitAfter = (j: number) => j === words.length - 1 || words[j + 1].segment !== words[j].segment || words[j + 1].separator;
  const matches: Match<T>[] = [];
  for (let start = 0; start < words.length; start += 1) {
    if (!limitBefore(start)) continue;
    let text = "";
    for (let end = start; end < words.length; end += 1) {
      const word = words[end];
      if (word.segment !== words[start].segment || (word.separator && !consumes.includes(word.text))) break;
      text = end === start ? word.text : `${text}${word.space ? " " : ""}${word.text}`;
      if (!limitAfter(end)) continue;
      const value = read(text);
      if (value !== null) matches.push({ value, start, end });
    }
  }
  return matches;
}

/** Hay un separador justo antes de la palabra `start`, en su mismo segmento. */
const separatorBefore = (words: readonly Word[], start: number) => start > 0 && words[start - 1].separator && words[start - 1].segment === words[start].segment;

/** Valores distintos, en orden de aparición (R-3). */
function distinct<T>(values: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const value of values) if (!seen.has(JSON.stringify(value))) seen.set(JSON.stringify(value), value);
  return [...seen.values()];
}

/** Los patrones delimitados de una zona (R-2): una lista de renglones. */
const inZone = <T>(lines: readonly Line[], consumes: readonly string[], read: (text: string) => T | null) =>
  lines.flatMap((line) => delimited(line.words, consumes, read).map((match) => ({ ...match, line })));

interface MaterialValue {
  material: string;
  thicknessMm: number;
}

const materialOf =
  (pattern: RegExp) =>
  (text: string): MaterialValue | null => {
    const match = pattern.exec(text);
    return match ? { material: match[1], thicknessMm: numberFrom(match[2]) } : null;
  };

/** Texto de un renglón, palabra por palabra (para buscar un rótulo del pie, R-2). */
const lineText = (line: Line) => line.words.map((word, i) => (i > 0 ? " " : "") + word.text).join("");

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

/**
 * R-7: material del título del resumen. Con un separador justo a la izquierda, es lo que va entre ese separador y el
 * `/`. Sin separador (inicio de renglón o hueco), solo se acepta si un final de la secuencia es exactamente igual al
 * material de una fila de la tabla del resumen; si no hay una única igualdad, null (rechazo).
 */
function titleMaterial(words: readonly Word[], start: number, material: string, rowMaterials: ReadonlySet<string>): string | null {
  if (separatorBefore(words, start)) return material;
  const parts = material.split(" ");
  const endings = parts.map((_, k) => parts.slice(k).join(" ")).filter((ending) => rowMaterials.has(ending));
  return endings.length === 1 ? endings[0] : null;
}

/**
 * R-11 a: material de una fila de la tabla del Resumen, o null si la línea no es una fila (primera línea sin material).
 * El primer segmento entero que cumple `<material> / <n> mm` se lee como siempre (sin regresión, R-1); si trae una cola
 * (`- <tipo>`) se busca el patrón delimitado que empieza en la primera palabra. R-11 e: el patrón dos veces en el
 * renglón, aunque sean iguales, es un rechazo (R-3): nunca se elige uno.
 */
function summaryRowMaterial(line: Line): MaterialValue | null {
  const matches = delimited(line.words, ["/"], materialOf(MATERIAL));
  const whole = materialOf(MATERIAL)(line.segments[0].text);
  const first = whole ?? matches.find((match) => match.start === 0)?.value ?? null;
  if (first === null) return null;
  if (matches.length > 1) throw new ReadFailure("resumen-fila-ambigua", 1, "La fila de la tabla del resumen tiene el material más de una vez.");
  return first;
}

/**
 * R-11 b: celdas de la fila (los segmentos distintos del primero) por columna. Cada celda se compara con TODOS los
 * rótulos del encabezado, por la distancia entre centros, y se asigna solo si el rótulo más cercano es una ancla
 * conocida. `Σ Costos`, un rótulo desconocido y una celda equidistante de dos rótulos se descartan de forma explícita.
 */
function summaryCells(line: Line, header: Line): Map<string, Segment[]> {
  const labels = header.segments.map((segment) => ({ text: segment.text, center: segmentCenter(segment) }));
  const cells = new Map<string, Segment[]>();
  for (const cell of line.segments.slice(1)) {
    const center = segmentCenter(cell);
    const distances = labels.map((label) => Math.abs(label.center - center));
    const nearest = Math.min(...distances);
    if (distances.filter((distance) => distance - nearest <= 1e-9).length !== 1) continue;
    const label = labels[distances.indexOf(nearest)].text;
    if (!(SUMMARY_ANCHORS as readonly string[]).includes(label)) continue;
    cells.set(label, [...(cells.get(label) ?? []), cell]);
  }
  return cells;
}

type SummaryCell = { kind: "value"; value: number } | { kind: "missing" | "duplicate" | "invalid" };

/** R-11 c y d: una sola celda por ancla y con el formato de su columna; si no, no se lee (nunca reemplaza a otra). */
function readSummaryCell(cells: readonly Segment[], format: RegExp, parse: (text: string) => number): SummaryCell {
  if (cells.length === 0) return { kind: "missing" };
  if (cells.length > 1) return { kind: "duplicate" };
  const text = cells[0].text.trim();
  return format.test(text) ? { kind: "value", value: parse(text) } : { kind: "invalid" };
}

function readSummary(lines: readonly Line[], pending: PendingField[]): Pick<CutListPdf, "header" | "summary"> {
  const tableHeader = lines.find((line) => ["Cant.", "Longitud", "Anchura"].every((label) => line.segments.some((s) => s.text === label)));
  // R-2: unidad, fecha y título, solo en los renglones de arriba de la tabla (sin tabla, en toda la página; el
  // resumen se rechaza igual más abajo).
  const zone = tableHeader ? lines.filter((line) => line.y0 < tableHeader.y0) : lines;

  // R-4: la unidad es una palabra (o grupo pegado) delimitada; otra unidad se busca primero.
  const unsupported = inZone(zone, [], (text) => (OTHER_UNIT.test(text) ? text : null));
  if (unsupported.length > 0) throw new ReadFailure("resumen-unidad-no-soportada", 1, `El PDF dice "${unsupported[0].value}": solo se admite Milimetro.`);
  if (inZone(zone, [], (text) => (MILLIMETER.test(text) ? text : null)).length === 0) throw new ReadFailure("resumen-sin-unidad", 1, "El resumen no dice la unidad.");

  const titles = inZone(zone, ["/"], materialOf(MATERIAL));
  if (titles.length === 0 || !tableHeader) {
    throw new ReadFailure("resumen-sin-titulo-o-tabla", 1, "El resumen no tiene el título del material o la tabla de tableros.");
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

  const boards: SummaryBoardRow[] = [];
  for (const line of lines) {
    if (line.y0 <= tableHeader.y0) continue;
    // R-11 a: el material de la fila es un patrón delimitado `<material> / <n> mm` que empieza en el renglón. Lo que sigue
    // (`- <tipo>`) no entra y se descarta: `SummaryBoardRow` no tiene ese campo. Una fila sin material cierra la tabla (R-2).
    const material = summaryRowMaterial(line);
    if (material === null) break;
    const cells = summaryCells(line, tableHeader);
    const read = (label: (typeof SUMMARY_ANCHORS)[number], format: RegExp, parse: (text: string) => number) => readSummaryCell(cells.get(label) ?? [], format, parse);
    const requiredValue = (label: (typeof SUMMARY_ANCHORS)[number], format: RegExp, parse: (text: string) => number): number => {
      const cell = read(label, format, parse);
      if (cell.kind === "duplicate") throw new ReadFailure("resumen-celda-duplicada", 1, `Hay más de una celda en "${label}" en la tabla de tableros del resumen.`);
      if (cell.kind !== "value") throw new ReadFailure("resumen-tabla-sin-valor", 1, `Falta "${label}" en la tabla de tableros del resumen.`);
      return cell.value;
    };
    const asInteger = (text: string) => Number(text);
    const asNumber = (text: string) => numberFrom(/^\d+(?:[.,]\d+)?/.exec(text)?.[0] ?? "");
    const count = requiredValue("Cant.", SUMMARY_INTEGER, asInteger);
    const lengthMm = requiredValue("Longitud", SUMMARY_LENGTH, asNumber);
    const widthMm = requiredValue("Anchura", SUMMARY_LENGTH, asNumber);
    // Σ Areas admite null: una celda ausente, doble o de otro formato queda en pending, nunca elegida.
    const area = read("Σ Areas", SUMMARY_AREA, asNumber);
    const areaM2 = area.kind === "value" ? area.value : null;
    if (areaM2 === null) pending.push({ path: `summary.boards[${boards.length}].areaM2`, reason: 'No se leyó "Σ Areas".' });
    boards.push({
      material: material.material,
      thicknessMm: material.thicknessMm,
      count,
      lengthMm,
      widthMm,
      areaM2,
      parts: requiredValue("Σ Partes", SUMMARY_INTEGER, asInteger),
    });
  }
  if (boards.length === 0) throw new ReadFailure("resumen-tabla-vacia", 1, "La tabla de tableros del resumen está vacía.");

  const rowMaterials = new Set(boards.map((row) => row.material));
  const resolved = titles.map((title) => {
    const material = titleMaterial(title.line.words, title.start, title.value.material, rowMaterials);
    return material === null ? null : { material, thicknessMm: title.value.thicknessMm };
  });
  if (resolved.some((title) => title === null)) {
    throw new ReadFailure("resumen-titulo-sin-limite", 1, "El material del título no tiene un separador a la izquierda y no coincide con ninguna fila de la tabla.");
  }
  // R-3: dos títulos distintos no se resuelven eligiendo uno; header.material no admite null.
  const [title, ...others] = distinct(resolved.flatMap((value) => (value === null ? [] : [value])));
  if (others.length > 0) throw new ReadFailure("resumen-titulo-ambiguo", 1, "El resumen tiene más de un título de material distinto.");

  // R-5: fecha y hora delimitadas; ausente, no delimitada o con dos valores distintos queda en pending.
  const dates = distinct(inZone(zone, ["/", ":"], (text) => (DATE_TIME.test(text) ? text : null)).map((match) => match.value));
  const generatedAt = dates.length === 1 ? dates[0] : null;
  if (generatedAt === null) pending.push({ path: "header.generatedAt", reason: dates.length > 1 ? "La fecha aparece más de una vez con valores distintos." : "No se leyó la fecha." });
  const project = findSegment(lines, (text) => text.includes(".skp"));
  if (!project) pending.push({ path: "header.project", reason: "No se leyó el título del recuadro." });

  return {
    header: {
      material: title.material,
      thicknessMm: title.thicknessMm,
      generatedAt: generatedAt ?? "",
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
  /** R-3: la medida o el tipo aparecen más de una vez con valores distintos en el renglón de "i / N". */
  sizeAmbiguous: boolean;
  kindAmbiguous: boolean;
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

/**
 * R-6 y variante /-b: material y espesor de la hoja en la banda. Con `/`, como siempre (dos valores distintos:
 * rechazo, R-3). Sin `/`, `<material> <n> mm` solo se acepta si es exactamente el material y el espesor del resumen;
 * nunca se toma por sí solo.
 */
function readSheetMaterial(band: readonly Word[], page: number, header: MaterialValue): MaterialValue {
  const withSlash = distinct(delimited(band, ["/"], materialOf(MATERIAL)).map((match) => match.value));
  if (withSlash.length > 1) throw new ReadFailure("hoja-material-ambiguo", page, `La página ${page} tiene más de un material de hoja distinto.`);
  if (withSlash.length === 1) return withSlash[0];
  const sameAsHeader = delimited(band, [], materialOf(MATERIAL_WITHOUT_SLASH)).some(
    ({ value }) => value.material === header.material && value.thicknessMm === header.thicknessMm,
  );
  if (sameAsHeader) return { material: header.material, thicknessMm: header.thicknessMm };
  throw new ReadFailure("hoja-sin-material", page, `La página ${page} no repite el material y el espesor de la hoja.`);
}

function readSheetPage(page: number, elements: PdfTextElement[], layout: ResolvedLayout, header: MaterialValue): SheetPage {
  const lines = toLines(elements, layout);
  const sheet = findSegment(lines, (text) => SHEET.test(text));
  const sheetMatch = sheet && SHEET.exec(sheet.segment.text);
  if (!sheetMatch) throw new ReadFailure("hoja-sin-contador", page, `La página ${page} no tiene el encabezado "i / N".`);
  // R-2: material, medida y tipo de la hoja, solo en el renglón de "i / N".
  const band = sheet.line.words;
  const material = readSheetMaterial(band, page, header);
  // R-8: la medida y el tipo, delimitados. Una medida sin límite a la izquierda no se lee.
  const sizes = distinct(
    delimited(band, ["×"], (text) => {
      const match = BOARD_SIZE.exec(text);
      return match ? { lengthMm: numberFrom(match[1]), widthMm: numberFrom(match[2]) } : null;
    }).map((match) => match.value),
  );
  const kinds = distinct(delimited(band, [], (text) => (KIND.test(text) ? text : null)).map((match) => match.value));
  return {
    page,
    lines,
    elements,
    index: Number(sheetMatch[1]),
    total: Number(sheetMatch[2]),
    material: material.material,
    thicknessMm: material.thicknessMm,
    size: sizes.length === 1 ? sizes[0] : null,
    kind: kinds.length === 1 ? kinds[0] : null,
    sizeAmbiguous: sizes.length > 1,
    kindAmbiguous: kinds.length > 1,
    headerBottom: sheet.line.y1,
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
    if (page.page !== previous.page + 1) throw new ReadFailure("hoja-paginas-no-consecutivas", page.page, `La hoja ${page.index} ocupa páginas no consecutivas (${previous.page} y ${page.page}).`);
    if (page.total !== first.total) throw new ReadFailure("hoja-contador-distinto", page.page, `La página ${page.page} dice "${page.index} / ${page.total}" y la anterior "${first.index} / ${first.total}".`);
    if (page.material !== first.material || page.thicknessMm !== first.thicknessMm) {
      throw new ReadFailure("hoja-material-distinto", page.page, `La página ${page.page} tiene otro material o espesor que la primera de su hoja.`);
    }
    group.push(page);
  }
  const sheets = [...groups.keys()].sort(order).map((index) => groups.get(index) ?? []);
  const total = sheets[0]?.[0].total;
  if (sheets.length === 0 || sheets.some((group, i) => group[0].index !== i + 1 || group[0].total !== total) || sheets.length !== total) {
    throw new ReadFailure("hojas-numeracion-invalida", null, "Los números de hoja no son 1..N.");
  }
  return sheets;
}

interface Footer {
  pieceCount: number;
  cutLengthM: number | null;
  efficiencyPct: number | null;
}

/** R-2: renglones del pie, los que tienen un segmento que empieza con un rótulo de `FOOTER_LINE` o contienen uno. */
const footerLines = (page: SheetPage) => page.lines.filter((line) => line.segments.some((s) => FOOTER_LINE.test(s.text)) || FOOTER_LABEL.test(lineText(line)));

/** R-9: `<n> piezas` delimitado, en la zona del pie. */
const pieceCounts = (page: SheetPage) =>
  distinct(
    inZone(footerLines(page), [], (text) => {
      const match = PIECE_COUNT.exec(text);
      return match ? Number(match[1]) : null;
    }).map((match) => match.value),
  );

/**
 * R-9: valor de un rótulo del pie: lo que sigue al rótulo y al `:` opcional, hasta un límite. Si el rótulo termina su
 * segmento, el valor es el segmento siguiente hasta un límite (como en una capa de texto). Dos valores distintos o
 * uno que no es número: null (pending).
 */
function footerValue(lines: readonly Line[], label: string): number | null {
  const labelWords = label.split(" ");
  const values: string[] = [];
  for (const { words } of lines) {
    for (let i = 0; i + labelWords.length <= words.length; i += 1) {
      const hit = labelWords.every((expected, k) => {
        const word = words[i + k];
        return word.segment === words[i].segment && (k === labelWords.length - 1 ? word.text.replace(/:$/, "") : word.text) === expected;
      });
      if (!hit) continue;
      let k = i + labelWords.length;
      if (k < words.length && words[k].text === ":" && words[k].segment === words[k - 1].segment) k += 1;
      let text = "";
      for (let j = k; j < words.length && words[j].segment === words[k].segment && !words[j].separator; j += 1) text = j === k ? words[j].text : `${text}${words[j].space ? " " : ""}${words[j].text}`;
      if (text !== "") values.push(text);
    }
  }
  const found = distinct(values.map(readNumber));
  return found.length === 1 ? found[0] : null;
}

function readFooter(sheet: readonly SheetPage[]): Footer {
  const last = sheet[sheet.length - 1];
  for (const page of sheet) {
    if (page !== last && pieceCounts(page).length > 0) {
      throw new ReadFailure("hoja-pie-fuera-de-la-ultima", page.page, `La página ${page.page} tiene el pie de la hoja y no es la última.`);
    }
  }
  const counts = pieceCounts(last);
  if (counts.length === 0) throw new ReadFailure("hoja-sin-pie", last.page, `La hoja ${last.index} no tiene pie.`);
  if (counts.length > 1) throw new ReadFailure("hoja-pie-ambiguo", last.page, `La hoja ${last.index} tiene más de una cantidad de piezas en el pie.`);
  const lines = footerLines(last);
  return {
    pieceCount: counts[0],
    cutLengthM: footerValue(lines, "Longitud de cortes"),
    efficiencyPct: footerValue(lines, "Eficiencia"),
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

function readRows(page: SheetPage, table: TableLayout, isFirstPage: boolean, layout: ResolvedLayout): RawRow[] {
  const bottom = Math.min(...page.lines.filter((line) => line.segments.some((s) => FOOTER_LINE.test(s.text))).map((line) => line.y0), Infinity);
  // Con el encabezado de la tabla en esta página, los datos empiezan debajo; si no, debajo del de la hoja.
  const top = page.table ? page.table.bottom : page.headerBottom;
  const body = page.elements.filter((element) => centerY(element) > top && centerY(element) < bottom);
  // R-13 a: una palabra de la columna "No." es letra de fila si, con las gemelas cirílicas pasadas a latín, cumple LETTER.
  const isAnchor = (element: PdfTextElement) => LETTER.test(rowLetter(element.text)) && Math.abs(centerX(element) - table.no.center) <= table.no.width;
  const candidates = body.filter(isAnchor).sort((a, b) => a.y - b.y);
  // R-13 b: dos anclas que se solapan en vertical al menos la mitad del alto de la más baja y tienen la MISMA letra
  // (ya normalizada) son una sola fila; la segunda caja no es dato de ninguna celda. Con letras distintas no se funden
  // (nunca se elige una) y la fila vacía queda con sus campos en pending.
  const duplicates = new Set<PdfTextElement>();
  const anchors: PdfTextElement[] = [];
  for (const candidate of candidates) {
    const last = anchors[anchors.length - 1];
    const overlaps = last !== undefined && Math.min(last.y + last.height, candidate.y + candidate.height) - Math.max(last.y, candidate.y) >= Math.min(last.height, candidate.height) / 2;
    if (last !== undefined && overlaps && rowLetter(last.text) === rowLetter(candidate.text)) duplicates.add(candidate);
    else anchors.push(candidate);
  }
  const data = body.filter((element) => !duplicates.has(element));

  // Una fila empieza `tolerance` antes del borde superior de su letra: las cajas de un OCR se desplazan en vertical.
  const tolerance = (anchors[0]?.height ?? 0) * layout.rowToleranceRatio;
  const firstRow = anchors[0]?.y ?? Infinity;
  const before = data.filter((element) => element.y < firstRow - tolerance - 1e-9);
  if (!isFirstPage && before.some((element) => DIAGRAM_LETTER.test(element.text))) {
    throw new ReadFailure("hoja-diagrama-en-continuacion", page.page, `La página ${page.page} tiene letras de diagrama y no es la primera de su hoja.`);
  }
  if (before.length > 0) throw new ReadFailure("hoja-texto-antes-de-filas", page.page, `La página ${page.page} tiene texto antes de la primera fila.`);
  if (!isFirstPage && page.table && page.elements.some((e) => DIAGRAM_LETTER.test(e.text) && centerY(e) > page.headerBottom && centerY(e) < table.top)) {
    throw new ReadFailure("hoja-diagrama-en-continuacion-con-tabla", page.page, `La página ${page.page} tiene letras de diagrama y no es la primera de su hoja.`);
  }

  const edgeZoneStart = table.edgeLabelCenter === null ? Infinity : table.finalA + (table.finalA - table.finalL) / 2;
  return anchors.map((anchor, i) => {
    const end = (anchors[i + 1]?.y ?? Infinity) - tolerance;
    const row: RawRow = { letter: rowLetter(anchor.text), designation: [], cant: [], finalL: [], finalA: [], edge: [] };
    for (const element of data) {
      if (element === anchor || centerY(element) < anchor.y - tolerance || centerY(element) >= end) continue;
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

/**
 * Une los renglones de la designación y descarta los íconos (§7.1). R-12 a: la palabra `-` (U+002D) NO se descarta: es el
 * guion del código y el OCR la entrega aparte (`M01 - C04`); ningún otro guion se convierte (H-02). R-12 b: si una palabra
 * descartada (un signo, un braille en blanco, un carácter de uso privado) queda ENTRE dos palabras del mismo renglón del
 * código, el código va a pending aunque la unión cumpla el formato; un ícono al final del renglón se descarta sin más.
 */
function readDesignation(elements: readonly PdfTextElement[], path: string, pending: PendingField[], layout: ResolvedLayout): { code: string | null; name: string } {
  const clean: PdfTextElement[] = [];
  const dropped: PdfTextElement[] = [];
  for (const element of elements) {
    const text = element.text.replace(PRIVATE_USE, "").trim();
    if (HAS_LETTER_OR_DIGIT.test(text) || text === "-") clean.push({ ...element, text });
    else dropped.push(element);
  }
  const lines = toLines(clean, layout);
  const rows = lines.map((line) => line.segments.map((s) => s.text).join(" "));
  // R-12 b: por renglón, si alguna palabra descartada cae (en x) entre dos palabras que se leen del mismo renglón.
  const iconInside = lines.map((line) =>
    dropped.some((icon) => {
      const sameLine = Math.min(line.y1, icon.y + icon.height) - Math.max(line.y0, icon.y) >= Math.min(line.y1 - line.y0, icon.height) / 2;
      const x = centerX(icon);
      return sameLine && line.elements.some((e) => centerX(e) < x) && line.elements.some((e) => centerX(e) > x);
    }),
  );

  let code: string | null = null;
  let nameRows: string[] = rows;
  for (let k = 1; k <= rows.length && code === null; k += 1) {
    const joined = rows.slice(0, k).join("").replace(/\s+/g, "");
    if (looksLikeCode(joined)) {
      // Con un ícono entre palabras del código no se acepta la unión: va a pending, como si ninguna cumpliera el formato.
      if (iconInside.slice(0, k).some(Boolean)) break;
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
function readMarks(elements: readonly PdfTextElement[], layout: ResolvedLayout): { marks: EdgeMark[]; stray: boolean } {
  const groups: { x0: number; x1: number; parts: string[] }[] = [];
  const opensMark = (text: string) => /^Canto\b/i.test(text);
  let stray = false;
  for (const line of toLines(elements, layout)) {
    const runs: PdfTextElement[][] = [];
    for (const element of line.elements) {
      if (opensMark(element.text) || runs.length === 0) runs.push([element]);
      else runs[runs.length - 1].push(element);
    }
    for (const segment of runs.flatMap((run) => toSegments(run, layout))) {
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

function buildBoard(sheet: readonly SheetPage[], b: number, pageWidths: PdfTextInput["pageWidths"], pending: PendingField[], layout: ResolvedLayout): Board {
  const first = sheet[0];
  const table = first.table;
  if (first.sizeAmbiguous) throw new ReadFailure("hoja-medida-ambigua", first.page, `La página ${first.page} tiene más de una medida de tablero distinta.`);
  if (first.kindAmbiguous) throw new ReadFailure("hoja-tipo-ambiguo", first.page, `La página ${first.page} tiene más de un tipo de tablero distinto.`);
  if (!table || !first.size || !first.kind) throw new ReadFailure("hoja-sin-encabezado-completo", first.page, `La página ${first.page} no tiene el encabezado completo de la hoja o de la tabla.`);

  const footer = readFooter(sheet);
  const path = `boards[${b}]`;
  if (footer.cutLengthM === null) pending.push({ path: `${path}.cutLengthM`, reason: 'No se leyó "Longitud de cortes".' });
  if (footer.efficiencyPct === null) pending.push({ path: `${path}.efficiencyPct`, reason: 'No se leyó "Eficiencia".' });

  const raw = sheet.flatMap((page, i) => readRows(page, page.table ?? table, i === 0, layout));
  const marks = raw.map((row) => (table.edgeLabelCenter === null ? { marks: [], stray: false } : readMarks(row.edge, layout)));
  const pageWidth = pageWidths.find((p) => p.page === first.page)?.width ?? null;
  const pitch = edgePitch(marks.map((m) => m.marks), pageWidth);

  const pieces = raw.map((row, p): BoardPiece => {
    const piecePath = `${path}.pieces[${p}]`;
    const { code, name } = readDesignation(row.designation, piecePath, pending, layout);
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
  const layout = resolveLayout(input.layout);
  const elements = input.elements.map((element) => ({ ...element, text: element.text.normalize("NFC").trim() })).filter((element) => element.text !== "");
  if (elements.length === 0) throw new ReadFailure("documento-sin-texto", null, "No hay elementos de texto.");

  const byPage = new Map<number, PdfTextElement[]>();
  for (const element of elements) {
    const page = byPage.get(element.page);
    if (page) page.push(element);
    else byPage.set(element.page, [element]);
  }
  const summaryElements = byPage.get(1);
  if (!summaryElements) throw new ReadFailure("documento-sin-resumen", null, "Falta la página 1 (resumen).");

  const pending: PendingField[] = [];
  const { header, summary } = readSummary(toLines(summaryElements, layout), pending);

  const pages = [...byPage.keys()]
    .filter((page) => page !== 1)
    .sort(order)
    .map((page) => readSheetPage(page, byPage.get(page) ?? [], layout, header));
  if (pages.length === 0) throw new ReadFailure("documento-sin-hojas", null, "El PDF no tiene hojas de tablero.");
  const sheets = groupSheets(pages);

  const firstTables = sheets.map((sheet) => sheet[0].table);
  const variants = new Set(firstTables.map((table) => (table ? `${table.adjusted}|${table.edgeLabelCenter !== null}` : "sin-tabla")));
  if (variants.size > 1 || firstTables[0] === null) throw new ReadFailure("hojas-columnas-distintas", null, "Las hojas no tienen las mismas columnas.");

  const boards = sheets.map((sheet, b) => buildBoard(sheet, b, input.pageWidths, pending, layout));

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
    if (error instanceof ReadFailure) return { ok: false, reason: error.reason, detail: error.message, rule: error.rule, page: error.page };
    throw error;
  }
}
