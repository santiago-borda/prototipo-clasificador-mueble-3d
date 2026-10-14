import type { NextConfig } from "next";

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
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
