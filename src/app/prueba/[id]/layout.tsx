import type { Metadata } from "next";
import { ImportedFurnitureGate } from "@/components/ImportedFurnitureGate";

export const metadata: Metadata = {
  title: "Mueble de prueba — Prototipo",
};

// /prueba/<id>: mueble importado desde /importar. Mismo visor 3D y fichas que /p/*; los datos se buscan en el navegador.
export default async function ImportLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImportedFurnitureGate importId={id}>{children}</ImportedFurnitureGate>;
}
