import { ListaProyectosErp } from "@/components/erp/ListaProyectosErp";

// Lista de proyectos de la carpintería de la sesión. La usa el login de desarrollo (IE-11): dentro del ERP, el
// iframe abre directamente /erp/proyectos/{uuid}.
export default function ProyectosErp() {
  return <ListaProyectosErp />;
}
