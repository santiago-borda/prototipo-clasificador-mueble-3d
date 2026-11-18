import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type { FurnitureDef } from "@/data/types";
import { defaultFurnitureDef, getFurnitureDefByQrId } from "@/lib/lookup";
import { useViewStore } from "@/store/viewStore";

/** ¿Es una ruta de la ficha que lee de la base? Solo /p/<qrId> (docs/spec-s2a-app-lee-base.md S2A-3). */
export function isBaseRoute(pathname: string | null): boolean {
  return pathname !== null && pathname.startsWith("/p/");
}

/**
 * Mueble que muestra el visor. En /p/* es solo el que la página leyó de la base (`baseDef`; null hasta que llega):
 * nunca el registro estático. En las demás rutas (/prueba), el mueble del QR seleccionado o el primero registrado.
 */
export function useActiveFurniture(): FurnitureDef | null {
  const pathname = usePathname();
  const selectedQrId = useViewStore((s) => s.selectedQrId);
  const baseDef = useViewStore((s) => s.baseDef);
  const onBase = isBaseRoute(pathname);
  return useMemo(
    () => (onBase ? baseDef : (getFurnitureDefByQrId(selectedQrId) ?? defaultFurnitureDef())),
    [onBase, baseDef, selectedQrId],
  );
}
