// Prueba de humo del runner (R2, M20; docs/spec-t5-runner-eval.md §3): con vite-node, fuera de vitest, se resuelve el
// alias @/ y observeDae corre en Node con el DOM de installDom(). Solo el primer fixture; nada del segundo.
// Imprime solo el conteo (T5-E2: observeDae devuelve DaeObservation).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { observeDae } from "@/model/observe";
import { installDom } from "./dom";

installDom();
const dae = fileURLToPath(new URL("../public/models/Olmo/olmo.dae", import.meta.url));
const { observations } = observeDae(new Uint8Array(readFileSync(dae)));
console.log(`observaciones: ${observations.length}`);
