"use client";

// IE-5: la página del proyecto respondió «token vencido». Estado «renovando»: pide un token nuevo al ERP, lo manda a
// /api/embebido/sesion/renovar y recarga la página **una vez**. Si falla, si pasan 10 s o si después de recargar
// sigue vencido, la sesión se revoca y se muestra «Volvé a abrir desde el ERP».

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AvisoEmbebido } from "./AvisoEmbebido";
import { useMarcoEmbebido } from "./MarcoEmbebido";

export function RenovarSesion() {
  const { renovar, pasos, renovacionesSeguidasRef } = useMarcoEmbebido();
  const router = useRouter();
  const [fallida, setFallida] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    (async () => {
      if (renovacionesSeguidasRef.current >= 1) {
        // Ya se renovó y recargó una vez y sigue vencido.
        renovacionesSeguidasRef.current = 0;
        await pasos.revocar("sigue-vencido");
        setFallida(true);
        return;
      }
      renovacionesSeguidasRef.current += 1;
      if ((await renovar()) === "renovada") router.refresh();
      else {
        renovacionesSeguidasRef.current = 0;
        setFallida(true);
      }
    })();
  }, [pasos, renovar, renovacionesSeguidasRef, router]);

  if (fallida) return <AvisoEmbebido titulo="La sesión venció" texto="Volvé a abrir desde el ERP." />;
  return <AvisoEmbebido titulo="Renovando la sesión…" texto="Pidiendo al ERP una sesión nueva." />;
}

/** Marca una carga buena: la próxima vez que venza el token se puede volver a renovar. */
export function SesionVigente() {
  const { renovacionesSeguidasRef } = useMarcoEmbebido();
  useEffect(() => {
    renovacionesSeguidasRef.current = 0;
  }, [renovacionesSeguidasRef]);
  return null;
}

/** «Reintentar» cuando el ERP no respondió. */
export function Reintentar() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.refresh()} className="mt-4 rounded border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
      Reintentar
    </button>
  );
}
