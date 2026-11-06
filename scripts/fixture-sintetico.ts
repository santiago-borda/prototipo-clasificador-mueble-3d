// npm run fixture:sintetico [-- --actualizar]
// Genera los PDF del fixture sintético en .fixtures-gen/ (ignorada por git: los PDF no se commitean, TP-72) y
// verifica sus sha256 contra tests/fixtures/pdf-sintetico/manifiesto.json. Con --actualizar reescribe el manifiesto
// (solo después de cambiar a propósito la fuente o el generador; revisar el diff). Sin red.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SUBJECT } from "../tests/fixtures/pdf-sintetico/fuente";
import { buildAll } from "../tests/helpers/pdfSintetico/outputs";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".fixtures-gen");
const MANIFEST = path.join(ROOT, "tests", "fixtures", "pdf-sintetico", "manifiesto.json");

interface Manifest {
  synthetic: true;
  subject: string;
  files: { id: string; fileName: string; pages: number; sha256: string }[];
}

const built = buildAll();
mkdirSync(OUT, { recursive: true });
for (const s of built) writeFileSync(path.join(OUT, s.doc.fileName), s.pdf);
const current: Manifest = {
  synthetic: true,
  subject: SUBJECT,
  files: built.map((s) => ({ id: s.doc.id, fileName: s.doc.fileName, pages: s.layout.pageCount, sha256: s.pdfId })),
};

if (process.argv.includes("--actualizar")) {
  writeFileSync(MANIFEST, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Manifiesto actualizado: ${current.files.length} PDF en ${path.relative(ROOT, OUT)}/.`);
} else {
  const saved = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  const mismatches = current.files.filter((file) => saved.files.find((s) => s.id === file.id)?.sha256 !== file.sha256);
  for (const file of current.files) console.log(`${file.fileName}: ${file.pages} páginas, ${mismatches.includes(file) ? "sha256 DISTINTO del manifiesto" : "sha256 OK"}`);
  if (mismatches.length > 0 || saved.files.length !== current.files.length) process.exit(1);
}
