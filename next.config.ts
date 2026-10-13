import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite abrir el dev server desde el celular por la IP de la LAN
  // (hostnames: un "*" = una etiqueta). Ajustar si tu red usa otro rango.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
