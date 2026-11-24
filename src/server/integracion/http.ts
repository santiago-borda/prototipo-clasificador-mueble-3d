// IE-2, IE-7: cookie de sesión, Bearer, chequeo de Origin y cuerpos JSON. Funciones puras sobre Request/Response.
//
// La cookie se manda dos veces, con Path=/erp y Path=/api/erp: el navegador solo la envía bajo esas dos rutas.
// httpOnly, Secure, SameSite=Lax, y vence con el token del ERP (más la gracia de IE-4). /api/trabajos no usa la
// cookie: lo llama el servidor del ERP con `Authorization: Bearer`.

export const NOMBRE_COOKIE = "ucp_sesion";
export const RUTAS_COOKIE = ["/erp", "/api/erp"] as const;

/** Las dos cabeceras Set-Cookie de una sesión. `vigenciaMs` = cuánto falta para que venza. */
export function cookiesDeSesion(tokenDeSesion: string, vigenciaMs: number): string[] {
  const maxAge = Math.max(0, Math.floor(vigenciaMs / 1000));
  return RUTAS_COOKIE.map((ruta) => `${NOMBRE_COOKIE}=${tokenDeSesion}; Path=${ruta}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
}

/** Las dos cabeceras que borran la cookie. */
export function cookiesBorradas(): string[] {
  return RUTAS_COOKIE.map((ruta) => `${NOMBRE_COOKIE}=; Path=${ruta}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

/** Valor de la cookie de sesión en una cabecera Cookie, o undefined. */
export function cookieDeSesion(cabecera: string | null): string | undefined {
  if (!cabecera) return undefined;
  for (const parte of cabecera.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === NOMBRE_COOKIE) return parte.slice(i + 1).trim();
  }
  return undefined;
}

/** El token de `Authorization: Bearer <token>`, o undefined. */
export function bearer(request: Request): string | undefined {
  const m = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  return m?.[1];
}

/**
 * El pedido viene de una página de este mismo sistema. Exige la cabecera Origin (los navegadores la mandan en todo
 * POST) igual al origen del pedido.
 */
export function mismoOrigen(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export const CUERPO_MAX_BYTES = 16 * 1024;

/** El cuerpo JSON de un POST, o null si no es JSON, no es un objeto o es demasiado grande. */
export async function cuerpoJson(request: Request, maxBytes = CUERPO_MAX_BYTES): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (declarado > maxBytes) return null;
  const texto = await request.text().catch(() => "");
  if (texto.length === 0 || new TextEncoder().encode(texto).length > maxBytes) return null;
  try {
    const valor: unknown = JSON.parse(texto);
    return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function respuestaJson(cuerpo: unknown, status = 200, setCookies: readonly string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  for (const c of setCookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(cuerpo), { status, headers });
}
