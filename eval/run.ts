// `npm run eval` (docs/spec-t5-runner-eval.md §3; plan T5). Esqueleto: instala el DOM, imprime la versión de jsdom y
// sale con 0. Casos, gate, reporte y publicación los suma T11.

import { installDom } from "./dom";

const { jsdomVersion } = installDom();
console.log(`jsdom ${jsdomVersion}`);
