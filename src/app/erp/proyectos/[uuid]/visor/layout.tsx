import { ModeloErpGate } from "@/components/erp/ModeloErpGate";

// IE-5: visor del modelo guardado. El .dae se pide y se arma en el navegador (ModeloErpGate); las fichas son las de
// /p y /prueba, bajo /erp/proyectos/{uuid}/visor/<qrId>.
export default async function VisorErpLayout({ children, params }: { children: React.ReactNode; params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return <ModeloErpGate proyectoUuid={uuid}>{children}</ModeloErpGate>;
}
