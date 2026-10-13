"use client";

import { useEffect } from "react";
import { useViewStore } from "@/store/viewStore";

/** Refleja el qrId de la URL en el store; el visor (persistente en p/layout) reacciona a él. */
export function SyncSelection({ qrId }: { qrId: string }) {
  const setSelectedQrId = useViewStore((s) => s.setSelectedQrId);

  useEffect(() => {
    setSelectedQrId(qrId);
  }, [qrId, setSelectedQrId]);

  return null;
}
