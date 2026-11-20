// IE-15: registro de la integración. Solo eventos con nombre y campos cortos de una lista cerrada: nunca tokens,
// contraseñas, cookies, cuerpos de mensajes ni URLs (la query de una URL firmada es una credencial). TIE-19 lo
// verifica sobre un flujo completo.

export type CampoDeRegistro = "motivo" | "estado" | "error" | "archivo" | "status";

export type Campos = Partial<Record<CampoDeRegistro, string | number | boolean>>;

export type Registro = (evento: string, campos?: Campos) => void;

/** Recorta y limpia un valor: solo caracteres seguros, hasta 80. */
function limpio(v: string | number | boolean): string {
  return String(v).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 80);
}

export function formatearRegistro(evento: string, campos: Campos = {}): string {
  const partes = (Object.keys(campos) as CampoDeRegistro[]).sort().map((k) => `${k}=${limpio(campos[k] as string)}`);
  return [`ucp:erp ${limpio(evento)}`, ...partes].join(" ");
}

export const registrarEnConsola: Registro = (evento, campos) => {
  console.info(formatearRegistro(evento, campos));
};
