"use client";

// IE-5: compuerta del visor embebido. Pide el .dae del último trabajo `success` del proyecto a
// /api/erp/proyectos/{uuid}/modelo (el servidor lo saca del zip guardado), arma el mueble en el navegador
// (`defDesdeModeloErp`), lo registra en lookup.ts con un blob: local y muestra el mismo visor y las mismas fichas
// que /prueba. El trabajo del modelo viene en la cabecera `x-ucp-trabajo`.
//
// IC-8 e IC-9 (docs/spec-importador-csv-envio.md): pide a la vez /listado. Si el trabajo tiene listado (y es el mismo
// trabajo del modelo), el mueble se arma con el CSV (`defDesdeListadoErp`) y se cruza con el .dae (`cruceErp`); si
// no (404 `sin-listado`), como antes, con `defDesdeModeloErp`. Cualquier otra falla del listado (red, 401, 500, otro
// trabajo) muestra un error y no registra nada: el próximo montaje lo vuelve a intentar (revisión del 21/11).

import Link from "next/link";
import { useEffect, useState } from "react";
import { claveErp, cruceErp, defDesdeListadoErp, defDesdeModeloErp, type CruceErp } from "@/lib/erp/defErp";
import { UUID } from "@/lib/erp/protocolo";
import { getErpFurnitureDef, registerErpFurniture } from "@/lib/lookup";
import { buildFurnitureModel } from "@/model/colladaModel";
import { NamedColladaLoader, skipTextures } from "@/model/namedColladaLoader";
import { useViewStore } from "@/store/viewStore";
import { ViewerLayout } from "../ViewerLayout";
import { AvisoErp } from "./AvisoErp";
import { pedirListado } from "./pedirListado";

type Estado = { tipo: "cargando" } | { tipo: "listo"; clave: string } | { tipo: "error"; titulo: string; texto: string };

const MENSAJES: Record<string, { titulo: string; texto: string }> = {
  "no-autenticada": { titulo: "La sesión venció", texto: "Volvé a abrir desde el ERP." },
  "no-encontrado": { titulo: "Todavía no hay un modelo", texto: "El proyecto no tiene un envío verificado." },
  "zip-invalido": { titulo: "El modelo no se puede abrir", texto: "El zip guardado no trae un .dae válido." },
  red: { titulo: "No se pudo cargar el modelo", texto: "Probá de nuevo en un rato." },
  listado: { titulo: "No se pudo leer el listado de piezas", texto: "Probá de nuevo en un rato." },
};

/** Clave del mueble ya registrado para este proyecto en este navegador (vuelta del visor a la ficha). */
const claveRegistrada = new Map<string, string>();
/** Cruce del listado con el modelo de cada proyecto ya cargado (null: el trabajo no tiene listado). */
const cruceRegistrado = new Map<string, CruceErp | null>();


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
        const pedidoListado = pedirListado(proyectoUuid, trabajoUuid);
        const texto = await r.text();
        const loader = new NamedColladaLoader();
        skipTextures(loader);
        const collada = loader.parse(texto, "/");
        if (!collada) throw new Error("dae ilegible");
        const modelo = buildFurnitureModel(collada.scene);
        const pedido = await pedidoListado;
        if (cancelado) return;
        if (pedido.tipo === "error") {
          setEstado({ tipo: "error", ...MENSAJES[pedido.motivo === "no-autenticada" ? "no-autenticada" : "listado"] });
          return;
        }
        const conListado = pedido.tipo === "listado" ? pedido.listado : null;
        const opciones = { trabajoUuid, nombre: "Modelo del ERP" };
        const def = conListado ? defDesdeListadoErp(modelo, conListado, opciones) : defDesdeModeloErp(modelo, opciones);
        cruceRegistrado.set(proyectoUuid, conListado ? cruceErp(modelo, def) : null);
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

/** IC-10: el cruce del listado con el modelo de un proyecto ya cargado; null si el trabajo no tiene listado. */
export function cruceDelProyecto(proyectoUuid: string): CruceErp | null | undefined {
  return cruceRegistrado.get(proyectoUuid);
}

/** La clave del modelo de un proyecto ya cargado en este navegador (para las fichas del visor). */
export function claveDelProyecto(proyectoUuid: string): string | undefined {
  return claveRegistrada.get(proyectoUuid);
}
