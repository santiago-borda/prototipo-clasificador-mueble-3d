import { AvisoEmbebido } from "@/components/embebido/AvisoEmbebido";
import { EntradaEmbebida } from "@/components/embebido/EntradaEmbebida";
import { ID_ERP } from "@/lib/embebido/ids";

// Entrada del iframe: /embebido?proyecto=<erpId>, abierta desde la página del proyecto en el ERP (§5, pasos 1 a 5).
export default async function EmbebidoEntrada({ searchParams }: { searchParams: Promise<{ proyecto?: string | string[] }> }) {
  const { proyecto } = await searchParams;
  if (typeof proyecto !== "string" || !ID_ERP.test(proyecto)) {
    return <AvisoEmbebido titulo="Abrí esta pantalla desde el ERP" texto="Falta el proyecto, o no tiene el formato esperado." />;
  }
  return <EntradaEmbebida proyecto={proyecto} />;
}
