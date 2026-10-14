import { resolveQr } from "@/lib/lookup";

/**
 * Del texto de un QR escaneado al qrId de una ficha. Acepta la URL completa de la etiqueta
 * (`https://host/p/olmo-c04`) o el qrId suelto. null si no corresponde a nada del mueble.
 */
export function qrIdFromScan(text: string): string | null {
  const raw = text.trim();
  let candidate = raw;
  try {
    const match = /^\/p\/([^/?#]+)/.exec(new URL(raw).pathname);
    if (match) candidate = decodeURIComponent(match[1]);
  } catch {
    // no es una URL: se prueba como qrId suelto
  }
  return resolveQr(candidate) ? candidate : null;
}
