// `modelId` (sha256 de los bytes del .dae con cada \r\n pasado a \n, Q4) calculado con Web Crypto, sin node:crypto:
// corre en el navegador. Tiene que dar lo mismo que `modelId` de @/engine/hash (tests/model/observe.equivalence.test.ts).

export async function modelIdBrowser(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue;
    out[n++] = bytes[i];
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", out.subarray(0, n));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
