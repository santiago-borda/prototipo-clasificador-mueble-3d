// TP-61 (reescrita, docs/spec-adapter-observation-listadoid.md §2.4): el listado del PDF usa la función de
// listadoId del motor (§5.1 enmendada), sin función de hash propia en src/pdf/.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listadoId } from "@/engine/hash";
import type { ListadoRow } from "@/engine/types";
import { assertPublicable, toListing } from "@/pdf/listing";
import { validateFurniture } from "@/pdf/validate";
import { olmoDocuments } from "./helpers/pdfFixtures";

const ROOT = path.resolve(__dirname, "..");

describe("TP-61: listadoId reutiliza §5.1", () => {
  const listing = toListing("olmo", validateFurniture(olmoDocuments()));
  assertPublicable(listing);

  it("da el literal calculado aparte para el primer fixture", () => {
    // Calculado una vez fuera de src/engine/hash.ts (serialización propia del script + node:crypto), el 7/11.
    expect(listadoId(listing.pieces)).toBe("sha256:46d3cdea2a2f50362f98f8b09052a90f245c89802cd8aa959de588a7b538a2db");
  });

  it("es el mismo que el de las filas armadas a mano como ListadoRow", () => {
    const rows: ListadoRow[] = listing.pieces.map((p) => ({
      code: p.code,
      name: p.name,
      lengthMm: p.lengthMm,
      widthMm: p.widthMm,
      thicknessMm: p.thicknessMm,
      material: p.material,
      quantity: p.quantity,
      edgeBanding: p.edgeBanding,
      notes: p.notes,
    }));
    expect(listadoId(rows)).toBe(listadoId(listing.pieces));
  });

  // Excepción (decisión del equipo, 7/11): ocr/gate.ts hashea los bytes del PDF (pdfIdOf, compuerta de envío de la
  // spec de extracción), no el listado.
  const HASH_OF_PDF_BYTES = new Set([path.join("ocr", "gate.ts")]);

  it("ninguna función de hash del listado en src/pdf/; createHash solo en ocr/gate.ts (bytes del PDF)", () => {
    const dir = path.join(ROOT, "src", "pdf");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      if (HASH_OF_PDF_BYTES.has(file)) continue;
      expect(readFileSync(path.join(dir, file), "utf8"), file).not.toMatch(/createHash|node:crypto/);
    }
    expect(readFileSync(path.join(dir, "ocr", "gate.ts"), "utf8")).not.toMatch(/listado|canonical/i);
  });
});
