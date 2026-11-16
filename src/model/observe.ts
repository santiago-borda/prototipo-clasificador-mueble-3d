// Adapter del motor: .dae → Observation[] (ver observeCore.ts). Esta capa solo agrega `observeDae(bytes)`, que calcula el
// `modelId` con @/engine/hash (node:crypto): solo la usan el eval, el servidor y las pruebas, nunca un archivo "use client".
// El navegador usa `observeDaeWithId` (observeCore.ts) con `modelIdBrowser` (modelIdBrowser.ts).

import { modelId as modelIdOf } from "@/engine/hash";
import { observeDaeWithId, type DaeObservation } from "./observeCore";

export { OddEdgeTrianglesError, observeDaeWithId, type DaeObservation } from "./observeCore";

export function observeDae(bytes: Uint8Array): DaeObservation {
  return observeDaeWithId(bytes, modelIdOf(bytes));
}
