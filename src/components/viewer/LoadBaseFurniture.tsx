"use client";

import { useEffect } from "react";
import type { FurnitureDef } from "@/data/types";
import { useViewStore } from "@/store/viewStore";

/**
 * S2A-3: carga en el store del visor (persistente en p/layout) el mueble que la página de /p/<qrId> leyó de la base.
 * Mismo patrón que `SyncSelection`. No importa src/server/ ni src/persistence/: recibe el `def` ya resuelto.
 */
export function LoadBaseFurniture({ def }: { def: FurnitureDef }) {
  const setBaseDef = useViewStore((s) => s.setBaseDef);

  useEffect(() => {
    setBaseDef(def);
  }, [def, setBaseDef]);

  return null;
}
