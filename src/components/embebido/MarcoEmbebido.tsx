"use client";

// IE-2 e IE-5: marco del iframe. Vive en src/app/embebido/layout.tsx, así que no se remonta al navegar dentro
// del iframe. Hace tres cosas:
//   1. fija el origen del padre (document.referrer, validado contra ERP_FRONT_ORIGENES; si no coincide o no hay
//      padre: «Abrí esta pantalla desde el ERP»). Se guarda en sessionStorage solo el origen (no es secreto) para
//      que una recarga dentro del iframe lo conserve; el token nunca se guarda;
//   2. escucha los mensajes del ERP con `aceptarMensajeDelErp` (lo demás se descarta y se registra sin contenido);
//   3. ofrece `pedirToken` (espera 10 s) y la renovación por el padre a las páginas.
// No importa src/server/ (PB-13): todo lo del servidor va por fetch a /api/embebido/*.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  aceptarMensajeDelErp,
  enviarAlErp,
  origenDelPadre,
  textoDescarte,
  type MensajePfg,
} from "@/lib/embebido/protocolo";
import { esperarToken, renovarPorElPadre, type PasosRenovacion } from "@/lib/embebido/renovacion";
import { AvisoEmbebido } from "./AvisoEmbebido";

const CLAVE_ORIGEN = "pfg:origenPadre";

interface Marco {
  /** Manda `pfg:listo` o `pfg:token-requerido` y espera `erp:token` (10 s). */
  pedirToken(tipo: MensajePfg["tipo"]): Promise<string>;
  /** Pasos de la renovación por el padre (IE-5), para `conUnaRenovacion`. */
  pasos: PasosRenovacion;
  /** Una renovación completa. Las páginas la usan cuando el servidor dice «token vencido». */
  renovar(): Promise<"renovada" | "fallida">;
  /** Renovaciones seguidas sin una carga buena en el medio (para «recarga una vez»). */
  renovacionesSeguidasRef: { current: number };
}

const ContextoMarco = createContext<Marco | null>(null);

export function useMarcoEmbebido(): Marco {
  const marco = useContext(ContextoMarco);
  if (!marco) throw new Error("useMarcoEmbebido fuera de MarcoEmbebido");
  return marco;
}

async function postJson(ruta: string, cuerpo: unknown): Promise<Response> {
  return fetch(ruta, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo), credentials: "same-origin" });
}

function leerOrigenGuardado(origenes: readonly string[]): string | null {
  try {
    const guardado = window.sessionStorage.getItem(CLAVE_ORIGEN);
    return guardado && origenes.includes(guardado) ? guardado : null;
  } catch {
    return null;
  }
}

/** Origen del padre en el navegador: referrer validado o, tras una recarga dentro del iframe, el guardado. */
function calcularOrigen(origenes: readonly string[]): string | null {
  if (window.parent === window) return null;
  return origenDelPadre(document.referrer, origenes) ?? leerOrigenGuardado(origenes);
}

const nadaQueEscuchar = () => () => {};

export function MarcoEmbebido({ origenes, children }: { origenes: readonly string[]; children: React.ReactNode }) {
  // 1. Origen del padre: en el servidor no se sabe («verificando»); en el navegador se calcula una vez.
  //    `""` = sin padre válido (useSyncExternalStore necesita un valor comparable).
  const origen = useSyncExternalStore(
    nadaQueEscuchar,
    () => calcularOrigen(origenes) ?? "",
    () => null,
  );
  const [cerrada, setCerrada] = useState(false);
  const oyentes = useRef(new Set<(token: string) => void>());
  const renovacionesSeguidasRef = useRef(0);

  // Solo para que una recarga dentro del iframe conserve el origen (no es secreto; el token nunca se guarda).
  useEffect(() => {
    if (!origen) return;
    try {
      window.sessionStorage.setItem(CLAVE_ORIGEN, origen);
    } catch {
      // Sin sessionStorage (bloqueado en el iframe): sigue andando mientras no se recargue.
    }
  }, [origen]);

  const revocar = useCallback(async (motivo: string) => {
    await postJson("/api/embebido/sesion/revocar", { motivo }).catch(() => undefined);
  }, []);

  // 2. Mensajes del ERP.
  useEffect(() => {
    const alRecibir = (event: MessageEvent) => {
      const r = aceptarMensajeDelErp(event, { origenes, padre: window.parent === window ? null : window.parent });
      if (!r.ok) {
        console.warn(textoDescarte(r.motivo));
        return;
      }
      if (r.mensaje.tipo === "erp:token") {
        for (const fn of [...oyentes.current]) fn(r.mensaje.token);
      } else {
        void revocar("erp-salir");
        setCerrada(true);
      }
    };
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, [origenes, revocar]);

  const pedirToken = useCallback(
    (tipo: MensajePfg["tipo"]) =>
      esperarToken(
        () => {
          // Los hijos solo se muestran con un origen válido; los efectos del hijo corren antes que los de este marco.
          if (!origen) throw new Error("sin origen del padre");
          enviarAlErp(window.parent, { tipo, v: 1 }, origen, origenes);
        },
        (fn) => {
          oyentes.current.add(fn);
          return () => oyentes.current.delete(fn);
        },
      ),
    [origen, origenes],
  );

  const marco = useMemo<Marco>(() => {
    const pasos: PasosRenovacion = {
      pedirToken: () => pedirToken("pfg:token-requerido"),
      renovar: async (token) => (await postJson("/api/embebido/sesion/renovar", { token })).ok,
      revocar,
    };
    return { pedirToken, pasos, renovar: () => renovarPorElPadre(pasos), renovacionesSeguidasRef };
  }, [pedirToken, revocar]);

  if (origen === null) return <AvisoEmbebido titulo="Conectando con el ERP…" />;
  if (cerrada) return <AvisoEmbebido titulo="Se cerró la sesión en el ERP" texto="Volvé a abrir desde el ERP." />;
  if (origen === "") return <AvisoEmbebido titulo="Abrí esta pantalla desde el ERP" texto="Esta vista se usa dentro de la página del proyecto en el ERP." />;
  return <ContextoMarco.Provider value={marco}>{children}</ContextoMarco.Provider>;
}
