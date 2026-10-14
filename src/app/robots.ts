import type { MetadataRoute } from "next";

// Prototipo abierto pero no indexable (ver también X-Robots-Tag en next.config.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
