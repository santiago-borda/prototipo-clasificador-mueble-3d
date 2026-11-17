// S2-D8 (ADR-004, decisión 6): identificador opaco de un QR. 128 bits aleatorios en base 32.
// Se implementa y se prueba (PB-15); NO se usa para imprimir nada hasta la consulta 59.

/** Base 32 de Crockford en minúsculas: sin i, l, o ni u (no se confunden con 1 y 0 al leer una etiqueta). */
export const QR_ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const QR_ID_LENGTH = 26; // 26 x 5 bits = 130 >= 128
export const QR_ID_FORMAT = /^[0-9a-hjkmnp-tv-z]{26}$/;

export function newQrId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // 2 bits en cero adelante + 128 bits = 130 = 26 grupos de 5.
  let out = "";
  let buffer = 0;
  let bits = 2;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += QR_ID_ALPHABET[(buffer >> (bits - 5)) & 31];
      bits -= 5;
      buffer &= (1 << bits) - 1;
    }
  }
  return out;
}
