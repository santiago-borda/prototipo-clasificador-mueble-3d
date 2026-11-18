// C12 y condiciones de las pantallas del spike (docs/spec-proto-csv-ocl.md §4). Puras y estáticas: la interacción en
// el navegador se verifica a mano (capturas) y en M1.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { observeDae } from "@/model/observe";
import { CSV_REJECTIONS } from "@/proto-csv/reasons";
import { parseOclCsv } from "@/proto-csv/parse";
import { PREVIEW_MARK, QR_TEST_BASE, qrPreview } from "@/proto-csv/labels";
import { DERIVED_REASONS, SOFT_REASONS, approveBlockers, reviewListing } from "@/proto-csv/review";
import { REJECTION_TEXT, formatFecha, reasonText } from "@/proto-csv/texts";

const ROOT = path.resolve(__dirname, "..", "..");
const DIR = path.join(ROOT, "tests", "fixtures", "csv-ocl", "gabinete");
const parsed = parseOclCsv(readFileSync(path.join(DIR, "gabinete-prueba-canto.csv"), "utf8"));
if (!parsed.ok) throw new Error("fixture");
const filesUnder = (dir: string) =>
  readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => path.join(ROOT, dir, f));
/** Código sin comentarios (los comentarios pueden nombrar lo que NO se usa). */
const codeOnly = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const SCREEN_FILES = [...filesUnder("src/proto-csv"), ...filesUnder("src/components/proto-csv"), ...filesUnder("src/app/backoffice"), ...filesUnder("src/app/api/proto-csv")];

describe("C12: QR (solo texto) y etiquetas", () => {
  const previews = qrPreview("0123abcd", parsed.listing.pieces);
  const labels = previews.flatMap((p) => p.labels);

  it("un QR por tipo, con URL de prueba como texto", () => {
    expect(previews.map((p) => p.qrUrlText)).toEqual([
      `${QR_TEST_BASE}0123abcd-c01`,
      `${QR_TEST_BASE}0123abcd-c02`,
      `${QR_TEST_BASE}0123abcd-c03`,
      `${QR_TEST_BASE}0123abcd-c04`,
    ]);
    expect(QR_TEST_BASE).toBe("https://taller-test.casamueble.com.ar/q/");
  });

  it("5 etiquetas (una por pieza física), todas con «VISTA PREVIA — NO SE IMPRIME»", () => {
    expect(labels.map((l) => l.title)).toEqual(["C01 · 1/2", "C01 · 2/2", "C02 · 1/1", "C03 · 1/1", "C04 · 1/1"]);
    expect(labels.every((l) => l.mark === PREVIEW_MARK && PREVIEW_MARK === "VISTA PREVIA — NO SE IMPRIME")).toBe(true);
    expect(labels[0]).toMatchObject({ dims: "700 × 400 × 18 mm", material: "Blanco 18", edges: "Canto: superior, izquierdo" });
    expect(labels[4].edges).toBe("Sin canto");
  });

  it("sin imagen de QR: ningún archivo del spike importa qrcode ni dibuja un QR", () => {
    for (const file of SCREEN_FILES) expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["']qrcode["']|toDataURL|toCanvas/);
  });

  it("el dominio de prueba aparece solo como texto en labels.ts (ni en la config de Next ni en otro archivo del spike)", () => {
    const withDomain = SCREEN_FILES.filter((f) => readFileSync(f, "utf8").includes("taller-test.casamueble.com.ar"));
    expect(withDomain.map((f) => path.relative(ROOT, f).replace(/\\/g, "/"))).toEqual(["src/proto-csv/labels.ts"]);
    expect(readFileSync(path.join(ROOT, "next.config.ts"), "utf8")).not.toContain("casamueble");
  });
});

describe("v0.5: sin clave en el spike", () => {
  it("ningún archivo del spike manda x-import-key, lee IMPORT_UPLOAD_KEY ni tiene campo de clave", () => {
    for (const file of SCREEN_FILES) expect(codeOnly(file), file).not.toMatch(/x-import-key|IMPORT_UPLOAD_KEY|uploadKey|KeyField|keyStore|guard\(/);
    expect(existsSync(path.join(ROOT, "src/components/proto-csv/KeyField.tsx"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/proto-csv/keyStore.ts"))).toBe(false);
  });
});

describe("Nada del spike en el bundle ni en el navegador", () => {
  it("ningún archivo del spike usa NEXT_PUBLIC_*, localStorage, sessionStorage ni cookies", () => {
    for (const file of SCREEN_FILES) {
      expect(codeOnly(file), file).not.toMatch(/NEXT_PUBLIC_|localStorage|sessionStorage|document\.cookie/);
    }
  });

  it("la página del backoffice solo pasa un booleano al cliente (hay store)", () => {
    const page = readFileSync(path.join(ROOT, "src/app/backoffice/csv/page.tsx"), "utf8");
    expect(page).toMatch(/configured=\{protoApiFromEnv\(process\.env\)\.configured\}/);
    expect(page).not.toMatch(/IMPORT_UPLOAD_KEY/);
  });
});

describe("Aprobar deshabilitado con el motivo escrito", () => {
  const dae = observeDae(new Uint8Array(readFileSync(path.join(DIR, "gabinete-prueba-opencutlist.dae"))));

  it("gabinete limpio: sin motivos", () => {
    expect(approveBlockers(reviewListing(parsed.listing, dae, 2), parsed.listing.status)).toEqual([]);
  });

  it("dudosas, huérfanas, filas sin código y borrador, en texto", () => {
    expect(approveBlockers({ dudosas: 1, orphanInstances: [], unkeyedRows: 0 }, "publicable")).toEqual(["1 pieza dudosa."]);
    expect(approveBlockers({ dudosas: 2, orphanInstances: [{ instanceKey: "k", rawName: null, reasons: [] }], unkeyedRows: 3 }, "borrador")).toEqual([
      "2 piezas dudosas.",
      "1 instancia del .dae sin fila en el CSV.",
      "3 filas del CSV sin código.",
    ]);
    expect(approveBlockers({ dudosas: 0, orphanInstances: [], unkeyedRows: 0 }, "borrador")).toEqual(["El listado del CSV quedó como borrador."]);
  });
});

describe("Cada rechazo de carga dice qué exportar o corregir", () => {
  it.each(CSV_REJECTIONS.map((r) => [r]))("%s tiene título y un paso concreto", (reason) => {
    const text = REJECTION_TEXT[reason];
    expect(text.title.length).toBeGreaterThan(10);
    expect(text.fix).toMatch(/OpenCutList|SketchUp/);
  });

  it("los tres casos pedidos nombran la opción o el menú exacto", () => {
    expect(REJECTION_TEXT["lista-de-instancias"].fix).toContain("«Listado de piezas»");
    expect(REJECTION_TEXT["columna-faltante"].fix).toContain("«ocultar la columna de cantos»");
    expect(REJECTION_TEXT["unidad-no-soportada"].fix).toContain("milímetros");
  });
});

describe("Fechas: 24 horas y con zona horaria", () => {
  it.each([
    ["2026-11-16T19:55:09Z", "16/11/2026 16:55:09 (America/Buenos_Aires)"],
    ["2026-11-17T03:00:00Z", "17/11/2026 00:00:00 (America/Buenos_Aires)"], // medianoche: 00, no 24 ni 12 a. m.
    ["2026-11-17T02:59:59Z", "16/11/2026 23:59:59 (America/Buenos_Aires)"],
  ])("%s → %s", (iso, expected) => {
    expect(formatFecha(iso)).toBe(expected);
  });

  it("con otra zona la escribe", () => {
    expect(formatFecha("2026-11-16T19:55:09Z", "UTC")).toBe("16/11/2026 19:55:09 (UTC)");
  });

  it("ninguna pantalla del spike usa toLocaleString/toLocaleDateString/toLocaleTimeString", () => {
    for (const file of SCREEN_FILES) expect(codeOnly(file), file).not.toMatch(/toLocale(Date|Time)?String/);
  });
});

describe("v0.4: textos de las razones blandas", () => {
  it.each(SOFT_REASONS)("%s tiene texto en lenguaje claro (no el código)", (reason) => {
    expect(reasonText(reason)).not.toBe(reason);
    expect(reasonText(reason).length).toBeGreaterThan(15);
  });
  it.each(DERIVED_REASONS)("la derivada %s tiene texto", (reason) => {
    expect(reasonText(reason)).not.toBe(reason);
  });
});
