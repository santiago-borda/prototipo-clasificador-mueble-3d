// IE-13: ERP simulado (docs/spec-integracion-erp-minima.md). Imita `whoami` y las rutas de lectura que asume el
// cliente (src/server/erp/rutas.ts, ASUMIDAS hasta U-erp-real) y sirve /anfitrion, una página que hace de frontend
// del ERP: embebe este sistema en un iframe y responde los mensajes del §5. No es código de la app.
//
// Es una función de `Request` a `Response`: el servidor (servidor.ts) la monta en node:http y las pruebas la llaman
// directo, sin red. Todos los datos son de prueba; el zip lleva el .dae del primer fixture (público en el repo).

import { randomBytes } from "node:crypto";
import { RUTAS_ERP } from "@/server/erp/rutas";
import { paginaAnfitrion } from "./anfitrion";
import { crearZip } from "./zip";

export interface UsuarioSimulado {
  id: string;
  nombre: string;
  tenant: { id: string; nombre: string };
}

export const TENANT_CM = { id: "t-casa-mueble", nombre: "Casa Mueble (simulado)" } as const;
export const TENANT_OTRO = { id: "t-otra", nombre: "Otra carpintería (simulada)" } as const;

export const USUARIOS: readonly UsuarioSimulado[] = [
  { id: "u-ana", nombre: "Ana (simulada)", tenant: TENANT_CM },
  { id: "u-bruno", nombre: "Bruno (simulado)", tenant: TENANT_CM },
  { id: "u-carla", nombre: "Carla (simulada)", tenant: TENANT_OTRO },
];

interface DocumentoSimulado {
  id: string;
  nombre: string;
  contentType: string;
  contenido: () => Uint8Array;
}

interface ProyectoSimulado {
  id: string;
  nombre: string;
  tenantId: string;
  muebles: { id: string; nombre: string; cantidadPiezas: number }[];
  documentos: DocumentoSimulado[];
}

interface TokenSimulado {
  usuario: UsuarioSimulado;
  vence: number;
}

export interface OpcionesErpSimulado {
  /** Bytes del .dae que va dentro del zip de P-0002. */
  daeOlmo: Uint8Array;
  /** Origen de este sistema, para el iframe del anfitrión (p. ej. http://localhost:3000). */
  origenPfg: string;
  ahora?: () => number;
  /** Vida de un token. Por defecto 15 minutos. */
  duracionTokenMs?: number;
}

export interface ErpSimulado {
  manejar(request: Request): Promise<Response>;
  /** Emite un token para un usuario (lo que haría el login del ERP). */
  emitirToken(usuarioId: string): string;
  /** Vence todos los tokens emitidos (botón «Vencer el token» del anfitrión). */
  vencerTokens(): void;
  /** Cuántos pedidos recibió cada ruta (para las pruebas). */
  pedidos: Map<string, number>;
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export function crearErpSimulado(opciones: OpcionesErpSimulado): ErpSimulado {
  const ahora = opciones.ahora ?? Date.now;
  const duracion = opciones.duracionTokenMs ?? 15 * 60 * 1000;
  const tokens = new Map<string, TokenSimulado>();
  const pedidos = new Map<string, number>();
  let zipOlmo: Uint8Array | undefined;

  const proyectos: ProyectoSimulado[] = [
    {
      id: "P-0002",
      nombre: "Proyecto de prueba (simulado)",
      tenantId: TENANT_CM.id,
      muebles: [{ id: "M-0001", nombre: "Escritorio Olmo", cantidadPiezas: 33 }],
      documentos: [
        {
          id: "D-0001",
          nombre: "olmo.zip",
          contentType: "application/zip",
          contenido: () => (zipOlmo ??= crearZip([{ nombre: "Olmo/olmo.dae", datos: opciones.daeOlmo }])),
        },
        { id: "D-0002", nombre: "presupuesto.pdf", contentType: "application/pdf", contenido: () => new TextEncoder().encode("%PDF-1.4 simulado") },
      ],
    },
    { id: "P-0003", nombre: "Proyecto sin documentos (simulado)", tenantId: TENANT_CM.id, muebles: [], documentos: [] },
    { id: "P-0101", nombre: "Proyecto de otra carpintería (simulado)", tenantId: TENANT_OTRO.id, muebles: [], documentos: [] },
  ];

  function emitirToken(usuarioId: string): string {
    const usuario = USUARIOS.find((u) => u.id === usuarioId);
    if (!usuario) throw new Error(`Usuario simulado desconocido: ${usuarioId}`);
    const token = `sim.${randomBytes(24).toString("base64url")}`;
    tokens.set(token, { usuario, vence: ahora() + duracion });
    return token;
  }

  /** Usuario del Bearer, o la respuesta 401 que daría el ERP. */
  function autenticar(request: Request): UsuarioSimulado | Response {
    const encabezado = request.headers.get("authorization") ?? "";
    const m = /^Bearer (\S+)$/.exec(encabezado);
    if (!m) return json({ error: "sin-token" }, 401);
    const t = tokens.get(m[1]);
    if (!t) return json({ error: "token-invalido" }, 401);
    if (t.vence <= ahora()) return json({ error: "token-vencido" }, 401);
    return t.usuario;
  }

  async function manejar(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const ruta = url.pathname;
    pedidos.set(ruta, (pedidos.get(ruta) ?? 0) + 1);

    // --- Lo que hace el frontend del ERP (anfitrión) ---
    if (request.method === "GET" && ruta === "/anfitrion") {
      const proyecto = url.searchParams.get("proyecto") ?? "P-0002";
      return new Response(paginaAnfitrion({ origenPfg: opciones.origenPfg, proyecto, usuarios: USUARIOS }), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (request.method === "POST" && ruta === "/simulado/token") {
      const cuerpo = (await request.json().catch(() => null)) as { usuario?: unknown } | null;
      const usuario = typeof cuerpo?.usuario === "string" ? cuerpo.usuario : "";
      if (!USUARIOS.some((u) => u.id === usuario)) return json({ error: "usuario-desconocido" }, 400);
      return json({ token: emitirToken(usuario) });
    }
    if (request.method === "POST" && ruta === "/simulado/vencer") {
      vencerTokens();
      return json({ vencidos: tokens.size });
    }

    // --- API (rutas ASUMIDAS, las mismas que usa el cliente) ---
    if (request.method !== "GET") return json({ error: "metodo" }, 405);
    const usuario = autenticar(request);
    if (usuario instanceof Response) return usuario;

    if (ruta === RUTAS_ERP.whoami) {
      return json({ id: usuario.id, nombre: usuario.nombre, tenant: usuario.tenant });
    }
    if (ruta === RUTAS_ERP.proyectos) {
      return json(proyectos.filter((p) => p.tenantId === usuario.tenant.id).map((p) => ({ id: p.id, nombre: p.nombre })));
    }
    const mProyecto = /^\/api\/proyectos\/([^/]+)$/.exec(ruta);
    const mDocumento = /^\/api\/proyectos\/([^/]+)\/documentos\/([^/]+)\/contenido$/.exec(ruta);
    const id = decodeURIComponent((mProyecto ?? mDocumento)?.[1] ?? "");
    // Como un ERP multi-tenant: un proyecto de otra carpintería no existe para este usuario.
    const proyecto = proyectos.find((p) => p.id === id && p.tenantId === usuario.tenant.id);
    if ((mProyecto || mDocumento) && !proyecto) return json({ error: "no-encontrado" }, 404);
    if (mProyecto && proyecto) {
      return json({
        id: proyecto.id,
        nombre: proyecto.nombre,
        tenantId: proyecto.tenantId,
        muebles: proyecto.muebles,
        documentos: proyecto.documentos.map((d) => ({ id: d.id, nombre: d.nombre, contentType: d.contentType, bytes: d.contenido().length })),
      });
    }
    if (mDocumento && proyecto) {
      const doc = proyecto.documentos.find((d) => d.id === decodeURIComponent(mDocumento[2]));
      if (!doc) return json({ error: "no-encontrado" }, 404);
      const bytes = doc.contenido();
      return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": doc.contentType, "content-length": String(bytes.length) } });
    }
    return json({ error: "no-encontrado" }, 404);
  }

  function vencerTokens(): void {
    const t = ahora();
    for (const token of tokens.values()) token.vence = Math.min(token.vence, t);
  }

  return { manejar, emitirToken, vencerTokens, pedidos };
}
