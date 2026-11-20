import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FormIngresar } from "@/components/erp/FormIngresar";
import { origenWebDelEntorno } from "@/lib/erp/origenes";
import { leerLoginDirecto } from "@/server/erp/config";

export const metadata: Metadata = { title: "Ingresar con el ERP (solo desarrollo)" };

// IE-11: login directo, solo para desarrollo (ERP_LOGIN_DIRECTO=habilitado, prohibido con NODE_ENV=production). Con
// el ERP real es U-erp-real: requiere aprobación del equipo. Sin la variable, 404.
// `connection()`: con el entorno del servidor al recibir el pedido, no con el del build.
export default async function Ingresar() {
  await connection();
  if (!leerLoginDirecto() || origenWebDelEntorno() === null) notFound();
  const simulado = process.env.ERP_MODO === "simulado";
  return <FormIngresar simulado={simulado} />;
}
