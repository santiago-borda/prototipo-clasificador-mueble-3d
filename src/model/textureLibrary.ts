// Dónde está la imagen de cada textura. El .dae dice qué imagen usa cada material (`Blanco_nature.png`,
// `GAUDI.jpeg`, ver `readMaterialImages`); acá se busca esa imagen por nombre, sin extensión ni mayúsculas, primero
// en la biblioteca compartida (vale para cualquier mueble que use esas placas, también los importados) y después
// en la carpeta propia del mueble (`FurnitureDef.textureBaseUrl`). Sin ninguna de las dos, no se pide nada.
// Las copias de public/textures/ están achicadas y en JPEG para el celular (Blanco_nature.png pesaba 3,8 MB).

import type { FurnitureDef } from "@/data/types";

const TEXTURE_LIBRARY: Record<string, string> = {
  blanco_nature: "/textures/blanco_nature.jpg",
  gaudi: "/textures/gaudi.jpg",
};

function stem(file: string): string {
  return file.replace(/\.[^.]+$/, "").toLowerCase();
}

export function textureUrlFor(def: Pick<FurnitureDef, "textureBaseUrl">, file: string): string | null {
  const shared = TEXTURE_LIBRARY[stem(file)];
  if (shared) return shared;
  return def.textureBaseUrl ? `${def.textureBaseUrl}/${encodeURIComponent(file)}` : null;
}
