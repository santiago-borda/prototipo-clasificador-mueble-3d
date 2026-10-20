import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Sabrina vive en una carpeta ignorada por git (ver CLAUDE.md). Turbopack falla el build si un `require`
// apunta a un archivo que no existe, aunque esté en try/catch, así que el alias decide a qué módulo se resuelve.
const sabrinaPresente = existsSync("./Sabrina/data/sabrina.def.ts");
const sabrinaDefAlias = sabrinaPresente
  ? "./Sabrina/data/sabrina.def.ts"
  : "./src/data/optional/sabrinaStub.ts";

const nextConfig: NextConfig = {
  // Permite abrir el dev server desde el celular por la IP de la LAN
  // (hostnames: un "*" = una etiqueta). Ajustar si tu red usa otro rango.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Prototipo de acceso abierto a propósito, pero que no lo indexen los buscadores.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  turbopack: {
    resolveAlias: { "optional-sabrina-def": sabrinaDefAlias },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
