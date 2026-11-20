"use client";

// IE-8: compuerta del visor embebido. Pide el .dae del Documento a /api/embebido/…/modelo (el servidor lo saca del
// zip del ERP, lo valida y registra su sha256), arma el mueble en el navegador (`defDesdeModeloErp`), lo registra en
// lookup.ts con un blob: local y muestra el mismo visor y las mismas fichas que /prueba. El archivo no se guarda.
// Si el token del ERP venció, renueva por el padre y reintenta una vez (IE-5).

import Link from "next/link";
import { useEffect, useState } from "react";
import { claveErp, defDesdeModeloErp } from "@/lib/embebido/defErp";
import { conUnaRenovacion } from "@/lib/embebido/renovacion";
import { getErpFurnitureDef, registerErpFurniture } from "@/lib/lookup";
import { buildFurnitureModel } from "@/model/colladaModel";
import { NamedColladaLoader, skipTextures } from "@/model/namedColladaLoader";
import { useViewStore } from "@/store/viewStore";
import { ViewerLayout } from "../ViewerLayout";
import { AvisoEmbebido } from "./AvisoEmbebido";
import { useMarcoEmbebido } from "./MarcoEmbebido";

type Estado = { tipo: "cargando" } | { tipo: "listo" } | { tipo: "error"; titulo: string; texto: string };

const MENSAJES: Record<string, { titulo: string; texto: string }> = {
  "no-autenticada": { titulo: "La sesión venció", texto: "Volvé a abrir desde el ERP." },
  "no-encontrado": { titulo: "No encontramos ese modelo", texto: "El Documento no existe en este proyecto o no es un zip con el modelo." },
  "zip-invalido": { titulo: "El modelo del ERP no se puede abrir", texto: "El zip no trae un .dae válido." },
  "erp-no-disponible": { titulo: "El ERP no respondió", texto: "Probá de nuevo en un rato." },
  "respuesta-invalida": { titulo: "El ERP respondió algo inesperado", texto: "Probá de nuevo en un rato." },
};

export function ModeloErpGate({
  erpId,
  docId,
  nombre,
  children,
}: {
  erpId: string;
  docId: string;
  nombre: string;
  children: React.ReactNode;
}) {
  const { pasos } = useMarcoEmbebido();
  const clave = claveErp(erpId, docId);
  const [estado, setEstado] = useState<Estado>(() => (getErpFurnitureDef(clave) ? { tipo: "listo" } : { tipo: "cargando" }));

  useEffect(() => {
    if (getErpFurnitureDef(clave)) return;
    let cancelado = false;
    const ruta = `/api/embebido/proyectos/${encodeURIComponent(erpId)}/documentos/${encodeURIComponent(docId)}/modelo`;
    (async () => {
      const cargar = async (): Promise<Response | "token-vencido"> => {
        const r = await fetch(ruta, { credentials: "same-origin", cache: "no-store" });
        if (r.status === 401) {
          const cuerpo = (await r.clone().json().catch(() => ({}))) as { error?: string };
          if (cuerpo.error === "token-erp-vencido") return "token-vencido";
        }
        return r;
      };
      try {
        const r = await conUnaRenovacion(cargar, pasos);
        if (cancelado) return;
        if (r === "fallida") {
          setEstado({ tipo: "error", ...MENSAJES["no-autenticada"] });
          return;
        }
        if (!r.ok) {
          const { error } = (await r.json().catch(() => ({}))) as { error?: string };
          setEstado({ tipo: "error", ...(MENSAJES[error ?? ""] ?? MENSAJES["erp-no-disponible"]) });
          return;
        }
        const texto = await r.text();
        const loader = new NamedColladaLoader();
        skipTextures(loader);
        const collada = loader.parse(texto, "/");
        if (!collada) throw new Error("dae ilegible");
        const def = defDesdeModeloErp(buildFurnitureModel(collada.scene), { erpProyectoId: erpId, documentoId: docId, nombre });
        const modelUrl = URL.createObjectURL(new Blob([texto], { type: "model/vnd.collada+xml" }));
        const base = `/embebido/proyectos/${encodeURIComponent(erpId)}/visor/${encodeURIComponent(docId)}`;
        const registrado = registerErpFurniture(clave, { ...def, modelUrl }, base);
        // Antes de mostrar el visor: el primer render ya carga este mueble.
        useViewStore.getState().setSelectedQrId(registrado.furniture.qrId);
        if (!cancelado) setEstado({ tipo: "listo" });
      } catch {
        if (!cancelado) setEstado({ tipo: "error", ...MENSAJES["zip-invalido"] });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clave, docId, erpId, nombre, pasos]);

  const volver = (
    <Link href={`/embebido/proyectos/${encodeURIComponent(erpId)}`} className="mt-4 inline-block underline">
      Volver al proyecto
    </Link>
  );
  if (estado.tipo === "error") return <AvisoEmbebido titulo={estado.titulo} texto={estado.texto}>{volver}</AvisoEmbebido>;
  if (estado.tipo === "cargando") return <AvisoEmbebido titulo="Cargando el modelo del ERP…" />;
  return <ViewerLayout sinPestanas>{children}</ViewerLayout>;
}
