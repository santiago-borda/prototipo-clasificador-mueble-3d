// Fuente del fixture sintético (docs/spec-fixture-sintetico.md §3 y §4): datos FALSOS y geometría, escritos a mano.
// De acá salen el PDF (no se commitea), los elementos de texto ideales y la respuesta simulada de Vision.
// Lo esperado de cada documento está aparte, en esperado/*.json, escrito a mano y no generado desde este archivo.
//
// Marcas (§2): proyecto 9999, leyenda en cada página, prefijo "sintetico-" y /Subject. Ninguna habilita nada:
// la compuerta decide solo por sha256 (manifiesto.json).
//
// Las cifras del pie y del resumen se calcularon una vez a partir de las piezas y se copiaron acá:
// eficiencia = Σ L·A·cant / área del tablero; longitud de cortes = Σ cant·(L + A); número de cortes = 2 · piezas;
// tasa de llenado = Σ área de piezas / Σ área de tableros + 0,31 pp (distinta de la eficiencia, como en INV-13).

export type EdgeSlot = "s1" | "s2" | "s3" | "s4";

export interface FuentePieza {
  letter: string;
  code: string;
  /** Parte el código en dos renglones a partir de este carácter (ninguno: un renglón). */
  codeSplit?: number;
  /** Ícono dibujado junto al primer renglón del código (forma sin significado, §4). */
  icon?: boolean;
  nameLines: string[];
  quantity: number;
  finalL: number;
  finalA: number;
  edges: EdgeSlot[];
}

export interface FuenteTablero {
  /** Páginas del PDF que ocupa la hoja y cuántas filas van en cada una. */
  pages: number[];
  rowsPerPage: number[];
  lengthMm: number;
  widthMm: number;
  cutLengthM: number;
  efficiencyPct: number;
  /** Separación entre los centros s1-s2, s2-s3 y s3-s4, como fracción del ancho de página (§5: distintas). */
  edgeGaps: [number, number, number];
  pieces: FuentePieza[];
}

export interface FuenteDocumento {
  id: "S1" | "S2" | "S3";
  fileName: string;
  material: string;
  thicknessMm: number;
  /** Material del canto, para el texto "Canto <material> ~0 mm x 19 mm"; null sin columna de cantos. */
  edgeMaterial: string | null;
  /** Color del punto de la marca (el parser no lo lee). */
  edgeColor: [number, number, number] | null;
  columns: { adjusted: boolean; edgeStrips: boolean };
  summary: { fillRatePct: number; cutCount: number; cutLengthM: number; areaM2: number };
  boards: FuenteTablero[];
}

export const PAGE = { width: 595.32, height: 841.92 };
export const LEYENDA = "FIXTURE SINTÉTICO — NO ES DATO REAL";
export const SUBJECT = "fixture-sintetico/1";
export const PRODUCER = "fixture-sintetico";
export const GENERATED_AT = "01/01/2030 9:00am";
export const PROJECT = `${LEYENDA} - Mueble sintético.skp - Escena1`;
export const SETTINGS: [string, string][] = [
  ["Espesor de hoja de sierra", "3,2 mm"],
  ["Recorte", "5 mm"],
  ["Optimización", "Avanzada"],
];
export const EDGE_TEXT = { thickness: "~0 mm", widthMm: 19 };

/** Columnas de la tabla (x del centro, en pt) y tamaños de letra; imita lo medido (spec-esquema §8.2). */
export const GEOMETRIA = {
  no: 43,
  code: 63,
  cant: 151,
  adjL: 210,
  adjusted: 247,
  adjA: 284,
  finL: 340,
  finales: 365,
  finA: 390,
  tiras: 498,
  size: 7,
  nameSize: 6,
  edgeSize: 4.5,
  firstRowY: 500,
  continuationRowY: 70,
  rowStep: 60,
} as const;

const RED: [number, number, number] = [0.85, 0.1, 0.1];
const BLUE: [number, number, number] = [0.1, 0.25, 0.8];

export const FUENTE: FuenteDocumento[] = [
  {
    // Un tablero en dos páginas (pie solo en la última, continuación sin encabezado de tabla) y dos muebles.
    id: "S1",
    fileName: "sintetico-S1.pdf",
    material: "Gris Sintético",
    thicknessMm: 18,
    edgeMaterial: "Gris Sintético",
    edgeColor: RED,
    columns: { adjusted: true, edgeStrips: true },
    summary: { fillRatePct: 53.17, cutCount: 20, cutLengthM: 10.81, areaM2: 4.8 },
    boards: [
      {
        pages: [2, 3],
        rowsPerPage: [5, 2],
        lengthMm: 2610,
        widthMm: 1840,
        cutLengthM: 10.81,
        efficiencyPct: 52.86,
        edgeGaps: [0.06, 0.063, 0.065],
        pieces: [
          { letter: "A", code: "9999-91-M01-C01", nameLines: ["Lateral"], quantity: 2, finalL: 703, finalA: 487, edges: ["s1", "s2"] },
          { letter: "B", code: "9999-91-M01-C02", codeSplit: 8, icon: true, nameLines: ["Tapa superior"], quantity: 1, finalL: 913, finalA: 487, edges: ["s1", "s2", "s3", "s4"] },
          { letter: "C", code: "9999-91-M01-C03", nameLines: ["Estante interior", "regulable"], quantity: 2, finalL: 871, finalA: 293, edges: ["s2"] },
          { letter: "D", code: "9999-91-M01-C04", nameLines: ["Zócalo"], quantity: 1, finalL: 117, finalA: 871, edges: ["s3", "s4"] },
          { letter: "E", code: "9999-92-M01-C05", codeSplit: 8, nameLines: ["Puerta"], quantity: 2, finalL: 611, finalA: 397, edges: ["s1", "s2", "s3", "s4"] },
          { letter: "F", code: "9999-92-M01-C06", nameLines: ["Frente de cajón"], quantity: 1, finalL: 143, finalA: 577, edges: ["s1"] },
          { letter: "G", code: "9999-92-M01-C07", nameLines: ["Base"], quantity: 1, finalL: 577, finalA: 397, edges: [] },
        ],
      },
    ],
  },
  {
    // Tres tableros en 6 páginas (dos lotes de Vision); F repartida entre las hojas 1 y 3 con la misma letra.
    // Hoja 2: la página 5 solo tiene marcas en s1 y s4. Hoja 3: ninguna fila con dos marcas (paso de respaldo).
    id: "S2",
    fileName: "sintetico-S2.pdf",
    material: "Roble Sintético",
    thicknessMm: 18,
    edgeMaterial: "Roble Sintético",
    edgeColor: BLUE,
    columns: { adjusted: true, edgeStrips: true },
    summary: { fillRatePct: 31.05, cutCount: 70, cutLengthM: 25.24, areaM2: 14.22 },
    boards: [
      {
        pages: [2, 3],
        rowsPerPage: [5, 1],
        lengthMm: 2590,
        widthMm: 1830,
        cutLengthM: 10.19,
        efficiencyPct: 46.94,
        edgeGaps: [0.065, 0.058, 0.062],
        pieces: [
          { letter: "A", code: "9999-93-M01-C01", nameLines: ["Costado"], quantity: 2, finalL: 731, finalA: 451, edges: ["s1", "s2", "s4"] },
          { letter: "B", code: "9999-93-M01-C02", nameLines: ["Techo"], quantity: 1, finalL: 869, finalA: 451, edges: ["s1", "s2"] },
          { letter: "C", code: "9999-93-M01-C03", nameLines: ["Piso"], quantity: 1, finalL: 869, finalA: 451, edges: ["s2"] },
          { letter: "D", code: "9999-93-M01-C04", codeSplit: 8, nameLines: ["Estante"], quantity: 2, finalL: 833, finalA: 311, edges: ["s2", "s3"] },
          { letter: "E", code: "9999-93-M01-C05", nameLines: ["Travesaño", "trasero"], quantity: 2, finalL: 97, finalA: 833, edges: ["s1"] },
          { letter: "F", code: "9999-93-M01-C06", nameLines: ["Lateral de cajón"], quantity: 2, finalL: 389, finalA: 131, edges: ["s2"] },
        ],
      },
      {
        pages: [4, 5],
        rowsPerPage: [5, 2],
        lengthMm: 2590,
        widthMm: 1830,
        cutLengthM: 9.26,
        efficiencyPct: 36.31,
        edgeGaps: [0.062, 0.066, 0.059],
        pieces: [
          { letter: "G", code: "9999-93-M01-C07", nameLines: ["Puerta izquierda"], quantity: 1, finalL: 719, finalA: 409, edges: ["s1", "s2", "s3", "s4"] },
          { letter: "H", code: "9999-93-M01-C08", nameLines: ["Puerta derecha"], quantity: 1, finalL: 719, finalA: 409, edges: ["s1", "s2", "s3", "s4"] },
          { letter: "I", code: "9999-93-M01-C09", nameLines: ["Frente de cajón"], quantity: 3, finalL: 409, finalA: 157, edges: ["s1", "s2", "s3", "s4"] },
          { letter: "J", code: "9999-93-M01-C10", nameLines: ["Tapa de cajón"], quantity: 2, finalL: 413, finalA: 157, edges: ["s1", "s2"] },
          { letter: "K", code: "9999-93-M01-C11", nameLines: ["Base de mueble"], quantity: 1, finalL: 841, finalA: 389, edges: ["s2"] },
          { letter: "L", code: "9999-93-M01-C12", nameLines: ["Divisor"], quantity: 2, finalL: 377, finalA: 293, edges: ["s1", "s4"] },
          { letter: "M", code: "9999-93-M01-C13", nameLines: ["Repisa"], quantity: 2, finalL: 563, finalA: 233, edges: ["s1", "s4"] },
        ],
      },
      {
        pages: [6],
        rowsPerPage: [4],
        lengthMm: 2590,
        widthMm: 1830,
        cutLengthM: 5.79,
        efficiencyPct: 8.98,
        edgeGaps: [0.067, 0.06, 0.063],
        pieces: [
          { letter: "F", code: "9999-93-M01-C06", nameLines: ["Lateral de cajón"], quantity: 4, finalL: 389, finalA: 131, edges: ["s2"] },
          { letter: "N", code: "9999-93-M01-C14", nameLines: ["Refuerzo"], quantity: 3, finalL: 541, finalA: 83, edges: ["s3"] },
          { letter: "O", code: "9999-93-M01-C15", nameLines: ["Listón"], quantity: 2, finalL: 611, finalA: 59, edges: ["s4"] },
          { letter: "P", code: "9999-93-M01-C16", nameLines: ["Taco"], quantity: 4, finalL: 71, finalA: 53, edges: [] },
        ],
      },
    ],
  },
  {
    // Fondos de 3 mm: solo "Finales". La ausencia de "Ajustadas" y "Tiras de cantos" es "no exportado", no "sin canto".
    id: "S3",
    fileName: "sintetico-S3.pdf",
    material: "Fondo Sintético",
    thicknessMm: 3,
    edgeMaterial: null,
    edgeColor: null,
    columns: { adjusted: false, edgeStrips: false },
    summary: { fillRatePct: 26.26, cutCount: 8, cutLengthM: 4.36, areaM2: 4.74 },
    boards: [
      {
        pages: [2],
        rowsPerPage: [3],
        lengthMm: 2590,
        widthMm: 1830,
        cutLengthM: 4.36,
        efficiencyPct: 25.95,
        edgeGaps: [0.066, 0.066, 0.066],
        pieces: [
          { letter: "A", code: "9999-91-M01-C08", nameLines: ["Fondo"], quantity: 1, finalL: 891, finalA: 683, edges: [] },
          { letter: "B", code: "9999-92-M01-C09", nameLines: ["Fondo de cajón"], quantity: 2, finalL: 541, finalA: 367, edges: [] },
          { letter: "C", code: "9999-92-M01-C10", nameLines: ["Fondo trasero"], quantity: 1, finalL: 577, finalA: 389, edges: [] },
        ],
      },
    ],
  },
];
