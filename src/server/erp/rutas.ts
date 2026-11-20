// Rutas de lectura de la API del ERP. **ASUMIDAS** (docs/spec-integracion-erp-minima.md §4: «Rutas de lectura:
// desconocidas»). Solo `whoami` está relevada (16/11). Se confirman en U-erp-real y se cambian acá, en el ERP
// simulado (que las importa) y en los esquemas (esquemas.ts).

const seg = (s: string) => encodeURIComponent(s);

export const RUTAS_ERP = {
  /** Relevada el 16/11. */
  whoami: "/api/session/whoami",
  /** ASUMIDA. */
  proyectos: "/api/proyectos",
  /** ASUMIDA. */
  proyecto: (erpProyectoId: string) => `/api/proyectos/${seg(erpProyectoId)}`,
  /** ASUMIDA: bytes del Documento (zip con el .dae). */
  documento: (erpProyectoId: string, documentoId: string) => `/api/proyectos/${seg(erpProyectoId)}/documentos/${seg(documentoId)}/contenido`,
} as const;
