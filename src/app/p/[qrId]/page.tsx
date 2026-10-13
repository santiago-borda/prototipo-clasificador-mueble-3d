import { notFound } from "next/navigation";
import { FurnitureSheet } from "@/components/FurnitureSheet";
import { ModuleSheet } from "@/components/ModuleSheet";
import { PieceSheet } from "@/components/PieceSheet";
import { SyncSelection } from "@/components/SyncSelection";
import { getFurniture, listQrEntries, resolveQr } from "@/lib/lookup";

// /p/<qrId> sirve los tres niveles de QR: mueble, módulo y pieza.
export function generateStaticParams() {
  return listQrEntries().map((entry) => ({ qrId: entry.qrId }));
}

export default async function QrPage({ params }: { params: Promise<{ qrId: string }> }) {
  const { qrId } = await params;
  const target = resolveQr(qrId);
  if (!target) notFound();

  return (
    <>
      <SyncSelection qrId={target.qrId} />
      {target.kind === "piece" && <PieceSheet piece={target.piece} furniture={getFurniture()} />}
      {target.kind === "module" && <ModuleSheet target={target} furniture={getFurniture()} />}
      {target.kind === "furniture" && <FurnitureSheet target={target} />}
    </>
  );
}
