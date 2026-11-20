// IE-13: ERP simulado (docs/spec-integracion-erp-minima.md v0.3). Hace de ERP según el contrato UCP v1 (que lo generó
// una IA: todo lo que afirma del ERP real es ASUMIDO hasta U-erp-real). No es código de la app.
//   - Auth: firma access tokens RS256 con una clave generada al arrancar (node:crypto) y sirve su JWKS y su
//     descubrimiento. Claims: iss, sub, tenant_id, iat, nbf, exp (15 min por defecto), sin audiencia.
//   - Login de desarrollo (guía §1): POST /api/session/login → `{ success, data: { accessToken } }`.
//   - Blob: URLs firmadas (`?exp=&sig=`, HMAC, vencen a los 15 min) del zip del Olmo y de un CSV de piezas.
//   - «Enviar a UCP»: POST /simulado/enviar arma el cuerpo del contrato §3 y llama a POST /api/trabajos de este
//     sistema desde el servidor, con el Bearer del usuario (como haría el ERP).
//   - /anfitrion: página que hace de frontend del ERP (§5): embebe /erp/proyectos/{uuid} y manda erp:sesion y
//     erp:token. Ver anfitrion.ts.
// Es una función de `Request` a `Response`: servidor.ts la monta en node:http y las pruebas la llaman directo, sin red.
// Todos los datos son de prueba y los UUID son inventados (no son los de QA).

import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID, timingSafeEqual, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";
import { paginaAnfitrion } from "./anfitrion";
import { crearZip } from "./zip";

export interface UsuarioSimulado {
  sub: string;
  email: string;
  nombre: string;
  tenantId: string;
}

export const TENANT_CM = "5e1a0000-0000-4000-8000-0000000c0001";
export const TENANT_OTRO = "5e1a0000-0000-4000-8000-0000000c0002";
/** Contraseña de todos los usuarios simulados. No es un secreto: es un dato de prueba. */
export const PASSWORD_SIMULADA = "simulado";

export const USUARIOS: readonly UsuarioSimulado[] = [
  { sub: "5e1a0000-0000-4000-8000-00000000a001", email: "ana@simulado.test", nombre: "Ana (simulada)", tenantId: TENANT_CM },
  { sub: "5e1a0000-0000-4000-8000-00000000a002", email: "bruno@simulado.test", nombre: "Bruno (simulado)", tenantId: TENANT_CM },
  { sub: "5e1a0000-0000-4000-8000-00000000a003", email: "carla@simulado.test", nombre: "Carla (otra carpintería)", tenantId: TENANT_OTRO },
];

export interface ProyectoSimulado {
  uuid: string;
  codigo: string;
  nombre: string;
  cliente: string;
  fechaEntrega: string;
  tenantId: string;
}

export const PROYECTOS: readonly ProyectoSimulado[] = [
  { uuid: "5e1a0000-0000-4000-8000-000000000142", codigo: "P-0142", nombre: "Escritorio Olmo (simulado)", cliente: "Cliente simulado", fechaEntrega: "2026-12-15", tenantId: TENANT_CM },
  { uuid: "5e1a0000-0000-4000-8000-000000000143", codigo: "P-0143", nombre: "Proyecto sin enviar (simulado)", cliente: "Cliente simulado", fechaEntrega: "2026-12-20", tenantId: TENANT_CM },
  { uuid: "5e1a0000-0000-4000-8000-000000000201", codigo: "P-0201", nombre: "Proyecto de otra carpintería (simulado)", cliente: "Otro cliente", fechaEntrega: "2027-01-10", tenantId: TENANT_OTRO },
];

/** CSV de piezas de prueba, con las columnas de OpenCutList (el sistema no lo procesa todavía: solo lo verifica). */
export const CSV_SIMULADO = [
  "Número,Nombre,Cantidad,Longitud,Ancho,Espesor,Material",
  "C01,Tapa,1,1200,550,18,Blanco nature 18",
  "C04,Frente de cajón,3,404,140,18,Blanco nature 18",
  "",
].join("\n");

export type VarianteEnvio = "ok" | "sha256-malo" | "sin-dae" | "url-ajena";

export interface OpcionesErpSimulado {
  /** Bytes del .dae que va dentro del zip del modelo. */
  daeOlmo: Uint8Array;
  /** Origen de este sistema (UCP): iframe del anfitrión y destino de «Enviar a UCP». */
  origenUcp: string;
  /** URL propia del simulado (issuer `${base}/`, JWKS y blobs). Tiene que ser la ERP_SIMULADO_URL de la app. */
  base: string;
  ahora?: () => number;
  /** Vida de un token, en segundos. Por defecto 15 minutos. */
  duracionTokenS?: number;
  /** Cómo llega «Enviar a UCP» a POST /api/trabajos. Por defecto, fetch (las pruebas llaman a la ruta directo). */
  enviarAUcp?: (request: Request) => Promise<Response>;
}

export interface ErpSimulado {
  manejar(request: Request): Promise<Response>;
  readonly issuer: string;
  /** Firma un token. `venceEnS` negativo = ya vencido; `tenantId: null` = sin el claim; `issuer` = otro issuer. */
  emitirToken(sub: string, opciones?: { venceEnS?: number; tenantId?: string | null; issuer?: string }): Promise<string>;
  /** Cambia la clave de firma (kid nuevo), como una rotación del Auth del ERP. */
  rotarClave(): void;
  /** Cuerpo de POST /api/trabajos para un proyecto, con URLs firmadas nuevas. */
  cuerpoEnvio(proyectoUuid: string, opciones?: { variante?: VarianteEnvio; envioUuid?: string }): Record<string, unknown>;
  /** Cuántos pedidos recibió cada ruta (para las pruebas: TIE-3 cuenta los del JWKS; TIE-13, las descargas). */
  pedidos: Map<string, number>;
  readonly zipOlmo: Uint8Array;
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const sha256 = (datos: Uint8Array) => createHash("sha256").update(datos).digest("hex");

interface Clave {
  kid: string;
  privada: KeyObject;
  jwk: Record<string, unknown>;
}

function nuevaClave(): Clave {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = `sim-${randomBytes(4).toString("hex")}`;
  return { kid, privada: privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" } };
}

export function crearErpSimulado(opciones: OpcionesErpSimulado): ErpSimulado {
  const ahora = opciones.ahora ?? Date.now;
  const duracion = opciones.duracionTokenS ?? 15 * 60;
  const base = opciones.base.replace(/\/+$/, "");
  const issuer = `${base}/`;
  const enviarAUcp = opciones.enviarAUcp ?? ((r: Request) => fetch(r));
  const secretoBlob = randomBytes(32);
  const pedidos = new Map<string, number>();
  let claves: Clave[] = [nuevaClave()];

  const zipOlmo = crearZip([
    { nombre: "Olmo/olmo.dae", datos: opciones.daeOlmo },
    { nombre: "Olmo/texturas/LEEME.txt", datos: "Las texturas se buscan por nombre en la biblioteca del visor." },
  ]);
  const zipSinDae = crearZip([{ nombre: "LEEME.txt", datos: "zip sin modelo" }]);
  const csv = new TextEncoder().encode(CSV_SIMULADO);
  const archivos: Record<string, { datos: Uint8Array; tipo: string }> = {
    "olmo.zip": { datos: zipOlmo, tipo: "application/zip" },
    "sin-dae.zip": { datos: zipSinDae, tipo: "application/zip" },
    "piezas.csv": { datos: csv, tipo: "text/csv; charset=utf-8" },
  };

  const firmaBlob = (nombre: string, exp: number) => createHmac("sha256", secretoBlob).update(`${nombre}.${exp}`).digest("base64url");

  function urlFirmada(nombre: string): string {
    const exp = Math.floor(ahora() / 1000) + 15 * 60;
    return `${base}/blob/${nombre}?exp=${exp}&sig=${firmaBlob(nombre, exp)}`;
  }

  async function emitirToken(sub: string, o: { venceEnS?: number; tenantId?: string | null; issuer?: string } = {}): Promise<string> {
    const usuario = USUARIOS.find((u) => u.sub === sub);
    if (!usuario) throw new Error("Usuario simulado desconocido.");
    const clave = claves[claves.length - 1];
    const iat = Math.floor(ahora() / 1000);
    const tenant = o.tenantId === undefined ? usuario.tenantId : o.tenantId;
    return new SignJWT(tenant === null ? {} : { tenant_id: tenant })
      .setProtectedHeader({ alg: "RS256", kid: clave.kid, typ: "at+jwt" })
      .setIssuer(o.issuer ?? issuer)
      .setSubject(usuario.sub)
      .setIssuedAt(iat)
      .setNotBefore(iat)
      .setExpirationTime(iat + (o.venceEnS ?? duracion))
      .sign(clave.privada);
  }

  function cuerpoEnvio(proyectoUuid: string, o: { variante?: VarianteEnvio; envioUuid?: string } = {}): Record<string, unknown> {
    const proyecto = PROYECTOS.find((p) => p.uuid === proyectoUuid);
    if (!proyecto) throw new Error("Proyecto simulado desconocido.");
    const variante = o.variante ?? "ok";
    const zip = variante === "sin-dae" ? "sin-dae.zip" : "olmo.zip";
    const urlModelo = variante === "url-ajena" ? "https://blob.ajeno.example/modelo.zip?sig=x" : urlFirmada(zip);
    return {
      version: 1,
      envioUuid: o.envioUuid ?? randomUUID(),
      proyecto: { uuid: proyecto.uuid, codigo: proyecto.codigo, nombre: proyecto.nombre, cliente: proyecto.cliente, fechaEntrega: proyecto.fechaEntrega },
      modelo: { url: urlModelo, nombre: "olmo.zip", version: 3, sha256: variante === "sha256-malo" ? "0".repeat(64) : sha256(archivos[zip].datos) },
      csv: { url: urlFirmada("piezas.csv"), nombre: "piezas.csv", version: 1, sha256: sha256(csv) },
    };
  }

  async function manejar(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const ruta = url.pathname;
    pedidos.set(ruta, (pedidos.get(ruta) ?? 0) + 1);

    // --- Auth del ERP ---
    if (request.method === "GET" && ruta === "/.well-known/openid-configuration") {
      return json({ issuer, jwks_uri: `${base}/.well-known/jwks`, id_token_signing_alg_values_supported: ["RS256"] });
    }
    if (request.method === "GET" && ruta === "/.well-known/jwks") return json({ keys: claves.map((c) => c.jwk) });
    if (request.method === "POST" && ruta === "/api/session/login") {
      const cuerpo = (await request.json().catch(() => null)) as { email?: unknown; nombreUsuario?: unknown; password?: unknown } | null;
      const id = cuerpo?.email ?? cuerpo?.nombreUsuario;
      const usuario = USUARIOS.find((u) => u.email === id || u.email.split("@")[0] === id);
      if (!usuario || cuerpo?.password !== PASSWORD_SIMULADA) return json({ success: false, data: null, errors: ["Credenciales incorrectas."] }, 401);
      return json({ success: true, data: { accessToken: await emitirToken(usuario.sub) }, errors: [] });
    }

    // --- Blob (URLs firmadas) ---
    const mBlob = /^\/blob\/([a-z.-]+)$/.exec(ruta);
    if (request.method === "GET" && mBlob) {
      const archivo = archivos[mBlob[1]];
      const exp = Number(url.searchParams.get("exp"));
      const sig = Buffer.from(url.searchParams.get("sig") ?? "");
      const esperada = Buffer.from(firmaBlob(mBlob[1], exp));
      if (!archivo || sig.length !== esperada.length || !timingSafeEqual(sig, esperada)) return new Response("firma inválida", { status: 403 });
      if (exp * 1000 <= ahora()) return new Response("URL vencida", { status: 403 });
      return new Response(archivo.datos.slice().buffer as ArrayBuffer, { headers: { "content-type": archivo.tipo, "content-length": String(archivo.datos.length) } });
    }

    // --- Lo que hace el frontend del ERP (anfitrión) ---
    if (request.method === "GET" && ruta === "/anfitrion") {
      const pedido = url.searchParams.get("proyecto") ?? PROYECTOS[0].uuid;
      const proyecto = PROYECTOS.find((p) => p.uuid === pedido) ?? PROYECTOS[0];
      const segundos = Number(url.searchParams.get("duracion") ?? duracion);
      return new Response(
        paginaAnfitrion({ origenUcp: opciones.origenUcp, proyecto, proyectos: PROYECTOS, usuarios: USUARIOS, otroTenant: TENANT_OTRO, duracionS: Number.isInteger(segundos) && segundos >= 30 ? segundos : duracion }),
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      );
    }
    if (request.method === "POST" && ruta === "/simulado/token") {
      const cuerpo = (await request.json().catch(() => null)) as { usuario?: unknown; venceEnS?: unknown } | null;
      const usuario = USUARIOS.find((u) => u.sub === cuerpo?.usuario);
      if (!usuario) return json({ error: "usuario-desconocido" }, 400);
      const venceEnS = typeof cuerpo?.venceEnS === "number" && Number.isInteger(cuerpo.venceEnS) ? cuerpo.venceEnS : duracion;
      const accessToken = await emitirToken(usuario.sub, { venceEnS });
      return json({ accessToken, vence: Math.floor(ahora() / 1000) + venceEnS, tenantId: usuario.tenantId });
    }
    if (request.method === "POST" && ruta === "/simulado/enviar") {
      const cuerpo = (await request.json().catch(() => null)) as { usuario?: unknown; proyecto?: unknown; variante?: unknown; envioUuid?: unknown } | null;
      const usuario = USUARIOS.find((u) => u.sub === cuerpo?.usuario);
      const proyecto = PROYECTOS.find((p) => p.uuid === cuerpo?.proyecto);
      if (!usuario || !proyecto) return json({ error: "pedido-invalido" }, 400);
      const variante = (["ok", "sha256-malo", "sin-dae", "url-ajena"] as const).find((v) => v === cuerpo?.variante) ?? "ok";
      const envio = cuerpoEnvio(proyecto.uuid, { variante, envioUuid: typeof cuerpo?.envioUuid === "string" ? cuerpo.envioUuid : undefined });
      const token = await emitirToken(usuario.sub);
      let respuesta: Response;
      try {
        respuesta = await enviarAUcp(
          new Request(`${opciones.origenUcp}/api/trabajos`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify(envio),
          }),
        );
      } catch {
        return json({ status: 0, cuerpo: { mensaje: "UCP no respondió." }, envioUuid: envio.envioUuid });
      }
      return json({ status: respuesta.status, cuerpo: await respuesta.json().catch(() => null), envioUuid: envio.envioUuid });
    }
    return json({ error: "no-encontrado" }, 404);
  }

  return {
    manejar,
    issuer,
    emitirToken,
    rotarClave: () => {
      claves = [nuevaClave()];
    },
    cuerpoEnvio,
    pedidos,
    zipOlmo,
  };
}
