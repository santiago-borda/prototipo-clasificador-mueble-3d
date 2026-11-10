// R3 (docs/spec-t5-runner-eval.md §4): se corre con vite-node desde tests/eval/runner.test.ts, en un proceso aparte.
// Llama a indexDae SIN installDom(): en Node no hay DOMParser global y tiene que fallar con
// "ReferenceError: DOMParser is not defined". No es una prueba de vitest (no termina en .test.ts).

import { indexDae } from "@/model/daeIndex";

indexDae('<?xml version="1.0"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"/>');
console.log("indexDae corrió sin DOMParser: no debería pasar");
