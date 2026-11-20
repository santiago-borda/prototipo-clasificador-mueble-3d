import { ProyectoErp } from "@/components/erp/ProyectoErp";

// IE-5: estado del proyecto y enlace al visor.
export default async function ProyectoErpPagina({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return <ProyectoErp proyectoUuid={uuid} />;
}
