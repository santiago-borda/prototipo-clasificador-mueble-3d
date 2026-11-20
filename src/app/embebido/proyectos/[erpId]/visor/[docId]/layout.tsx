import { notFound } from "next/navigation";
import { ModeloErpGate } from "@/components/embebido/ModeloErpGate";
import { ID_ERP } from "@/lib/embebido/ids";

// IE-8: visor del modelo de un Documento del ERP. El .dae se pide y se arma en el navegador (ModeloErpGate); las
// fichas son las mismas de /p y /prueba, bajo /embebido/proyectos/<erpId>/visor/<docId>/<qrId>.
export default async function VisorErpLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ erpId: string; docId: string }>;
}) {
  const { erpId, docId } = await params;
  if (!ID_ERP.test(erpId) || !ID_ERP.test(docId)) notFound();
  return (
    <ModeloErpGate erpId={erpId} docId={docId} nombre={`Modelo del proyecto ${erpId}`}>
      {children}
    </ModeloErpGate>
  );
}
