import { useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { checkAssociation } from "@/data/mapping";
import type { FurnitureDef } from "@/data/types";
import { buildFurnitureModel } from "./colladaModel";
import { NamedColladaLoader, skipTextures } from "./namedColladaLoader";
import type { FurnitureModel } from "./types";
import { verifyModel } from "./verifyModel";

// PUNTO DE REEMPLAZO del modelo 3D: de dónde sale el mueble.
// Hoy: el .dae de cada mueble registrado (`FurnitureDef.modelUrl`): Olmo en public/models/olmo.dae;
// Sabrina (solo local) por /api/private-models/sabrina.
// Suspende mientras carga: el llamador debe estar dentro de <Suspense> (ver FurnitureCanvas).
// Las geometrías generadas viven lo que dura la app (prototipo): no se liberan a mano.
export function useFurnitureModel(def: FurnitureDef): FurnitureModel {
  const collada = useLoader(NamedColladaLoader, def.modelUrl, skipTextures);
  const model = useMemo(() => {
    if (!collada) throw new Error(`No se pudo leer ${def.modelUrl}`);
    return buildFurnitureModel(collada.scene);
  }, [collada, def.modelUrl]);

  // Solo en desarrollo, sin UI: avisa por consola si el modelo no coincide con el listado.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const tag = `[verificación del modelo ${def.furniture.id}]`;
    const result = verifyModel(model.parts, def.pieceTypes, { toleranceMm: def.toleranceMm });
    const association = checkAssociation(
      model.parts.map((part) => part.instanceId),
      def.pieceTypes,
    );
    result.warnings.forEach((message) => console.warn(`${tag} ${message}`));
    result.anomalies.forEach((message) => console.warn(`${tag} anomalía: ${message}`));
    association.orphans.forEach((id) => console.warn(`${tag} instancia sin tipo de pieza: ${id}`));
    association.ambiguous.forEach((id) => console.warn(`${tag} instancia reclamada por más de un tipo: ${id}`));
    association.countMismatches.forEach((message) => console.warn(`${tag} ${message}`));
    console.info(
      `${tag} ${result.types} tipos, ${result.instances} instancias, advertencias: ${result.warnings.length}, ` +
        `anomalías: ${result.anomalies.length}, desvío máximo: ${result.maxDeviationMm.toFixed(2)} mm, ` +
        `excluidos: ${model.excluded.lineObjects} líneas y ${model.excluded.meshesWithoutCode} mallas sin código.`,
    );
  }, [model, def]);

  return model;
}
