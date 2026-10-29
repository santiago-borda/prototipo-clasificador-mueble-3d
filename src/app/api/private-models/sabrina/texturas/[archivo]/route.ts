// Sirve las texturas de Sabrina SOLO en local (mismo criterio que el .dae, ver ../../route.ts): viven en la
// carpeta ignorada `Sabrina/Archivo Collada/Texturas`. Sin `NEXT_PUBLIC_ENABLE_SABRINA=1` o sin el archivo, 404.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const NOT_AVAILABLE = () => new Response("Textura no disponible.", { status: 404 });
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

export async function GET(_request: Request, { params }: { params: Promise<{ archivo: string }> }) {
  if (process.env.NEXT_PUBLIC_ENABLE_SABRINA !== "1") return NOT_AVAILABLE();

  const { archivo } = await params;
  const name = path.basename(archivo); // nada de "../": solo archivos de la carpeta
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type || name !== archivo) return NOT_AVAILABLE();

  try {
    const body = await readFile(path.join(process.cwd(), "Sabrina", "Archivo Collada", "Texturas", name));
    return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  } catch {
    return NOT_AVAILABLE();
  }
}
