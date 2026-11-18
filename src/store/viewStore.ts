import { create } from "zustand";
import type { FurnitureDef, ViewMode } from "@/data/types";

// Estado mínimo. Todo lo demás (piezas resaltadas, targets de material, pieza bajo el cursor…) se deriva de los datos
// o vive localmente en el componente que lo usa.
interface ViewState {
  selectedQrId: string | null;
  viewMode: ViewMode;
  /** Tiñe las piezas que tienen ficha (y se pueden tocar) para distinguirlas del resto. */
  showLinked: boolean;
  /**
   * S2A-3: el mueble de /p/<qrId>, leído de la base por la página de servidor (`LoadBaseFurniture`). En /p/* el visor
   * usa solo este (`useActiveFurniture`); null hasta que llega.
   */
  baseDef: FurnitureDef | null;
  setSelectedQrId: (qrId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setShowLinked: (show: boolean) => void;
  setBaseDef: (def: FurnitureDef) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  selectedQrId: null,
  viewMode: "highlight",
  showLinked: true,
  baseDef: null,
  setSelectedQrId: (selectedQrId) => set({ selectedQrId }),
  setViewMode: (viewMode) => set({ viewMode }),
  setShowLinked: (showLinked) => set({ showLinked }),
  // Cada navegación trae un objeto nuevo con los mismos datos: se conserva el anterior para no recargar el visor.
  setBaseDef: (def) => set((s) => (s.baseDef && JSON.stringify(s.baseDef) === JSON.stringify(def) ? s : { baseDef: def })),
}));
