import fs from "node:fs";
import path from "node:path";

// Fixtures del importador de prueba (solo Olmo; ver docs/spec-importador-prueba.md, I12).
export const LISTADO_M01 = "listado_olmo_m01.csv";
export const LISTADO_V2_DESAJUSTE = "listado_olmo_v2_desajuste.csv";

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

// Los fixtures son CSV simples: separador `,` y ningún campo entre comillas ni con comas adentro.
// Convención de filas (la misma que usa el informe): la fila 1 es el encabezado y la 2, la primera pieza (C01).
const lines = (text: string) => text.split(/\r?\n/);
const cells = (line: string) => line.split(",");

/** Cambia el valor de una celda: `row` es la fila del archivo (1 = encabezado), `column` el nombre de la columna. */
export function editCell(text: string, row: number, column: string, value: string): string {
  const all = lines(text);
  const col = cells(all[0]).indexOf(column);
  if (col < 0) throw new Error(`El fixture no tiene la columna ${column}.`);
  const parts = cells(all[row - 1]);
  parts[col] = value;
  all[row - 1] = parts.join(",");
  return all.join("\n");
}

/** Lee el valor de una celda (mismas filas que `editCell`). */
export function readCell(text: string, row: number, column: string): string {
  const all = lines(text);
  return cells(all[row - 1])[cells(all[0]).indexOf(column)];
}

export function dropColumn(text: string, column: string): string {
  const col = cells(lines(text)[0]).indexOf(column);
  if (col < 0) throw new Error(`El fixture no tiene la columna ${column}.`);
  return lines(text)
    .map((line) => cells(line).filter((_, i) => i !== col).join(","))
    .join("\n");
}

export function addColumn(text: string, column: string, value: string): string {
  return lines(text)
    .map((line, i) => (line === "" ? line : `${line},${i === 0 ? column : value}`))
    .join("\n");
}

/** El mismo CSV con `;` como separador y coma decimal (`0,22`), como lo guarda Excel en configuración regional es-AR. */
export function toSemicolonWithDecimalComma(text: string): string {
  return lines(text)
    .map((line) => line.replaceAll(",", ";").replace(/(\d)\.(\d)/g, "$1,$2"))
    .join("\n");
}
