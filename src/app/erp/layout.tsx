import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { origenWebDelEntorno } from "@/lib/erp/origenes";

export const metadata: Metadata = {
  title: "UCP — embebido en el ERP",
};

// /erp/*: lo que se ve dentro del iframe del ERP (docs/spec-integracion-erp-minima.md v0.3). Sin ERP_WEB_ORIGEN la
// integración está apagada y todo /erp responde 404. Con ERP_MODO=simulado se avisa arriba, siempre.
// `connection()`: se decide en cada pedido con el entorno del servidor, no con el del build.
export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (origenWebDelEntorno() === null) notFound();
  const simulado = process.env.ERP_MODO === "simulado";
  return (
    <>
      {simulado && (
        <p className="bg-amber-200 px-3 py-1 text-center text-xs font-semibold text-amber-900">
          ERP SIMULADO — datos de prueba, no es el ERP de Casa Mueble
        </p>
      )}
      {children}
    </>
  );
}
