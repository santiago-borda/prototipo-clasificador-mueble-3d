// Diagrama de corte (SVG de OpenCutList 7.1.0) → datos (spike, docs/spec-proto-csv-ocl.md §4.4, paso 7 opcional).
// El SVG se LEE con DOMParser como XML y se devuelven solo números: la pantalla dibuja desde estos datos y nunca
// incrusta el SVG crudo. Sin dependencias; corre en el navegador y en jsdom.
//
// Formato (README del fixture): 1 unidad = 1 mm; piezas en <g id="OCL_PART"> como <path> o <rect>, con un <text> que
// lleva la letra de No.; los `id` se repiten (no se usan: la letra va con la pieza por coordenadas); <g id="OCL_CUT">
// con <line> puede estar o no; coordenadas de los cortes redondeadas a 0,1 mm. El SVG no dice su material.
//
// Los niveles de los cortes son una LECTURA GEOMÉTRICA, no confirmada con Casa Mueble, y no son un orden de corte
// (el orden real del taller no está confirmado: R4, consultas 35 a 37).

import type { CsvPiece } from "./parse";

export interface SvgPart {
  /** Orden en el documento (0-based). */
  index: number;
  /** Letra de No. (el <text> que cae dentro de la pieza); null si no hay exactamente uno. */
  letter: string | null;
  x: number;
  y: number;
  /** Ancho (eje x) y alto (eje y) de la caja, en mm. */
  w: number;
  h: number;
}

export type CutAxis = "horizontal" | "vertical" | "oblicua";

export interface SvgCut {
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthMm: number;
  axis: CutAxis;
  /** Lectura geométrica (no confirmada): 1 cruza la placa; N+1 nace y termina sobre cortes de nivel ≤ N. null = no se pudo leer. */
  level: number | null;
}

export type PlacaParse =
  | { ok: false; reason: "svg-ilegible" | "escala-no-soportada" | "sin-piezas" | "transform-no-soportado"; message: string }
  | {
      ok: true;
      widthMm: number;
      heightMm: number;
      parts: SvgPart[];
      /** Piezas que no se pudieron leer (forma no soportada): se avisan, no se dibujan. */
      unreadableParts: number;
      /** null si el SVG no trae OCL_CUT. */
      cuts: SvgCut[] | null;
      totalCutM: number | null;
    };

/** Contacto entre un extremo de corte y otro corte: el espaciado entre piezas (3 mm según el Resumen del PDF) más el redondeo a 0,1 mm. ASUMIDO. */
export const CUT_TOUCH_TOLERANCE_MM = 3.5;
/** Un corte de nivel 1 cruza la placa: su largo es al menos la medida de la placa menos este margen (refilado y márgenes). ASUMIDO. */
export const LEVEL1_SLACK_MM = 30;
/** Comparación de piezas con las crudas del CSV (el CSV redondea a 0,1 mm). */
export const PART_TOLERANCE_MM = 0.1;

const num = (value: string | null) => (value === null ? Number.NaN : Number(value));

/** Caja de un `d` con solo M, L, H, V y Z absolutos; null si trae otra cosa (curvas, relativos). */
function pathBox(d: string): { x: number; y: number; w: number; h: number } | null {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  let command = "";
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i];
    if (/[A-Za-z]/.test(token)) {
      command = token;
      i += 1;
      if (command === "Z") continue;
      if (!"MLHV".includes(command)) return null;
      continue;
    }
    if (command === "M" || command === "L") {
      x = Number(tokens[i]);
      y = Number(tokens[i + 1]);
      i += 2;
    } else if (command === "H") {
      x = Number(tokens[i]);
      i += 1;
    } else if (command === "V") {
      y = Number(tokens[i]);
      i += 1;
    } else return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    xs.push(x);
    ys.push(y);
  }
  if (xs.length < 3) return null;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function axisOf(c: { x1: number; y1: number; x2: number; y2: number }): CutAxis {
  if (Math.abs(c.y1 - c.y2) <= PART_TOLERANCE_MM) return "horizontal";
  if (Math.abs(c.x1 - c.x2) <= PART_TOLERANCE_MM) return "vertical";
  return "oblicua";
}

/** El punto toca el corte: a menos de la tolerancia en perpendicular y dentro de su extensión (± tolerancia). */
function touches(px: number, py: number, c: SvgCut): boolean {
  const t = CUT_TOUCH_TOLERANCE_MM;
  if (c.axis === "horizontal") return Math.abs(py - c.y1) <= t && px >= Math.min(c.x1, c.x2) - t && px <= Math.max(c.x1, c.x2) + t;
  if (c.axis === "vertical") return Math.abs(px - c.x1) <= t && py >= Math.min(c.y1, c.y2) - t && py <= Math.max(c.y1, c.y2) + t;
  return false;
}

/** Niveles por pasadas: 1 = cruza la placa; después, un corte cuyos dos extremos tocan cortes ya leídos = 1 + el mayor. */
function assignLevels(cuts: SvgCut[], widthMm: number, heightMm: number) {
  for (const c of cuts) {
    const span = c.axis === "horizontal" ? widthMm : c.axis === "vertical" ? heightMm : Number.POSITIVE_INFINITY;
    if (c.lengthMm >= span - LEVEL1_SLACK_MM) c.level = 1;
  }
  for (let changed = true; changed; ) {
    changed = false;
    const known = cuts.filter((c) => c.level !== null);
    for (const c of cuts) {
      if (c.level !== null || c.axis === "oblicua") continue;
      const ends = [
        known.filter((k) => k !== c && k.axis !== c.axis && touches(c.x1, c.y1, k)),
        known.filter((k) => k !== c && k.axis !== c.axis && touches(c.x2, c.y2, k)),
      ];
      if (ends.some((e) => e.length === 0)) continue;
      c.level = 1 + Math.max(...ends.map((e) => Math.min(...e.map((k) => k.level as number))));
      changed = true;
    }
  }
}

export function parsePlacaSvg(text: string): PlacaParse {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    return { ok: false, reason: "svg-ilegible", message: "El archivo no es un SVG legible. Exportá de nuevo el diagrama de corte desde OpenCutList (formato SVG)." };
  }

  const width = /^([\d.]+)mm$/.exec(svg.getAttribute("width") ?? "");
  const height = /^([\d.]+)mm$/.exec(svg.getAttribute("height") ?? "");
  const viewBox = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const widthMm = num(width?.[1] ?? null);
  const heightMm = num(height?.[1] ?? null);
  if (!width || !height || viewBox.length !== 4 || viewBox[0] !== 0 || viewBox[1] !== 0 || Math.abs(viewBox[2] - widthMm) > 1e-6 || Math.abs(viewBox[3] - heightMm) > 1e-6) {
    return { ok: false, reason: "escala-no-soportada", message: "El SVG no está en escala 1 unidad = 1 mm (width/height en mm iguales al viewBox). Exportá de nuevo el diagrama con unidades en milímetros." };
  }

  const groups = [...doc.getElementsByTagName("g")];
  const partGroup = groups.find((g) => g.getAttribute("id") === "OCL_PART");
  const cutGroup = groups.find((g) => g.getAttribute("id") === "OCL_CUT");
  if (!partGroup) return { ok: false, reason: "sin-piezas", message: "El SVG no trae el grupo de piezas (OCL_PART): no es un diagrama de corte de OpenCutList." };
  for (const scope of [partGroup, cutGroup]) {
    if (scope && (scope.hasAttribute("transform") || scope.querySelector("[transform]"))) {
      return { ok: false, reason: "transform-no-soportado", message: "El SVG trae transformaciones (transform): el spike solo lee el SVG tal como lo exporta OpenCutList." };
    }
  }

  const texts = [...partGroup.getElementsByTagName("text")].map((t) => ({ x: num(t.getAttribute("x")), y: num(t.getAttribute("y")), letter: (t.textContent ?? "").trim() }));
  const parts: SvgPart[] = [];
  let unreadableParts = 0;
  const shapes = [...partGroup.querySelectorAll("path, rect")];
  shapes.forEach((shape) => {
    const box =
      shape.nodeName === "rect"
        ? { x: num(shape.getAttribute("x")), y: num(shape.getAttribute("y")), w: num(shape.getAttribute("width")), h: num(shape.getAttribute("height")) }
        : pathBox(shape.getAttribute("d") ?? "");
    if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) {
      unreadableParts += 1;
      return;
    }
    const inside = texts.filter((t) => t.x >= box.x && t.x <= box.x + box.w && t.y >= box.y && t.y <= box.y + box.h && t.letter !== "");
    parts.push({ index: parts.length, letter: inside.length === 1 ? inside[0].letter : null, ...box });
  });

  let cuts: SvgCut[] | null = null;
  let totalCutM: number | null = null;
  if (cutGroup) {
    cuts = [...cutGroup.getElementsByTagName("line")].map((line, index) => {
      const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((a) => num(line.getAttribute(a)));
      const c = { index, x1, y1, x2, y2, lengthMm: Math.hypot(x2 - x1, y2 - y1), axis: "oblicua" as CutAxis, level: null as number | null };
      c.axis = axisOf(c);
      return c;
    });
    assignLevels(cuts, widthMm, heightMm);
    totalCutM = cuts.reduce((sum, c) => sum + c.lengthMm, 0) / 1000;
  }

  return { ok: true, widthMm, heightMm, parts, unreadableParts, cuts, totalCutM };
}

export type PartMatch = "coincide" | "rotada" | "no-coincide" | "sin-pieza" | "sin-letra";

export interface PlacaPart extends SvgPart {
  code: string | null;
  match: PartMatch;
}

export interface PlacaComparison {
  parts: PlacaPart[];
  /** Avisos para la pantalla (no cambian el nivel de ninguna pieza: el SVG es solo para esta vista). */
  warnings: string[];
  /** Informativos (p. ej. una pieza con menos ocurrencias que su cantidad: puede estar en otra placa). */
  notes: string[];
}

const close = (a: number, b: number) => Math.abs(a - b) <= PART_TOLERANCE_MM + 1e-9;

/**
 * Cada pieza del SVG contra las crudas del CSV de su letra, dentro del material elegido al subir (la letra es local
 * de cada material). Se acepta en las dos orientaciones: L × A (coincide) o A × L (rotada); se avisa solo si no
 * coincide ninguna.
 */
export function comparePlaca(parts: readonly SvgPart[], pieces: readonly CsvPiece[], material: string): PlacaComparison {
  const ofMaterial = pieces.filter((p) => p.material === material);
  const warnings: string[] = [];
  const notes: string[] = [];
  const out: PlacaPart[] = parts.map((part) => {
    if (part.letter === null) {
      warnings.push(`Pieza ${part.index + 1} del SVG: no se pudo leer su letra.`);
      return { ...part, code: null, match: "sin-letra" };
    }
    const piece = ofMaterial.find((p) => p.letter === part.letter);
    if (!piece) {
      warnings.push(`Letra ${part.letter} del SVG: no hay pieza con esa letra en ${material}.`);
      return { ...part, code: null, match: "sin-pieza" };
    }
    const raw = piece.rawLA;
    if (!raw) {
      warnings.push(`${piece.code}: el CSV no trae las medidas crudas para comparar con el SVG.`);
      return { ...part, code: piece.code, match: "no-coincide" };
    }
    const [l, a] = raw;
    if (close(part.w, l) && close(part.h, a)) return { ...part, code: piece.code, match: "coincide" };
    if (close(part.w, a) && close(part.h, l)) return { ...part, code: piece.code, match: "rotada" };
    warnings.push(
      `Letra ${part.letter} (${piece.code}): el SVG mide ${part.w} × ${part.h} mm y el CSV ${l} × ${a} mm (crudas, ±${PART_TOLERANCE_MM} mm, en las dos orientaciones). El SVG no coincide con el CSV: ¿se exportó en otro momento?`,
    );
    return { ...part, code: piece.code, match: "no-coincide" };
  });

  for (const piece of ofMaterial) {
    const count = out.filter((p) => p.code === piece.code).length;
    if (count > piece.quantity) warnings.push(`${piece.code}: aparece ${count} veces en el SVG y el CSV dice ${piece.quantity}.`);
    else if (count < piece.quantity) notes.push(`${piece.code}: ${count} de ${piece.quantity} en esta placa (puede haber otra placa).`);
  }
  return { parts: out, warnings, notes };
}
