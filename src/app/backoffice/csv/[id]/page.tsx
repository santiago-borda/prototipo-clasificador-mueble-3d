import type { Metadata } from "next";
import { CsvReviewScreen } from "@/components/proto-csv/CsvReviewScreen";

export const metadata: Metadata = {
  title: "Revisión de carga CSV (spike) — Prototipo",
};

// /backoffice/csv/<id>: revisión (en revisión, aprobado, rechazado, publicado). Los datos se buscan en el navegador.
export default async function CsvReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CsvReviewScreen id={id} />;
}
