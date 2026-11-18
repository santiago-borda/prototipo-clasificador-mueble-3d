// S2A, PB-14: captura de los datos que recibe la ficha (el `QrTarget` que /p/<qrId> pasa a `QrSheets`) para los
// 21 tipos de pieza del primer fixture, hecha con `src/lib/lookup.ts` ANTES de la enmienda (docs/spec-s2a-app-lee-base.md §4).
// Se corre una sola vez y el resultado se commitea solo, para que el diff demuestre que no se ajustó después:
//   npx vite-node -c vitest.config.ts tests/fixtures/s2a/capturar-ficha.ts
// El `def` va una vez (es el mismo objeto en los 21 destinos); cada entrada lleva el resto del `QrTarget`.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { olmoDef } from "@/data/furniture.mock";
import { resolveQr } from "@/lib/lookup";

const entries = olmoDef.pieceTypes.map((piece) => {
  const target = resolveQr(piece.qrId);
  if (!target || target.kind !== "piece") throw new Error(`El qrId ${piece.qrId} no resuelve a una pieza.`);
  if (target.def !== olmoDef) throw new Error(`El qrId ${piece.qrId} resuelve a otro mueble.`);
  const { def: _def, ...rest } = target;
  return rest;
});

const out = path.join(process.cwd(), "tests", "fixtures", "s2a", "ficha-olmo.json");
writeFileSync(out, `${JSON.stringify({ def: olmoDef, entries }, null, 2)}\n`);
console.log(`PB-14: ${entries.length} tipos de pieza capturados en ${path.relative(process.cwd(), out)}.`);
