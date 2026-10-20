import { notFound } from "next/navigation";
import { QrSheets } from "@/components/QrSheets";
import { listQrEntries, resolveQr } from "@/lib/lookup";

// /p/<qrId> sirve los tres niveles de QR: mueble, módulo y pieza.
export function generateStaticParams() {
  return listQrEntries().map((entry) => ({ qrId: entry.qrId }));
}

export default async function QrPage({ params }: { params: Promise<{ qrId: string }> }) {
  const { qrId } = await params;
  const target = resolveQr(qrId);
  if (!target) notFound();

  return <QrSheets target={target} />;
}
