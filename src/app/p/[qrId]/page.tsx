import { notFound } from "next/navigation";
import { QrSheets } from "@/components/QrSheets";
import { LoadBaseFurniture } from "@/components/viewer/LoadBaseFurniture";
import { resolveQrTarget } from "@/server/datos";

// /p/<qrId> sirve los tres niveles de QR: mueble, módulo y pieza.
// S2A: resuelve contra la base en cada pedido (sin generateStaticParams, S2A-6) y le pasa el mueble al visor (S2A-3).
// QR inexistente o no publicado: notFound() (404, como antes). Base caída: PersistenciaNoDisponibleError -> p/error.tsx.
export default async function QrPage({ params }: { params: Promise<{ qrId: string }> }) {
  const { qrId } = await params;
  const target = await resolveQrTarget(qrId);
  if (!target) notFound();

  return (
    <>
      <LoadBaseFurniture def={target.def} />
      <QrSheets target={target} />
    </>
  );
}
