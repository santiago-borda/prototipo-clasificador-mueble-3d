// IE-11: registro del embebido. Solo eventos con nombre y campos cortos de una lista cerrada: nunca tokens,
// cookies, cuerpos de mensajes ni URLs con parámetros. TIE-15 lo verifica sobre un flujo completo.

export type CampoDeRegistro = "motivo" | "estado" | "erpProyectoId" | "error";

export type Registro = (evento: string, campos?: Partial<Record<CampoDeRegistro, string | number | boolean>>) => void;

/** Recorta y limpia un valor: solo caracteres seguros, hasta 80. */
function limpio(v: string | number | boolean): string {
  return String(v).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 80);
}

export function formatearRegistro(evento: string, campos: Partial<Record<CampoDeRegistro, string | number | boolean>> = {}): string {
  const partes = (Object.keys(campos) as CampoDeRegistro[]).sort().map((k) => `${k}=${limpio(campos[k] as string)}`);
  return [`pfg:embebido ${limpio(evento)}`, ...partes].join(" ");
}

export const registrarEnConsola: Registro = (evento, campos) => {
  console.info(formatearRegistro(evento, campos));
};
