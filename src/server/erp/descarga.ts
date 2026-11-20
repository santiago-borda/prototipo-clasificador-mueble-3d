// IE-7: descarga de los archivos que manda el ERP (URLs firmadas del blob, vencen a los 15 min). Solo servidor.
// Contra SSRF: solo URLs cuyo origen está en ERP_BLOB_ORIGENES (coincidencia exacta) y https (el simulado local es
// la única excepción, con `permitirHttp`), sin seguir redirecciones, con timeout y con tope de tamaño leído por
// partes (no se confía en Content-Length). La URL **nunca** se registra: su query (`?sig=`) es una credencial.

import { createHash } from "node:crypto";
import { DescargaFallida } from "./errores";

export type MotivoUrlRechazada = "no-es-url" | "no-es-https" | "sin-origenes-configurados" | "origen-no-permitido" | "con-credenciales";

/** null si la URL se puede descargar; si no, el motivo (TIE-15: se rechaza antes de descargar). */
export function motivoUrlRechazada(texto: string, origenes: readonly string[], opciones: { permitirHttp?: boolean } = {}): MotivoUrlRechazada | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return "no-es-url";
  }
  if (url.protocol !== "https:" && !(opciones.permitirHttp && url.protocol === "http:")) return "no-es-https";
  if (url.username || url.password) return "con-credenciales";
  if (origenes.length === 0) return "sin-origenes-configurados";
  if (!origenes.includes(url.origin)) return "origen-no-permitido";
  return null;
}

export interface OpcionesDescarga {
  archivo: "modelo" | "csv";
  maxBytes: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Descarga los bytes. Lanza `DescargaFallida` (red, tiempo agotado, HTTP no 2xx o demasiado grande). */
export async function descargar(url: string, opciones: OpcionesDescarga): Promise<Uint8Array> {
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), opciones.timeoutMs);
  try {
    let respuesta: Response;
    try {
      respuesta = await fetchImpl(url, { redirect: "error", signal: control.signal, cache: "no-store" });
    } catch (error) {
      throw new DescargaFallida(opciones.archivo, control.signal.aborted ? "tiempo-agotado" : "red", { cause: error });
    }
    if (!respuesta.ok) {
      await respuesta.body?.cancel().catch(() => undefined);
      throw new DescargaFallida(opciones.archivo, `http-${respuesta.status}`);
    }
    if (!respuesta.body) return new Uint8Array();
    const partes: Uint8Array[] = [];
    let total = 0;
    const lector = respuesta.body.getReader();
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.length;
        if (total > opciones.maxBytes) {
          await lector.cancel().catch(() => undefined);
          throw new DescargaFallida(opciones.archivo, "demasiado-grande");
        }
        partes.push(value);
      }
    } catch (error) {
      if (error instanceof DescargaFallida) throw error;
      throw new DescargaFallida(opciones.archivo, control.signal.aborted ? "tiempo-agotado" : "red", { cause: error });
    }
    const bytes = new Uint8Array(total);
    let o = 0;
    for (const p of partes) {
      bytes.set(p, o);
      o += p.length;
    }
    return bytes;
  } finally {
    clearTimeout(reloj);
  }
}

export function sha256Hex(datos: Uint8Array): string {
  return createHash("sha256").update(datos).digest("hex");
}
