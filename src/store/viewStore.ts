import { create } from "zustand";
import type { ViewMode } from "@/data/types";

// Estado mínimo. Todo lo demás (piezas resaltadas, targets de material, pieza bajo el cursor…) se deriva de los datos
// o vive localmente en el componente que lo usa.
interface ViewState {
  selectedQrId: string | null;
  viewMode: ViewMode;
  /** Tiñe las piezas que tienen ficha (y se pueden tocar) para distinguirlas del resto. */
  showLinked: boolean;
  setSelectedQrId: (qrId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setShowLinked: (show: boolean) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  selectedQrId: null,
  viewMode: "highlight",
  showLinked: true,
  setSelectedQrId: (selectedQrId) => set({ selectedQrId }),
  setViewMode: (viewMode) => set({ viewMode }),
  setShowLinked: (showLinked) => set({ showLinked }),
}));
