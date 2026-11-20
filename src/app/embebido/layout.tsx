import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarcoEmbebido } from "@/components/embebido/MarcoEmbebido";
import { origenesDelEntorno } from "@/lib/embebido/origenes";

export const metadata: Metadata = {
  title: "Guía de armado — embebida en el ERP",
};

// /embebido/*: lo que se ve dentro del iframe del ERP (docs/spec-integracion-erp-minima.md). Sin ERP_FRONT_ORIGENES
// el embebido está apagado y todo /embebido responde 404. Con ERP_MODO=simulado se avisa arriba, siempre (§9).
export default function EmbebidoLayout({ children }: { children: React.ReactNode }) {
  const origenes = origenesDelEntorno();
  if (origenes.length === 0) notFound();
  const simulado = process.env.ERP_MODO === "simulado";
  return (
    <>
      {simulado && (
        <p className="bg-amber-200 px-3 py-1 text-center text-xs font-semibold text-amber-900">
          ERP SIMULADO — datos de prueba, no es el ERP de Casa Mueble
        </p>
      )}
      <MarcoEmbebido origenes={origenes}>{children}</MarcoEmbebido>
    </>
  );
}
