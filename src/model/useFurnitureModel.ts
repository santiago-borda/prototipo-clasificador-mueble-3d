import { useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { pieceTypes } from "@/data/furniture.mock";
import { buildFurnitureModel } from "./colladaModel";
import { NamedColladaLoader } from "./namedColladaLoader";
import type { FurnitureModel } from "./types";
import { verifyModel } from "./verifyModel";

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
// Las geometrías generadas viven lo que dura la app (prototipo): no se liberan a mano.
export function useFurnitureModel(): FurnitureModel {
  const collada = useLoader(NamedColladaLoader, OLMO_DAE_URL, skipTextures);
  const model = useMemo(() => {
    if (!collada) throw new Error(`No se pudo leer ${OLMO_DAE_URL}`);
    return buildFurnitureModel(collada.scene);
  }, [collada]);

  // Solo en desarrollo, sin UI: avisa por consola si el modelo no coincide con el listado.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const result = verifyModel(model.parts, pieceTypes);
    result.warnings.forEach((message) => console.warn(`[verificación del modelo] ${message}`));
    result.anomalies.forEach((message) => console.warn(`[verificación del modelo] anomalía: ${message}`));
    console.info(
      `[verificación del modelo] ${result.types} tipos, ${result.instances} instancias, ` +
        `advertencias: ${result.warnings.length}, anomalías: ${result.anomalies.length}.`,
    );
  }, [model]);

  return model;
}
