import path from "node:path";
import { defineConfig } from "vitest/config";

// Pruebas del prototipo (una por criterio de aceptación, ver tests/*.test.ts).
// jsdom: ColladaLoader necesita DOMParser; no hace falta navegador ni WebGL.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
