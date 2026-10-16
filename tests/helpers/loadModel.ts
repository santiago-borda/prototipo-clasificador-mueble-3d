import fs from "node:fs";
import type { Object3D } from "three";
import { buildFurnitureModel } from "@/model/colladaModel";
import { NamedColladaLoader, skipTextures } from "@/model/namedColladaLoader";
import type { FurnitureModel } from "@/model/types";

/** Escena de three de un .dae del disco, con el mismo cargador y la misma configuración que usa la app. */
export function loadDaeScene(file: string): Object3D {
  const loader = new NamedColladaLoader();
  skipTextures(loader);
  const collada = loader.parse(fs.readFileSync(file, "utf8"), "/");
  if (!collada) throw new Error(`No se pudo leer ${file}`);
  return collada.scene;
}

export function loadDaeModel(file: string): FurnitureModel {
  return buildFurnitureModel(loadDaeScene(file));
}
