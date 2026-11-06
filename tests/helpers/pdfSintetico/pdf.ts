// Escritor de PDF 1.4 mínimo y determinista para el fixture sintético (docs/spec-fixture-sintetico.md §7).
// Solo operadores de trazado (m, l, c, re, f, S); sin /Font, sin fecha de creación y sin /ID: el mismo layout da
// siempre los mismos bytes. Sin dependencias.

import { PAGE, PRODUCER, SUBJECT } from "../../fixtures/pdf-sintetico/fuente";
import { ADVANCE, type Layout, type Shape, type TextItem } from "./layout";
import { glyph } from "./strokeFont";

/** Número con hasta 2 decimales, sin ceros de más: mismo texto en cualquier máquina. */
const n = (value: number) => {
  const fixed = (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
  return fixed === "-0" ? "0" : fixed;
};
/** De y hacia abajo (layout) a y hacia arriba (PDF). */
const py = (y: number) => PAGE.height - y;

function drawText(item: TextItem): string {
  const unit = item.size / 10;
  const out: string[] = [`${n(item.size * 0.07)} w`];
  [...item.text].forEach((char, i) => {
    const originX = item.x + i * ADVANCE * item.size;
    for (const stroke of glyph(char)) {
      // La grilla del glifo tiene 4 de ancho dentro de un avance de 6: 1 de margen a la izquierda.
      const points = stroke.map(([gx, gy]) => `${n(originX + (1 + gx) * unit)} ${n(py(item.y + gy * unit))}`);
      if (points.length === 1) points.push(points[0]);
      out.push(`${points[0]} m ${points.slice(1).map((p) => `${p} l`).join(" ")} S`);
    }
  });
  return out.join("\n");
}

/** Círculo con 4 curvas de Bézier. */
function circle(cx: number, cy: number, r: number): string {
  const k = 0.5523 * r;
  const x = cx;
  const y = py(cy);
  return [
    `${n(x + r)} ${n(y)} m`,
    `${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${n(x)} ${n(y + r)} c`,
    `${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${n(y)} c`,
    `${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${n(x)} ${n(y - r)} c`,
    `${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${n(y)} c`,
  ].join(" ");
}

function drawShape(shape: Shape): string {
  switch (shape.kind) {
    case "dot":
      return `q ${shape.color.map(n).join(" ")} rg ${circle(shape.cx, shape.cy, shape.r)} f Q`;
    case "rect":
      return `q 0.5 w ${n(shape.x)} ${n(py(shape.y + shape.h))} ${n(shape.w)} ${n(shape.h)} re S Q`;
    case "icon": {
      // Rombo relleno gris: una forma sin significado (el PDF real trae íconos dibujados, RP4).
      const y = py(shape.cy);
      return `q 0.45 g ${n(shape.cx)} ${n(y + shape.r)} m ${n(shape.cx + shape.r)} ${n(y)} l ${n(shape.cx)} ${n(y - shape.r)} l ${n(shape.cx - shape.r)} ${n(y)} l f Q`;
    }
    case "line":
      return `q 0.4 w ${n(shape.x0)} ${n(py(shape.y0))} m ${n(shape.x1)} ${n(py(shape.y1))} l S Q`;
  }
}

function pageContent(layout: Layout, page: number): string {
  const parts = ["0 g 0 G 1 J 1 j"];
  for (const shape of layout.shapes) if (shape.page === page) parts.push(drawShape(shape));
  for (const text of layout.texts) if (text.page === page) parts.push(drawText(text));
  return `${parts.join("\n")}\n`;
}

const ascii = (text: string) => {
  if (!/^[\x20-\x7e\n]*$/.test(text)) throw new Error("El PDF sintético solo lleva ASCII fuera de los glifos dibujados.");
  return text;
};

export function writePdf(layout: Layout): Uint8Array {
  const pages = Array.from({ length: layout.pageCount }, (_, i) => i + 1);
  // 1 catálogo, 2 páginas, 3 info; después, por página: objeto página y su contenido.
  const objects: string[] = [];
  const pageObject = (i: number) => 4 + i * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObject(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Producer (${PRODUCER}) /Subject (${SUBJECT}) /Title (${layout.doc.fileName.replace(/\.pdf$/, "")}) >>`;
  pages.forEach((page, i) => {
    const content = pageContent(layout, page);
    objects[pageObject(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PAGE.width)} ${n(PAGE.height)}] /Resources << >> /Contents ${pageObject(i) + 1} 0 R >>`;
    objects[pageObject(i) + 1] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(ascii(out));
}
