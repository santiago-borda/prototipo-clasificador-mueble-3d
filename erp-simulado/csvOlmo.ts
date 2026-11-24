// «Listado de piezas» del Olmo con el formato del CSV de OpenCutList 7.1.0 en español (docs/spec-importador-csv-envio.md
// §2), armado desde `olmoDef`. Lo sirve el ERP simulado como `piezas.csv`. No es código de la app.
//
// Mismas columnas, separador (`;`), BOM, CRLF y forma de las celdas que el fixture real del gabinete
// (tests/fixtures/csv-ocl/gabinete/gabinete-prueba-canto.csv). Cantos: Long. borde 1 = inferior = largo-B,
// Long. borde 2 = superior = largo-A, Ancho borde 1 = izquierdo = corto-A, Ancho de borde 2 = derecho = corto-B
// (README del fixture). Una fila `Canto` por lado con canto, con la cantidad de la pieza y el largo del lado.
//
// ASUMIDO: el componente C01 del .dae se llama `_0001-01-M01-C01__`; acá va ya normalizado, porque no sabemos qué
// escribe OpenCutList para ese componente (IC-I1). El canto del Olmo es ABS 22 x 0,22 (consulta 32); OpenCutList
// redondea el espesor a un decimal (0,2).

import type { EdgeId, PieceType } from "@/data/types";
import { pieceTypes } from "@/data/furniture.mock";

const ENCABEZADO = [
  "No.", "Designación", "Cantidad", "Longitud - cruda", "Ancho - crudo", "Espesor - crudo", "Longitud", "Anchura", "Grosor",
  "Area - final", "Tipo de material", "Nombre del material", "Descripción del material", "URL del material",
  "Nombres de instancias", "Descripción", "URL", "Etiquetas", "Longitud del borde 1", "Longitud del borde 2",
  "Ancho del borde 1", "Ancho de borde 2", "Frente", "Dorso", "Etiquetas",
];

/** Columna de borde de cada lado, en el orden s1 a s4. */
const BORDES: readonly { lado: EdgeId; columna: string; mide: "largo" | "ancho" }[] = [
  { lado: "largo-B", columna: "Longitud del borde 1", mide: "largo" },
  { lado: "largo-A", columna: "Longitud del borde 2", mide: "largo" },
  { lado: "corto-A", columna: "Ancho del borde 1", mide: "ancho" },
  { lado: "corto-B", columna: "Ancho de borde 2", mide: "ancho" },
];

const mm = (n: number, decimales = 1) => `${n.toFixed(decimales).replace(".", ",")} mm`;
const celda = (c: string) => (/[";]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
const fila = (celdas: readonly string[]) => celdas.map(celda).join(";");
const cantoDe = (material: string) => (/gaud/i.test(material) ? "Canto_Gaudi" : "Canto_Blanco");

export interface OpcionesCsvOlmo {
  /** Cambia la Designación de un código (para la variante con problemas). */
  designacion?: Partial<Record<string, string>>;
  /** Cambia la Cantidad de un código. */
  cantidad?: Partial<Record<string, string>>;
}

export function csvOlmo(opciones: OpcionesCsvOlmo = {}): string {
  const piezas: string[] = [];
  const cantos: string[] = [];
  const letras = new Map<string, number>();
  const letra = (material: string) => {
    const n = letras.get(material) ?? 0;
    letras.set(material, n + 1);
    return String.fromCharCode(65 + (n % 26));
  };
  let letraCanto = 0;

  pieceTypes.forEach((p: PieceType) => {
    const banda = p.edgeBanding ?? [];
    const canto = `${cantoDe(p.material)} (0,2 mm x 22,0 mm)`;
    const area = `${((p.lengthMm * p.widthMm) / 1e6).toFixed(2).replace(".", ",")} m²`;
    const designacion = opciones.designacion?.[p.code] ?? p.code;
    piezas.push(
      fila([
        letra(p.material), designacion, opciones.cantidad?.[p.code] ?? String(p.quantity),
        mm(p.lengthMm), mm(p.widthMm), mm(p.thicknessMm), mm(p.lengthMm), mm(p.widthMm), mm(p.thicknessMm),
        area, "Tablero", p.material, "", "", "", p.name, "", "",
        ...BORDES.map((b) => (banda.includes(b.lado) ? canto : "")),
        "", "", "Layer0",
      ]),
    );
    for (const b of BORDES) {
      if (!banda.includes(b.lado)) continue;
      const largo = b.mide === "largo" ? p.lengthMm : p.widthMm;
      cantos.push(
        fila([
          String.fromCharCode(65 + (letraCanto++ % 26)), `${designacion} - ${b.columna}`, String(p.quantity),
          mm(largo), "22,0 mm", "0,2 mm", mm(largo), "22,0 mm", "0,2 mm",
          "", "Canto", cantoDe(p.material), "", "", "", "", "", "", "", "", "", "", "", "", "",
        ]),
      );
    }
  });
  return "﻿" + [fila(ENCABEZADO), ...piezas, ...cantos].join("\r\n") + "\r\n";
}

/** Variante «CSV con problemas»: C01 con guiones bajos de más y C05 con cantidad no entera. */
export function csvOlmoConProblemas(): string {
  return csvOlmo({ designacion: { "0001-01-M01-C01": "_0001-01-M01-C01__" }, cantidad: { "0001-01-M01-C05": "2,5" } });
}
