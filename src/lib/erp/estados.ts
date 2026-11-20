// IE-7 a IE-9: estados de un trabajo, según la respuesta de Casa Mueble del 20/11 (docs/casa-mueble/
// respuestas-20-11-contrato-ucp.md, que manda sobre el "recibido" de la spec v0.3). Van en inglés, como los pidieron.
//
// ASUMIDO, reversible (pre-entrega): `success` = el modelo y el CSV se recibieron, se verificaron (sha256 y zip con
// un .dae) y se guardaron. La importación del CSV queda fuera hasta que exista el importador; cuando exista, el
// trabajo pasa por `inProgress` hasta terminarla. `failed` lleva siempre la causa en `mensaje`.

export const ESTADOS_TRABAJO = ["pending", "inProgress", "success", "failed"] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

export function esEstadoTrabajo(x: unknown): x is EstadoTrabajo {
  return typeof x === "string" && (ESTADOS_TRABAJO as readonly string[]).includes(x);
}

/** Texto para la pantalla embebida (IE-5). */
export const ETIQUETA_ESTADO: Record<EstadoTrabajo, string> = {
  pending: "Pendiente",
  inProgress: "En proceso",
  success: "Recibido y verificado",
  failed: "Con error",
};
