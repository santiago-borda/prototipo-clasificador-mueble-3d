"use client";

// IE-5: compuerta del visor embebido. Pide el .dae del último trabajo `success` del proyecto a
// /api/erp/proyectos/{uuid}/modelo (el servidor lo saca del zip guardado), arma el mueble en el navegador
// (`defDesdeModeloErp`), lo registra en lookup.ts con un blob: local y muestra el mismo visor y las mismas fichas
// que /prueba. El trabajo del modelo viene en la cabecera `x-ucp-trabajo`.

import Link from "next/link";
import { useEffect, useState } from "react";
import { claveErp, defDesdeModeloErp } from "@/lib/erp/defErp";
import { UUID } from "@/lib/erp/protocolo";
import { getErpFurnitureDef, registerErpFurniture } from "@/lib/lookup";
import { buildFurnitureModel } from "@/model/colladaModel";
import { NamedColladaLoader, skipTextures } from "@/model/namedColladaLoader";
import { useViewStore } from "@/store/viewStore";
import { ViewerLayout } from "../ViewerLayout";
import { AvisoErp } from "./AvisoErp";

type Estado = { tipo: "cargando" } | { tipo: "listo"; clave: string } | { tipo: "error"; titulo: string; texto: string };

const MENSAJES: Record<string, { titulo: string; texto: string }> = {
  "no-autenticada": { titulo: "La sesión venció", texto: "Volvé a abrir desde el ERP." },
  "no-encontrado": { titulo: "Todavía no hay un modelo", texto: "El proyecto no tiene un envío verificado." },
  "zip-invalido": { titulo: "El modelo no se puede abrir", texto: "El zip guardado no trae un .dae válido." },
  red: { titulo: "No se pudo cargar el modelo", texto: "Probá de nuevo en un rato." },
};

/** Clave del mueble ya registrado para este proyecto en este navegador (vuelta del visor a la ficha). */
const claveRegistrada = new Map<string, string>();

export function ModeloErpGate({ proyectoUuid, children }: { proyectoUuid: string; children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>(() => {
    const clave = claveRegistrada.get(proyectoUuid);
    return clave && getErpFurnitureDef(clave) ? { tipo: "listo", clave } : { tipo: "cargando" };
  });

  useEffect(() => {
    if (estado.tipo !== "cargando") return;
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/erp/proyectos/${encodeURIComponent(proyectoUuid)}/modelo`, { credentials: "same-origin", cache: "no-store" });
        if (cancelado) return;
        if (!r.ok) {
          const motivo = r.status === 401 ? "no-autenticada" : r.status === 404 ? "no-encontrado" : r.status === 422 ? "zip-invalido" : "red";
          setEstado({ tipo: "error", ...MENSAJES[motivo] });
          return;
        }
        const trabajoUuid = r.headers.get("x-ucp-trabajo") ?? "";
        if (!UUID.test(trabajoUuid)) throw new Error("respuesta sin trabajo");
        const texto = await r.text();
        const loader = new NamedColladaLoader();
        skipTextures(loader);
        const collada = loader.parse(texto, "/");
        if (!collada) throw new Error("dae ilegible");
        const def = defDesdeModeloErp(buildFurnitureModel(collada.scene), { trabajoUuid, nombre: "Modelo del ERP" });
        const modelUrl = URL.createObjectURL(new Blob([texto], { type: "model/vnd.collada+xml" }));
        const clave = claveErp(trabajoUuid);
        const registrado = registerErpFurniture(clave, { ...def, modelUrl }, `/erp/proyectos/${encodeURIComponent(proyectoUuid)}/visor`);
        claveRegistrada.set(proyectoUuid, clave);
        // Antes de mostrar el visor: el primer render ya carga este mueble.
        useViewStore.getState().setSelectedQrId(registrado.furniture.qrId);
        if (!cancelado) setEstado({ tipo: "listo", clave });
      } catch {
        if (!cancelado) setEstado({ tipo: "error", ...MENSAJES["zip-invalido"] });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [estado.tipo, proyectoUuid]);

  if (estado.tipo === "error") {
    return (
      <AvisoErp titulo={estado.titulo} texto={estado.texto}>
        <Link href={`/erp/proyectos/${encodeURIComponent(proyectoUuid)}`} className="mt-4 inline-block underline">
          Volver al proyecto
        </Link>
      </AvisoErp>
    );
  }
  if (estado.tipo === "cargando") return <AvisoErp titulo="Cargando el modelo…" />;
  return <ViewerLayout embebido>{children}</ViewerLayout>;
}

/** La clave del modelo de un proyecto ya cargado en este navegador (para las fichas del visor). */
export function claveDelProyecto(proyectoUuid: string): string | undefined {
  return claveRegistrada.get(proyectoUuid);
}
