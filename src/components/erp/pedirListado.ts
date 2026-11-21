// IC-6 e IC-8 (docs/spec-importador-csv-envio.md; revisión del 21/11): pide el listado de piezas del trabajo del
// modelo. Distingue «el trabajo no tiene listado» (404 `sin-listado`: se arma desde el .dae, como antes) de «no se
// pudo leer» (red, 401, 500, listado de otro trabajo): eso NUNCA se toma como «sin listado», para no mostrar en
// silencio fichas adivinadas del .dae cuando el servidor sí tiene el CSV.

import type { ListadoErp } from "@/lib/erp/defErp";

export type PedidoListado =
  | { tipo: "listado"; listado: ListadoErp }
  | { tipo: "sin-listado" }
  | { tipo: "error"; motivo: "no-autenticada" | "red" | "otro-trabajo" };

export async function pedirListado(proyectoUuid: string, trabajoUuid: string): Promise<PedidoListado> {
  const r = await fetch(`/api/erp/proyectos/${encodeURIComponent(proyectoUuid)}/listado`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  if (!r) return { tipo: "error", motivo: "red" };
  if (r.status === 401) return { tipo: "error", motivo: "no-autenticada" };
  const cuerpo = (await r.json().catch(() => null)) as (Partial<ListadoErp> & { error?: string }) | null;
  if (r.status === 404 && cuerpo?.error === "sin-listado") {
    // Solo vale si es del mismo trabajo del modelo.
    return cuerpo.trabajoUuid === trabajoUuid ? { tipo: "sin-listado" } : { tipo: "error", motivo: "otro-trabajo" };
  }
  if (!r.ok || !cuerpo || !Array.isArray(cuerpo.piezas)) return { tipo: "error", motivo: "red" };
  // Entre el pedido del modelo y el del listado pudo llegar otro envío.
  if (cuerpo.trabajoUuid !== trabajoUuid) return { tipo: "error", motivo: "otro-trabajo" };
  return { tipo: "listado", listado: cuerpo as ListadoErp };
}
