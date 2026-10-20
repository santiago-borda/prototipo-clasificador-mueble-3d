// Lee un .dae en el navegador con el mismo cargador y la misma conversión que usa el visor (D: el .dae se valida
// solo en el navegador). Necesita DOMParser, así que no se puede usar en el servidor.

import { buildFurnitureModel } from "@/model/colladaModel";
import { NamedColladaLoader, skipTextures } from "@/model/namedColladaLoader";
import type { FurnitureModel } from "@/model/types";

export async function parseDaeFile(file: File): Promise<FurnitureModel> {
  const loader = new NamedColladaLoader();
  skipTextures(loader);
  const collada = loader.parse(await file.text(), "/");
  if (!collada) throw new Error("No se pudo leer el .dae: no es un archivo COLLADA válido.");
  return buildFurnitureModel(collada.scene);
}
