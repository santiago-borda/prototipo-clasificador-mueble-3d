import type { Metadata } from "next";
import { ImportForm } from "@/components/ImportForm";
import { importApiFromEnv } from "@/importer/config";

export const metadata: Metadata = {
  title: "Importar mueble (prueba) — Prototipo",
};

// Lee las variables de entorno en cada petición (no en el build): sin ellas la pantalla dice "no configurada".
export const dynamic = "force-dynamic";

export default function ImportPage() {
  const configured = importApiFromEnv(process.env).configured;
  return <ImportForm configured={configured} />;
}
