// Sirve el .dae de Sabrina SOLO en local, para el visor. Sus datos y su modelo no se suben al repo
// (titularidad y uso pendientes): viven en la carpeta ignorada `Sabrina/`.
// Sin `NEXT_PUBLIC_ENABLE_SABRINA=1` (Vercel, clon limpio) o sin el archivo, responde 404.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const NOT_AVAILABLE = () => new Response("Modelo no disponible.", { status: 404 });

export async function GET() {
  if (process.env.NEXT_PUBLIC_ENABLE_SABRINA !== "1") return NOT_AVAILABLE();

  try {
    const dir = path.join(process.cwd(), "Sabrina", "Archivo Collada");
    const daes = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".dae"));
    if (daes.length !== 1) return NOT_AVAILABLE(); // se espera exactamente un .dae
    const body = await readFile(path.join(dir, daes[0]));
    return new Response(body, {
      headers: { "Content-Type": "model/vnd.collada+xml", "Cache-Control": "no-store" },
    });
  } catch {
    return NOT_AVAILABLE();
  }
}
