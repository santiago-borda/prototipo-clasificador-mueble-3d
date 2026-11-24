"use client";

// IE-3, IE-4, IE-5: marco de /erp/proyectos/{uuid}. Vive en el layout de esa ruta, así que no se remonta al ir y
// volver del visor. Hace esto:
//   1. dentro del iframe: manda `ucp:listo` y espera `erp:sesion` (solo de ERP_WEB_ORIGEN y de window.parent);
//      verifica que sea del proyecto de la ruta (TIE-6) y lo manda a POST /api/erp/sesion, que valida el token y
//      que el tenantId coincida; el token no se guarda en ningún lado;
//   2. con cada `erp:token`, POST /api/erp/sesion/renovar (TIE-8);
//   3. si pasa `vence` + 60 s sin token nuevo: «La sesión venció. Volvé a abrir desde el ERP» (IE-4, TIE-9);
//   4. `ucp:alto` con un ResizeObserver, como máximo uno cada 200 ms (TIE-10);
//   5. tema claro u oscuro, el que mande el ERP.
// Fuera del iframe (login de desarrollo, IE-11) usa la cookie si ya hay sesión. No importa src/server/ (PB-13).

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { crearEmisorDeAlto } from "@/lib/erp/alto";
import { aceptarMensajeDelErp, enviarAlErp, sesionEsDeLaRuta, textoDescarte, type ProyectoDelErp, type Tema } from "@/lib/erp/protocolo";
import { crearVigiaDeVencimiento, type VigiaDeVencimiento } from "@/lib/erp/vencimiento";
import { AvisoErp } from "./AvisoErp";

interface Marco {
  tema: Tema;
  /** Lo que mandó el ERP en `erp:sesion` (null fuera del iframe). */
  proyectoDelErp: ProyectoDelErp | null;
  embebido: boolean;
}

const ContextoMarco = createContext<Marco | null>(null);

export function useMarcoErp(): Marco {
  const marco = useContext(ContextoMarco);
  if (!marco) throw new Error("useMarcoErp fuera de MarcoErp");
  return marco;
}

type Estado =
  | { tipo: "conectando" }
  | { tipo: "validando" }
  | { tipo: "lista"; tema: Tema; proyecto: ProyectoDelErp | null }
  | { tipo: "fuera" }
  | { tipo: "rechazada"; texto: string }
  | { tipo: "vencida" };

async function postJson(ruta: string, cuerpo: unknown): Promise<Response> {
  return fetch(ruta, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo), credentials: "same-origin", cache: "no-store" });
}

const revocar = (motivo: string) => postJson("/api/erp/sesion/revocar", { motivo }).catch(() => undefined);

const nadaQueEscuchar = () => () => {};

export function MarcoErp({
  origenErp,
  proyectoUuid,
  loginDirecto,
  children,
}: {
  origenErp: string;
  proyectoUuid: string;
  loginDirecto: boolean;
  children: React.ReactNode;
}) {
  // ¿Está dentro de un iframe? En el servidor no se sabe (null).
  const embebido = useSyncExternalStore(
    nadaQueEscuchar,
    () => window.parent !== window,
    () => null,
  );
  const [estado, setEstado] = useState<Estado>({ tipo: "conectando" });
  const vigiaRef = useRef<VigiaDeVencimiento | null>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);

  // Vencimiento (IE-4): uno solo por marco.
  useEffect(() => {
    const vigia = crearVigiaDeVencimiento(() => {
      setEstado({ tipo: "vencida" });
      void revocar("vencida");
    });
    vigiaRef.current = vigia;
    return () => vigia.cancelar();
  }, []);

  // Fuera del iframe: solo con una sesión ya abierta (login de desarrollo).
  useEffect(() => {
    if (embebido !== false) return;
    let cancelado = false;
    (async () => {
      const r = await fetch("/api/erp/sesion", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (cancelado) return;
      if (!r?.ok) {
        setEstado({ tipo: "fuera" });
        return;
      }
      const { vence } = (await r.json()) as { vence: number };
      vigiaRef.current?.actualizar(vence);
      setEstado({ tipo: "lista", tema: "claro", proyecto: null });
    })();
    return () => {
      cancelado = true;
    };
  }, [embebido]);

  // Dentro del iframe: mensajes del ERP y `ucp:listo`.
  useEffect(() => {
    if (embebido !== true) return;
    let cancelado = false;
    const alRecibir = async (event: MessageEvent) => {
      const r = aceptarMensajeDelErp(event, { origen: origenErp, padre: window.parent });
      if (!r.ok) {
        console.warn(textoDescarte(r.motivo));
        return;
      }
      const m = r.mensaje;
      if (m.tipo === "erp:sesion") {
        if (!sesionEsDeLaRuta(m, proyectoUuid)) {
          setEstado({ tipo: "rechazada", texto: "El ERP mandó la sesión de otro proyecto." });
          return;
        }
        setEstado({ tipo: "validando" });
        const resp = await postJson("/api/erp/sesion", { accessToken: m.accessToken, tenantId: m.tenantId }).catch(() => null);
        if (cancelado) return;
        if (!resp?.ok) {
          const { error } = ((await resp?.json().catch(() => ({}))) ?? {}) as { error?: string };
          setEstado({
            tipo: "rechazada",
            texto: error === "tenant-distinto" ? "La carpintería del mensaje no coincide con la del usuario." : "No se pudo validar la sesión del ERP.",
          });
          return;
        }
        const { vence } = (await resp.json()) as { vence: number };
        vigiaRef.current?.actualizar(vence);
        setEstado({ tipo: "lista", tema: m.tema, proyecto: m.proyecto });
        return;
      }
      // erp:token: el ERP renovó el token.
      const resp = await postJson("/api/erp/sesion/renovar", { accessToken: m.accessToken }).catch(() => null);
      if (cancelado) return;
      if (resp?.ok) {
        const { vence } = (await resp.json()) as { vence: number };
        vigiaRef.current?.actualizar(vence);
      } else if (resp?.status === 401) {
        setEstado({ tipo: "rechazada", texto: "El token renovado no es del mismo usuario o no es válido." });
      }
      // 503 (JWKS caído) o red: la sesión sigue hasta su vencimiento; el próximo erp:token puede renovarla.
    };
    window.addEventListener("message", alRecibir);
    enviarAlErp(window.parent, { tipo: "ucp:listo", version: 1 }, origenErp);
    return () => {
      cancelado = true;
      window.removeEventListener("message", alRecibir);
    };
  }, [embebido, origenErp, proyectoUuid]);

  // ucp:alto (TIE-10). Sin ResizeObserver no se manda nada.
  useEffect(() => {
    const nodo = contenidoRef.current;
    if (embebido !== true || !nodo || typeof ResizeObserver === "undefined") return;
    const emisor = crearEmisorDeAlto((alto) => enviarAlErp(window.parent, { tipo: "ucp:alto", version: 1, alto }, origenErp));
    const observador = new ResizeObserver(() => emisor.medir(nodo.getBoundingClientRect().height));
    observador.observe(nodo);
    return () => {
      observador.disconnect();
      emisor.cancelar();
    };
  }, [embebido, origenErp]);

  const tema: Tema = estado.tipo === "lista" ? estado.tema : "claro";
  const marco = useMemo<Marco | null>(
    () => (estado.tipo === "lista" ? { tema: estado.tema, proyectoDelErp: estado.proyecto, embebido: embebido === true } : null),
    [estado, embebido],
  );

  let contenido: React.ReactNode;
  if (embebido === null || estado.tipo === "conectando") contenido = <AvisoErp titulo="Conectando con el ERP…" />;
  else if (estado.tipo === "validando") contenido = <AvisoErp titulo="Validando la sesión…" />;
  else if (estado.tipo === "vencida") contenido = <AvisoErp titulo="La sesión venció" texto="Volvé a abrir desde el ERP." />;
  else if (estado.tipo === "rechazada") contenido = <AvisoErp titulo="No se pudo abrir la sesión" texto={`${estado.texto} Volvé a abrir desde el ERP.`} />;
  else if (estado.tipo === "fuera") {
    contenido = (
      <AvisoErp titulo="Abrí esta pantalla desde el ERP" texto="Esta vista se usa dentro de la página del proyecto en el ERP.">
        {loginDirecto && (
          <a href="/ingresar" className="mt-4 inline-block underline">
            Ingresar con un usuario del ERP (solo desarrollo)
          </a>
        )}
      </AvisoErp>
    );
  } else contenido = <ContextoMarco.Provider value={marco}>{children}</ContextoMarco.Provider>;

  return (
    <div ref={contenidoRef} data-tema={tema} className={tema === "oscuro" ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"}>
      {contenido}
    </div>
  );
}
