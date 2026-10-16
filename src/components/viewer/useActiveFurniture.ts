import { useMemo } from "react";
import type { FurnitureDef } from "@/data/types";
import { defaultFurnitureDef, getFurnitureDefByQrId } from "@/lib/lookup";
import { useViewStore } from "@/store/viewStore";

/** Mueble del QR seleccionado (o el primero registrado si todavía no hay ninguno). */
export function useActiveFurniture(): FurnitureDef {
  const selectedQrId = useViewStore((s) => s.selectedQrId);
  return useMemo(() => getFurnitureDefByQrId(selectedQrId) ?? defaultFurnitureDef(), [selectedQrId]);
}
