import type { Metadata } from "next";
import { CsvPublishScreen } from "@/components/proto-csv/CsvPublishScreen";

export const metadata: Metadata = {
  title: "Publicar carga CSV (simulado) — Prototipo",
};

// /backoffice/csv/<id>/publicar: "Publicar" simulado y vista previa de QR (solo texto) y etiquetas.
export default async function CsvPublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CsvPublishScreen id={id} />;
}
