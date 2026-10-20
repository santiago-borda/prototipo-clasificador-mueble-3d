import { FurnitureSheet } from "@/components/FurnitureSheet";
import { ModuleSheet } from "@/components/ModuleSheet";
import { PieceSheet } from "@/components/PieceSheet";
import { SyncSelection } from "@/components/SyncSelection";
import type { QrTarget } from "@/lib/lookup";

/** La ficha que corresponde a un QR (mueble, módulo o pieza) y la sincronización del visor. Lo usan /p/* y /prueba/*. */
export function QrSheets({ target }: { target: QrTarget }) {
  return (
    <>
      <SyncSelection qrId={target.qrId} />
      {target.kind === "piece" && <PieceSheet piece={target.piece} furniture={target.def.furniture} module={target.module} />}
      {target.kind === "module" && <ModuleSheet target={target} furniture={target.def.furniture} />}
      {target.kind === "furniture" && <FurnitureSheet target={target} />}
    </>
  );
}
