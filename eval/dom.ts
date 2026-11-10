// DOM del eval (docs/spec-t5-runner-eval.md §3; plan T5, M20; spec-motor §4a y §13 "jsdom").
//
// Por qué existe: el eval corre con vite-node, fuera de vitest, y vite-node no aplica `test.environment: "jsdom"`
// de vitest.config.ts. En Node pelado no hay DOMParser: sin installDom(), `indexDae` (src/model/daeIndex.ts) falla con
// "ReferenceError: DOMParser is not defined" (verificado el 10/11 con tests/eval/sinDom.ts, prueba R3).
// `namedColladaLoader.ts` usa además XMLSerializer. `document`: aun con `skipTextures`, ColladaLoader crea las texturas
// con ImageLoader, que llama a `document.createElementNS`; sin él, observeDae sobre el primer fixture falla con
// "ReferenceError: document is not defined" (verificado el 10/11).
//
// Se toma el jsdom del repo, el MISMO que usa vitest (R1): así el eval y la suite parsean el .dae igual.
// Globales: solo DOMParser, XMLSerializer y document. Si una corrida real pide otro, se agrega acá y se anota
// abajo con el error que lo pidió. No se agregan "por las dudas".
//   (ninguno hasta ahora: alias-check corre observeDae sobre el primer fixture con estos tres)

import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

let installed: { jsdomVersion: string } | null = null;

/** Crea UN JSDOM y asigna a globalThis DOMParser, XMLSerializer y document. Idempotente: la segunda llamada no hace nada. */
export function installDom(): { jsdomVersion: string } {
  if (installed) return installed;
  const { window } = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.DOMParser = window.DOMParser;
  globalThis.XMLSerializer = window.XMLSerializer;
  globalThis.document = window.document;
  const { version } = createRequire(import.meta.url)("jsdom/package.json") as { version: string };
  installed = { jsdomVersion: version };
  return installed;
}
