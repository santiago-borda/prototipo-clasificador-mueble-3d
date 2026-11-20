"use client";

// IE-3: entrada del iframe (/embebido?proyecto=<erpId>). Avisa al ERP que está lista (`pfg:listo`), recibe el token
// (`erp:token`), lo reenvía al servidor propio y navega al proyecto. El token vive en el navegador solo ese instante.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SinRespuestaDelErpError } from "@/lib/embebido/renovacion";
import { AvisoEmbebido } from "./AvisoEmbebido";
import { useMarcoEmbebido } from "./MarcoEmbebido";

type Estado = "esperando" | "validando" | "rechazada" | "sin-respuesta";

export function EntradaEmbebida({ proyecto }: { proyecto: string }) {
  const { pedirToken } = useMarcoEmbebido();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("esperando");
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return; // en desarrollo React corre los efectos dos veces
    iniciado.current = true;
    (async () => {
      try {
        const token = await pedirToken("pfg:listo");
        setEstado("validando");
        const r = await fetch("/api/embebido/sesion", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, proyecto }),
          credentials: "same-origin",
        });
        if (!r.ok) {
          setEstado("rechazada");
          return;
        }
        const { destino } = (await r.json()) as { destino: string };
        router.replace(destino);
      } catch (error) {
        setEstado(error instanceof SinRespuestaDelErpError ? "sin-respuesta" : "rechazada");
      }
    })();
  }, [pedirToken, proyecto, router]);

  if (estado === "rechazada") return <AvisoEmbebido titulo="No se pudo validar la sesión del ERP" texto="Volvé a abrir desde el ERP." />;
  if (estado === "sin-respuesta") return <AvisoEmbebido titulo="El ERP no respondió" texto="Volvé a abrir desde el ERP." />;
  return <AvisoEmbebido titulo={estado === "validando" ? "Validando la sesión…" : "Esperando al ERP…"} />;
}
