// S2A-7: `modelId` (sha256 de los bytes con `\r\n` -> `\n`, `@/engine/hash`) de `public/models/Olmo/olmo.dae`.
// Es una constante para que la semilla no lea el .dae con `fs` en ejecución (en Vercel `public/` no llega al servidor).
// S2A PB-17 (`tests/persistence/s2a.test.ts`) verifica que coincide con el archivo real: si cambia el .dae, cambia esto.

export const OLMO_MODEL_ID = "sha256:c0e1cce1d88a32c4fbc5675b34a10675ac2bdf5faec97ff59bcf0f384ea8748d";
