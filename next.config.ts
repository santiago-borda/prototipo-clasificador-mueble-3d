import { existsSync } from "node:fs";
import type { NextConfig } from "next";
import { origenesDelEntorno, reglasDeFraming } from "./src/lib/embebido/origenes";

// Sabrina vive en una carpeta ignorada por git (ver CLAUDE.md). Turbopack falla el build si un `require`
// apunta a un archivo que no existe, aunque esté en try/catch, así que el alias decide a qué módulo se resuelve.
const sabrinaPresente = existsSync("./Sabrina/data/sabrina.def.ts");
const sabrinaDefAlias = sabrinaPresente
  ? "./Sabrina/data/sabrina.def.ts"
  : "./src/data/optional/sabrinaStub.ts";

// IE-10: se valida al cargar la configuración (build, dev y start): con un comodín, algo que no es un origen o
// http en producción, Next no arranca. Las cabeceras quedan fijas en el build: cambiar la lista exige rebuild.
const origenesErp = origenesDelEntorno();

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
      // IE-10: solo /embebido/* se puede embeber, y solo desde ERP_FRONT_ORIGENES; el resto, frame-ancestors 'none'.
      ...reglasDeFraming(origenesErp),
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
