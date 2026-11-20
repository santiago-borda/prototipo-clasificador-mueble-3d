import { notFound } from "next/navigation";
import { MarcoErp } from "@/components/erp/MarcoErp";
import { origenWebDelEntorno } from "@/lib/erp/origenes";
import { UUID } from "@/lib/erp/protocolo";
import { leerLoginDirecto } from "@/server/erp/config";

// IE-3 a IE-5: el ERP carga {UCP_WEB_URL}/erp/proyectos/{proyectoUuid} en un iframe (contrato §5). El marco hace el
// intercambio de mensajes y la sesión; la página y el visor leen con la cookie.
export default async function ProyectoErpLayout({ children, params }: { children: React.ReactNode; params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const origen = origenWebDelEntorno();
  if (origen === null || !UUID.test(uuid)) notFound();
  return (
    <MarcoErp origenErp={origen} proyectoUuid={uuid} loginDirecto={leerLoginDirecto()}>
      {children}
    </MarcoErp>
  );
}
