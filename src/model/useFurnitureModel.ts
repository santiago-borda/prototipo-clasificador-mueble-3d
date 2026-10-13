import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { buildFurnitureModel } from "./colladaModel";
import { NamedColladaLoader } from "./namedColladaLoader";
import type { FurnitureModel } from "./types";

export const OLMO_DAE_URL = "/models/olmo.dae";

// El visor usa sus propios materiales; las texturas que referencia el .dae (Blanco_nature.png,
// GAUDI.jpeg) no se necesitan. Se reemplazan por un píxel transparente para no pedirlas (404).
const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function skipTextures(loader: NamedColladaLoader): void {
  loader.manager.setURLModifier((url) => (/\.(png|jpe?g)$/i.test(url) ? BLANK_PIXEL : url));
}

// PUNTO DE REEMPLAZO del modelo 3D: de dónde sale el mueble.
// Hoy: el .dae exportado desde SketchUp (public/models/olmo.dae).
// Suspende mientras carga: el llamador debe estar dentro de <Suspense> (ver FurnitureCanvas).
// Las geometrías generadas viven lo que dura la app (spike): no se liberan a mano.
export function useFurnitureModel(): FurnitureModel {
  const collada = useLoader(NamedColladaLoader, OLMO_DAE_URL, skipTextures);
  return useMemo(() => {
    if (!collada) throw new Error(`No se pudo leer ${OLMO_DAE_URL}`);
    return buildFurnitureModel(collada.scene);
  }, [collada]);
}
