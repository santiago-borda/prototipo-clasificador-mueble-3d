// IE-3, IE-4: cookie de sesión, chequeo de Origin y cuerpos JSON. Funciones puras sobre Request/Response.
//
// La cookie se manda dos veces, con Path=/embebido y Path=/api/embebido: así el navegador solo la envía bajo esas
// dos rutas (IE-4: «la cookie solo se usa bajo /embebido y /api/embebido»). httpOnly, Secure, SameSite=Lax.

export const NOMBRE_COOKIE = "pfg_sesion";
export const RUTAS_COOKIE = ["/embebido", "/api/embebido"] as const;

/** Las dos cabeceras Set-Cookie de una sesión nueva. */
export function cookiesDeSesion(tokenDeSesion: string, duracionMs: number): string[] {
  const maxAge = Math.floor(duracionMs / 1000);
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

/**
 * IE-3: el pedido viene de una página de este mismo sistema. Exige la cabecera Origin (los navegadores la mandan en
 * todo POST) igual al origen del pedido.
 */
export function mismoOrigen(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export const CUERPO_MAX_BYTES = 16 * 1024;

/** El cuerpo JSON de un POST, o null si no es JSON, no es un objeto o es demasiado grande. */
export async function cuerpoJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const texto = await request.text().catch(() => "");
  if (texto.length === 0 || texto.length > CUERPO_MAX_BYTES) return null;
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
